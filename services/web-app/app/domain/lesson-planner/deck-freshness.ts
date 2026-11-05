/**
 * Do the slides still match the lesson? (Kevin, Oct 25, note 9.)
 *
 * The first time a deck is seen, the lesson stores a key of the deck and the
 * steps it went with (`deckStackKey`). When the steps change and the deck has
 * not, the slides are behind the lesson. A new deck, or the teacher keeping
 * these slides, starts the key again.
 */

type KeyedStep = { id: string; minutes: number | null; kind: string };

function hash(text: string): string {
  let value = 5381;
  for (let index = 0; index < text.length; index += 1) {
    value = ((value << 5) + value + text.charCodeAt(index)) | 0;
  }
  return (value >>> 0).toString(36);
}

/** The steps, in order, with their minutes: the deck itself is not one of them. */
export function stackKeyOf(steps: KeyedStep[]): string {
  return hash(
    steps
      .filter((step) => step.kind !== 'slides')
      .map((step) => `${step.id}:${step.minutes ?? ''}`)
      .join('|')
  );
}

export function deckKeyOf(deck: { id: string; content: string }, steps: KeyedStep[]): string {
  return `${deck.id}.${hash(deck.content)}.${stackKeyOf(steps)}`;
}

/**
 * `store`: the key to save, when it should change (a first deck, a new deck).
 * `stale`: the deck is the same and the steps are not.
 */
export function deckFreshness(
  stored: string | null,
  current: string | null
): { stale: boolean; store: string | null } {
  if (!current) return { stale: false, store: null };
  if (!stored) return { stale: false, store: current };
  const deckPart = (key: string) => key.slice(0, key.lastIndexOf('.'));
  if (deckPart(stored) !== deckPart(current)) return { stale: false, store: current };
  return { stale: stored !== current, store: null };
}
