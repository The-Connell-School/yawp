/**
 * Suggestion chips for the planner's opening turn.
 *
 * The planner asks what to plan and what the room is like, and the single most
 * useful answer is "you tell me — look at the data". That option should be
 * there every time, in the same words, in the same place. Leaving it to the
 * model means it appears in a different form each run, or not at all, which is
 * exactly what a teacher who reaches for it every day does not want.
 *
 * So the app pins it. The model still adds the specifics only it can know —
 * real class names, plausible descriptions of the room — and those follow.
 */

/**
 * Always first on the opening turn. Phrased as something the teacher is saying,
 * because tapping a chip sends it as their message.
 */
export const STANDARD_OPENING_SUGGESTION =
  'Look at my classes and tell me what they need work on';

const MAX_SUGGESTIONS = 5;

function normalize(suggestion: string): string {
  return suggestion
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Phrases that mean the same thing as the standard option. When the model
// writes its own version, the pinned one replaces it rather than sitting
// beside it saying nearly the same words.
const SAME_INTENT = [
  'look at my class',
  'look at their grades',
  'check my class',
  'see my class list',
  'show me my class list',
  'pull the data',
  'pull real data',
  'decide what they need',
  'tell me what they need',
  'you pick the skill',
  'find the weakest',
];

function meansTheSameThing(suggestion: string): boolean {
  const normalized = normalize(suggestion);
  return SAME_INTENT.some((phrase) => normalized.includes(normalize(phrase)));
}

/**
 * Merge the model's suggestions with the pinned opening option.
 *
 * Only the opening reply gets the pin — later turns are about the lesson in
 * progress, where the model's own suggestions are the useful ones.
 */
export function withStandardSuggestions(
  suggestions: string[],
  { isOpeningReply }: { isOpeningReply: boolean }
): string[] {
  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const suggestion of suggestions) {
    const key = normalize(suggestion);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(suggestion);
  }

  if (!isOpeningReply) return deduped.slice(0, MAX_SUGGESTIONS);

  return [
    STANDARD_OPENING_SUGGESTION,
    ...deduped.filter(
      (suggestion) =>
        normalize(suggestion) !== normalize(STANDARD_OPENING_SUGGESTION) &&
        !meansTheSameThing(suggestion)
    ),
  ].slice(0, MAX_SUGGESTIONS);
}
