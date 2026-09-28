/**
 * The teacher's per-assignment "is this graded for grammar and syntax" answer,
 * read off the assignment creation form.
 *
 * Three states, not two. Absent means the toggle was never shown — the
 * assignment type does not grade grammar — and records null so the rubric keeps
 * deciding. Only an explicit false drops the rubric's grammar category.
 */
export type ParseAssignmentGrammarGradingResult =
  | { success: true; value: boolean | null }
  | { success: false; message: string };

const AFFIRMATIVE = ['true', 'on', '1', 'yes'];
const NEGATIVE = ['false', 'off', '0', 'no'];

export function parseAssignmentGrammarGrading(
  formData: FormData
): ParseAssignmentGrammarGradingResult {
  const values = formData
    .getAll('grammarGradingEnabled')
    .map((value) => value.toString().trim().toLowerCase())
    .filter(Boolean);
  // An unchecked checkbox sends only its hidden "false" companion; a checked
  // one sends both, in that order. The last value is the real answer.
  const raw = values.at(-1);

  if (!raw) return { success: true, value: null };
  if (AFFIRMATIVE.includes(raw)) return { success: true, value: true };
  if (NEGATIVE.includes(raw)) return { success: true, value: false };

  return {
    success: false,
    message: 'Grammar grading value is invalid.',
  };
}
