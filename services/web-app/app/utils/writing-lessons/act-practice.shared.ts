import { z } from 'zod';

/**
 * An ACT English–style practice question: a sentence with one underlined
 * portion and four answer choices, where choice A is always "NO CHANGE" (keep
 * the underlined text as written) and B–D are alternative replacements. Exactly
 * one choice is correct.
 *
 * `choices[0]` holds the original underlined text (it renders as "NO CHANGE").
 * `choices[1..3]` are the alternative replacements, rendered verbatim.
 */
export type ActPracticeQuestion = {
  id: string;
  /** The full sentence the student reads; contains `underline` as a substring. */
  sentence: string;
  /** The exact underlined portion under test. Equals `choices[0]`. */
  underline: string;
  /**
   * Four options. `choices[0]` is the "NO CHANGE" text; the rest are swaps.
   * Kept as `string[]` for ergonomic construction; the length-4 invariant is
   * enforced by `generatedActQuestionSchema` and `isRenderableActQuestion`.
   */
  choices: string[];
  /** Index (0–3) of the correct choice. */
  correctChoiceIndex: number;
  /** Short, ACT-style rationale shown after the student answers. */
  explanation: string;
};

/** Choice A is always presented to students as this label, ACT-style. */
export const NO_CHANGE_LABEL = 'NO CHANGE';

/**
 * Shape a model must return for one generated question, before we attach an id.
 * `choices` must have exactly four entries and `correctChoiceIndex` must point
 * at one of them.
 */
export const generatedActQuestionSchema = z.object({
  sentence: z.string().min(1),
  underline: z.string().min(1),
  choices: z.array(z.string().min(1)).length(4),
  correctChoiceIndex: z.number().int().min(0).max(3),
  explanation: z.string().min(1),
});

export type GeneratedActQuestion = z.infer<typeof generatedActQuestionSchema>;

/**
 * A question is renderable only if the underlined text actually appears in the
 * sentence (so we can highlight it) and the answer index is in range. Malformed
 * generated items are dropped rather than shown.
 */
export function isRenderableActQuestion(
  question: Pick<
    ActPracticeQuestion,
    'sentence' | 'underline' | 'choices' | 'correctChoiceIndex'
  >
): boolean {
  if (question.choices.length !== 4) return false;
  if (question.choices.some((choice) => choice.trim().length === 0)) {
    return false;
  }
  if (
    question.correctChoiceIndex < 0 ||
    question.correctChoiceIndex > 3 ||
    !Number.isInteger(question.correctChoiceIndex)
  ) {
    return false;
  }
  return question.sentence.includes(question.underline);
}

export type ActGradeResult = {
  correct: boolean;
  correctChoiceIndex: number;
  explanation: string;
};

/**
 * Deterministic grading: the answer is correct iff the selected index matches
 * the question's correct index. No model call — grading an ACT item is a
 * comparison, so feedback is instant and works offline.
 */
export function gradeActAnswer(
  question: Pick<ActPracticeQuestion, 'correctChoiceIndex' | 'explanation'>,
  selectedIndex: number
): ActGradeResult {
  return {
    correct: selectedIndex === question.correctChoiceIndex,
    correctChoiceIndex: question.correctChoiceIndex,
    explanation: question.explanation,
  };
}

/**
 * A persisted snapshot of one ACT answer: enough for a teacher to see exactly
 * what the student was shown, what they picked, and whether it was right —
 * without re-deriving anything from the (possibly changed) lesson content.
 * Stored in the attempt's `feedbackJson` column.
 */
export type ActAttemptRecord = {
  kind: 'act';
  sentence: string;
  underline: string;
  choices: string[];
  selectedChoiceIndex: number;
  correctChoiceIndex: number;
  correct: boolean;
  explanation: string;
};

export type UnderlineSplit = {
  before: string;
  underlined: string;
  after: string;
};

/**
 * Splits a sentence into the text before, at, and after the underlined portion
 * so the UI can highlight just that span. If the underline is not found
 * verbatim (or is blank), the whole sentence is returned as `before` with no
 * highlight, so rendering never throws.
 */
export function splitAroundUnderline(
  sentence: string,
  underline: string
): UnderlineSplit {
  const index = underline ? sentence.indexOf(underline) : -1;
  if (index === -1) {
    return { before: sentence, underlined: '', after: '' };
  }
  return {
    before: sentence.slice(0, index),
    underlined: underline,
    after: sentence.slice(index + underline.length),
  };
}
