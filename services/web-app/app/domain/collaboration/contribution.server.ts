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
 * `survivingShare` is each student's percentage of the characters currently in
 * the draft. It is a proportion of *text*, not a measure of contribution, and the
 * distinction is load-bearing: one student typing while the group talks takes
 * most of the share, and the person who wrote the load-bearing sentence takes
 * very little. It is offered because "who did more" is a real question a teacher
 * needs a handle on, and it is deliberately never used to compute a grade — see
 * the note in `contribution.ts`.
 */

export type ContributionMember = {
  membershipId: string;
  name: string;
  /** Characters of theirs still in the draft. */
  survivingChars: number;
  /**
   * Their share of the draft's current characters, 0-100. Proportion of text,
   * not of contribution, and never an input to a grade.
   */
  survivingShare: number;
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
  /** Every character currently in the draft, the denominator for shares. */
  totalChars: number;
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

  // Every surviving character, including text with no recorded author, so the
  // shares describe the real document rather than only its attributed part.
  let totalChars = 0;
  for (const count of surviving.values()) totalChars += count;

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
      survivingShare:
        totalChars > 0 ? Math.round((survivingChars / totalChars) * 100) : 0,
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
    totalChars,
  };
}
