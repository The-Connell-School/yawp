/**
 * One more try at a deck the schema turned down.
 *
 * The model writes a deck blind: nothing tells it whether the JSON it produced
 * actually rendered. Left alone it will insist the deck is there and tell the
 * teacher to scroll. This closes that loop on the server — the broken JSON and
 * the exact validation errors go back to the model once, and a corrected deck
 * is spliced into the reply before anyone reads it.
 *
 * Failure is quiet by design: if the second pass is no better, the teacher gets
 * the same reply they would have gotten anyway, never a worse one.
 */
import {
  fenceSlideDeck,
  readSlideDeck,
  validateSlideDeck,
  type SlideDeck,
} from './slide-deck';

export type DeckRepairOutcome = 'none' | 'repaired' | 'unrepaired';

export type DeckRepair = {
  /** The reply to store and show — unchanged unless the deck was fixed. */
  reply: string;
  outcome: DeckRepairOutcome;
  /** Why the first deck failed, when it did. Worth logging. */
  reason?: string;
};

export function buildDeckRepairInstruction({
  json,
  reason,
}: {
  json: string;
  reason: string;
}): string {
  return `The slide deck you just wrote did not validate, so nothing rendered for the teacher. Fix it.

Validation errors:
${reason}

The deck you wrote:
${json}

Rules you have to satisfy:
- Every slide needs a non-empty "speakerNotes" string.
- Every slide needs "layout" (one of title, statement, bullets, compare, prompt, steps, quote, closing) and a "title" of at most 90 characters.
- statement, prompt, and quote slides need "body" (at most 320 characters). Not "prompt", not "text" — "body".
- bullets and steps slides need "bullets": 1 to 7 strings, each at most 200 characters.
- compare slides need "left" and "right", each { "label": string, "text": string }.
- quote slides may add "attribution". Any slide may add "minutes" as a number.
- Keep the wording short enough to read from the back of a room; move the talking into speakerNotes.

Return only the corrected JSON object for the whole deck — { "title": ..., "slides": [ ... ] }. No explanation, no apology, no commentary before or after it.`;
}

/** Pull a deck out of whatever shape the repair reply came back in. */
function readRepairedDeck(response: string): SlideDeck | null {
  const fenced = readSlideDeck(response);
  if (fenced.kind === 'deck') return fenced.deck;

  const bare = validateSlideDeck(response.trim());
  if (bare.ok) return bare.deck;

  const start = response.indexOf('{');
  const end = response.lastIndexOf('}');
  if (start !== -1 && end > start) {
    const sliced = validateSlideDeck(response.slice(start, end + 1));
    if (sliced.ok) return sliced.deck;
  }
  return null;
}

export async function repairSlideDeck({
  reply,
  repair,
}: {
  reply: string;
  /**
   * `reason` comes along so the caller can log why the deck failed. It is
   * schema vocabulary — field paths and rules — never the teacher's words.
   */
  repair: (attempt: {
    instruction: string;
    reason: string;
  }) => Promise<string>;
}): Promise<DeckRepair> {
  const outcome = readSlideDeck(reply);
  if (outcome.kind !== 'unreadable') return { reply, outcome: 'none' };

  let response: string;
  try {
    response = await repair({
      instruction: buildDeckRepairInstruction({
        json: outcome.json,
        reason: outcome.reason,
      }),
      reason: outcome.reason,
    });
  } catch {
    return { reply, outcome: 'unrepaired', reason: outcome.reason };
  }

  const deck = readRepairedDeck(response);
  if (!deck) return { reply, outcome: 'unrepaired', reason: outcome.reason };

  // A function replacement: the deck's own JSON can contain `$&` and friends,
  // which a string replacement would expand.
  const fixed = fenceSlideDeck(deck);
  return {
    reply: reply.replace(outcome.block, () => fixed),
    outcome: 'repaired',
    reason: outcome.reason,
  };
}
