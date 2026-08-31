import * as Y from 'yjs';
import { COLLAB_FRAGMENT_FIELD } from './schema';

/**
 * Turning a collaborative draft into evidence a teacher can read.
 *
 * The panel this feeds is deliberately evidence and not an algorithm: every
 * automatic contribution metric fails on patterns that are common rather than
 * exotic. One student types while the group talks and takes 100% by volume; a
 * student who cuts 300 words and tightens the argument scores negative; the
 * person who writes the one sentence the others elaborate on scores ~2%. So this
 * produces what a teacher can look at and judge — who wrote which sentences, and
 * when each person worked — never a number that could be mistaken for a grade.
 *
 * Everything here is pure, so it is tested against real Yjs documents without a
 * browser or a database.
 *
 * The document is a `Y.XmlFragment`, not a `Y.Text`: that is the shape TipTap's
 * Collaboration extension stores. Each `Y.XmlText` inside it holds items that
 * permanently carry the id of the client that created them, which is what makes
 * authorship recoverable from the document itself.
 */

export type AttributedRun = {
  /** Null when no recorded client owns this text — stated, not guessed. */
  membershipId: string | null;
  text: string;
};

function decodeFragment(update: Uint8Array): Y.XmlFragment | null {
  try {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, update);
    return doc.getXmlFragment(COLLAB_FRAGMENT_FIELD);
  } catch {
    // Called on stored state that could be truncated or from a newer schema.
    // A panel that renders nothing beats a page that 500s.
    return null;
  }
}

/**
 * Walks one `Y.XmlText`, merging neighbouring items that belong to the same
 * person.
 *
 * The merge is not cosmetic. Yjs splits an item at every insertion point, so a
 * sentence typed normally is dozens of items; a span per item would be both
 * unreadable and enormous.
 */
function runsOfText(
  node: Y.XmlText,
  ownerOfClient: Map<string, string | null>
): AttributedRun[] {
  const runs: AttributedRun[] = [];

  for (let item = node._start; item; item = item.right) {
    if (item.deleted) continue;
    const content = (item.content as { str?: string }).str;
    if (typeof content !== 'string' || content.length === 0) continue;

    const membershipId = ownerOfClient.get(String(item.id.client)) ?? null;
    const last = runs[runs.length - 1];
    if (last && last.membershipId === membershipId) {
      last.text += content;
    } else {
      runs.push({ membershipId, text: content });
    }
  }

  return runs;
}

/**
 * The draft as a list of paragraphs, each a list of attributed runs.
 *
 * Paragraph structure is kept because the teacher is reading the actual draft —
 * a flat wall of tinted text would not be the document they assigned.
 */
export function attributedParagraphs({
  update,
  ownerOfClient,
}: {
  update: Uint8Array;
  ownerOfClient: Map<string, string | null>;
}): AttributedRun[][] {
  const fragment = decodeFragment(update);
  if (!fragment) return [];

  const paragraphs: AttributedRun[][] = [];

  const visit = (node: unknown) => {
    if (node instanceof Y.XmlText) {
      const runs = runsOfText(node, ownerOfClient);
      if (runs.length > 0) paragraphs.push(runs);
      return;
    }
    if (node instanceof Y.XmlElement || node instanceof Y.XmlFragment) {
      for (const child of node.toArray()) visit(child);
    }
  };

  visit(fragment);
  return paragraphs;
}

/**
 * Surviving characters per member — the headline number, and never shown alone.
 *
 * Counts only text still present, so a student who wrote and then deleted 500
 * words does not read as the biggest contributor. Deletions are reported
 * separately by `readDocumentAuthorship`, which is what keeps a reviser from
 * looking like they did nothing.
 */
export function survivingCharsByMember({
  update,
  ownerOfClient,
}: {
  update: Uint8Array;
  ownerOfClient: Map<string, string | null>;
}): Map<string | null, number> {
  const totals = new Map<string | null, number>();

  for (const paragraph of attributedParagraphs({ update, ownerOfClient })) {
    for (const run of paragraph) {
      totals.set(
        run.membershipId,
        (totals.get(run.membershipId) ?? 0) + run.text.length
      );
    }
  }

  return totals;
}
