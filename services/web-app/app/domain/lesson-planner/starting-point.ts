/**
 * Where a lesson conversation started.
 *
 * A tile sends its prompt as the teacher's first message, and until now nothing
 * downstream knew which tile that was. So "Make me an exit ticket" opened on the
 * same pinned "Look at my classes and tell me what they need work on" as a
 * blank lesson, with the model guessing four topics the teacher might have
 * taught. What the teacher came for decides what the opening should offer.
 *
 * The tile is recovered from the first message rather than stored: every
 * conversation already carries it, including ones started before this existed,
 * and a message the teacher typed themselves is simply no tile at all.
 */

/**
 * Tile wordings that have since been rewritten, so conversations started from
 * them are still recognised.
 */
export const LEGACY_STARTER_PROMPTS: Record<string, string> = {
  // Assumed the lesson had already happened. Most tickets are written ahead of
  // the class, so the tile now asks what the lesson is meant to teach.
  'exit-ticket':
    'Make me an exit ticket that shows whether my students actually got it — every part of it, not just the easy part. Ask me what the lesson taught first.',
};

/** The tile a conversation was opened from, or null when the teacher typed. */
export function startingPointOf(
  firstTeacherMessage: string | null | undefined,
  prompts: ReadonlyArray<{ id: string; prompt: string }>
): string | null {
  const text = firstTeacherMessage?.trim();
  if (!text) return null;
  const tile = prompts.find((prompt) => prompt.prompt.trim() === text);
  if (tile) return tile.id;
  const legacy = Object.entries(LEGACY_STARTER_PROMPTS).find(
    ([, prompt]) => prompt === text
  );
  return legacy?.[0] ?? null;
}

/**
 * Starts where "look at my classes and tell me what they need work on" is an
 * answer to the question being asked: the subject of the lesson is still open.
 * A teacher who typed their own opening keeps it too, as before.
 */
const DATA_OPENING_STARTS = new Set(['plan-a-lesson', 'plan-a-skill']);

export function pinsDataOpening(start: string | null): boolean {
  return start === null || DATA_OPENING_STARTS.has(start);
}

/** Tiles that ask for one piece to go with a lesson, not the lesson itself. */
export const SINGLE_PIECES = [
  'exit-ticket',
  'handout',
  'extra-practice',
  'slide-deck',
] as const;

export type SinglePiece = (typeof SINGLE_PIECES)[number];

export function singlePieceOf(start: string | null): SinglePiece | null {
  return (SINGLE_PIECES as readonly string[]).includes(start ?? '')
    ? (start as SinglePiece)
    : null;
}
