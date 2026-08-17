import {
  attributedParagraphs,
  survivingCharsByMember,
  type AttributedRun,
} from './contribution';
import { readDocumentAuthorship } from './authorship.server';
import { readRoomState } from './room-store.server';

/**
 * The read model behind the teacher's contribution panel.
 *
 * Two sources, deliberately: the document says who wrote the text that is still
 * there, and `DocumentCollabAuthor` says what each student did over time —
 * including the deletions and the sessions the document itself cannot show.
 * Neither alone is enough. Surviving text without deletions makes a reviser look
 * idle; totals without the document give a teacher numbers they cannot check.
 *
 * There is no percentage and no computed score here, and that is a product
 * decision rather than an omission — see the note in `contribution.ts`.
 */

export type ContributionMember = {
  membershipId: string;
  name: string;
  /** Characters of theirs still in the draft. */
  survivingChars: number;
  /** Everything they ever typed, including text later removed. */
  charsInserted: number;
  /** Characters they removed, whoever originally wrote them. */
  charsDeleted: number;
  /** Distinct editing sessions — the clearest signal of who actually showed up. */
  sessionCount: number;
  updateCount: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  hasWritten: boolean;
};

export type ContributionBreakdown = {
  members: ContributionMember[];
  paragraphs: AttributedRun[][];
  /** Text no recorded client owns, usually written before attribution existed. */
  unattributedChars: number;
};

export async function buildContributionBreakdown({
  documentId,
  roster,
}: {
  documentId: string;
  roster: { membershipId: string; name: string }[];
}): Promise<ContributionBreakdown> {
  const [state, authorship] = await Promise.all([
    readRoomState({ documentId }),
    readDocumentAuthorship({ documentId }),
  ]);

  const paragraphs = state
    ? attributedParagraphs({ update: state, ownerOfClient: authorship.ownerOfClient })
    : [];
  const surviving = state
    ? survivingCharsByMember({
        update: state,
        ownerOfClient: authorship.ownerOfClient,
      })
    : new Map<string | null, number>();

  const activity = new Map(
    authorship.byMember
      .filter((entry) => entry.membershipId !== null)
      .map((entry) => [entry.membershipId as string, entry])
  );

  // Driven by the roster, not by who wrote: a group member with nothing to their
  // name is the row a teacher most needs to see.
  const members: ContributionMember[] = roster.map((student) => {
    const entry = activity.get(student.membershipId);
    const survivingChars = surviving.get(student.membershipId) ?? 0;

    return {
      membershipId: student.membershipId,
      name: student.name,
      survivingChars,
      charsInserted: entry?.charsInserted ?? 0,
      charsDeleted: entry?.charsDeleted ?? 0,
      sessionCount: entry?.sessionCount ?? 0,
      updateCount: entry?.updateCount ?? 0,
      firstSeenAt: entry ? entry.firstSeenAt.toISOString() : null,
      lastSeenAt: entry ? entry.lastSeenAt.toISOString() : null,
      hasWritten: Boolean(entry) || survivingChars > 0,
    };
  });

  return {
    members,
    paragraphs,
    unattributedChars: surviving.get(null) ?? 0,
  };
}
