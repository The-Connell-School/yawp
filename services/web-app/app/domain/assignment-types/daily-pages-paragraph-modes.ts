/**
 * The kinds of paragraph a teacher can ask for in a Daily Pages entry.
 *
 * Daily Pages is short academic paragraph practice, and a teacher chooses the
 * move the class practices: analyzing, arguing a position, comparing, defining
 * a term, interpreting, evaluating, synthesizing. Each move wants its own
 * coaching and its own reading from the grader — a generic tutor supports the
 * student but will not steer them toward the skill the teacher picked.
 *
 * A type layers on top of what is already there rather than replacing it:
 *
 * - Grading keeps the one Daily Pages rubric and adds the type's guidance
 *   beside the writing time, just ahead of the essay. No new rubric, no new
 *   grading assistant to build.
 * - Tutoring keeps the module's own tutor instructions and adds the type's
 *   coaching after them.
 *
 * Rollout is one type at a time. A type is `enabled` only once its guidance is
 * written and checked against the calibration suite; until then a teacher does
 * not see it and the server refuses it. Analyze shipped first, then Argue a
 * position.
 *
 * The choice lives on the Assignment (`paragraphMode`), not the assignment
 * type, so the same teacher can run an analysis on Monday and an argument on
 * Thursday. Null means no type was chosen — every assignment written before
 * this existed — and then both layers are empty and nothing changes.
 */

export const PARAGRAPH_MODE_FIELD = 'paragraphMode';

export type ParagraphModeKey =
  | 'analyze'
  | 'argue'
  | 'compare'
  | 'define'
  | 'interpret'
  | 'evaluate'
  | 'synthesize';

export type ParagraphMode = {
  key: ParagraphModeKey;
  label: string;
  /** One line for the teacher choosing it. */
  description: string;
  /** Whether teachers can choose it yet. */
  enabled: boolean;
  /** Added to the grading prompt. Required once enabled. */
  gradingInstructions?: string;
  /** Added to the tutor's system prompt. Required once enabled. */
  tutorInstructions?: string;
};

const ANALYZE_GRADING_INSTRUCTIONS = [
  'The teacher asked for an analysis paragraph. The student should make a claim about how the text works, point to the specific words that show it, and explain how those words do what the student says they do.',
  'The model the student has been taught is Claim-Evidence-Analysis: a claim about the text, the evidence (a quotation or a precise reference), and the analysis that connects them. It is not the only acceptable form — a paragraph may open on the quotation, or weave evidence and analysis together — but a reader should find all three.',
  'The analysis is where this paragraph is won or lost. Explaining what a word or image does, and why it matters to the claim, is analysis. Restating the quotation in other words, summarizing the plot around it, or announcing that the quote "shows" the claim without saying how is not. Weigh this in Development of Thought: a paragraph whose evidence is never explained does not rise above Developing there, however apt the quotation.',
  'Depth of Thought reads the claim about the text: a claim that notices something the passage does not hand over scores higher than one any reader would reach first.',
].join('\n');

const ANALYZE_TUTOR_INSTRUCTIONS = [
  'Today the student is writing an analysis paragraph. Guide them toward the Claim-Evidence-Analysis model, one part at a time, and never write any part of it for them:',
  '',
  '1. Claim. Ask what they are saying about how the text works — not what happens in it. "Nick admires Gatsby" is a summary; "Nick\'s praise lets him keep his distance from Gatsby" is a claim about the text.',
  '',
  '2. Evidence. Ask for the exact words that show it: a short quotation, or the precise moment. If they have quoted a whole passage, ask which few words are doing the work.',
  '',
  '3. Analysis. This is the part students skip. Ask how those words show the claim: what does this word, image, or choice do that another would not? If the student restates the quotation in other words, point that out and ask the question again.',
  '',
  'If the student already has a shape that holds all three — opening on the quotation, say — do not make them rebuild it into this order. The model is a guide to what a reader needs, not a template.',
].join('\n');

const ARGUE_GRADING_INSTRUCTIONS = [
  'The teacher asked the student to argue a position. The student should take a position a reasonable reader could disagree with, give the strongest reason for it, and test it against a specific case: a situation, an example, or a moment in the text where the position might fail and does not, or holds only once it is narrowed.',
  'The model the student has been taught is Position-Reason-Test: the position, the reason that carries it, and the case that tests it. It is not the only acceptable form — a paragraph may open on the case, or let the test sharpen the position at the end — but a reader should find all three. A formal counterargument and rebuttal is not required in a paragraph written this quickly; facing the one case that tests the position is the move.',
  'Depth of Thought reads the position. A position no reader would dispute, or one that settles on "both sides have a point" without choosing, has not taken a position: it does not rise above Developing there, however even-handed it sounds. A position that names the condition under which it holds scores higher than one asserted without limits.',
  'Development of Thought reads the reason and the test. One reason developed well is worth more than three listed. A reason that only restates the position in other words is circular, not support. A position held up only by generalities — "people", "society", "in many situations" — and never tested against a specific case does not rise above Developing there.',
].join('\n');

const ARGUE_TUTOR_INSTRUCTIONS = [
  'Today the student is arguing a position. Guide them toward the Position-Reason-Test model, one part at a time, and never write any part of it for them:',
  '',
  '1. Position. Ask what they would say to someone who disagrees. If no one would disagree, it is not yet a position; if they are saying both sides have a point, ask which side they would choose if they had to.',
  '',
  '2. Reason. Ask for the strongest reason, not the most reasons. If they have listed several, ask which one they would keep if they could only keep one, and why that one.',
  '',
  '3. Test. Ask for one specific case — a situation, an example, or a moment in the text — where the position could fail. Does it hold there? If it only holds once it is narrowed, help them see that the narrower position is the stronger one.',
  '',
  'If the student already has a shape that holds all three — opening on the case, say — do not make them rebuild it into this order. The model is a guide to what a reader needs, not a template.',
].join('\n');

export const DAILY_PAGES_PARAGRAPH_MODES: readonly ParagraphMode[] = [
  {
    key: 'analyze',
    label: 'Analyze',
    description:
      'A claim about how the text works, the words that show it, and an explanation of how they do it (Claim-Evidence-Analysis).',
    enabled: true,
    gradingInstructions: ANALYZE_GRADING_INSTRUCTIONS,
    tutorInstructions: ANALYZE_TUTOR_INSTRUCTIONS,
  },
  {
    key: 'argue',
    label: 'Argue a position',
    description:
      'A position someone could disagree with, its strongest reason, and a specific case that tests it (Position-Reason-Test).',
    enabled: true,
    gradingInstructions: ARGUE_GRADING_INSTRUCTIONS,
    tutorInstructions: ARGUE_TUTOR_INSTRUCTIONS,
  },
  {
    key: 'compare',
    label: 'Compare',
    description:
      'Two things, narrowed to the one difference that matters, and why.',
    enabled: false,
  },
  {
    key: 'define',
    label: 'Define a term',
    description: 'A boundary drawn around a term, then tested with a hard case.',
    enabled: false,
  },
  {
    key: 'interpret',
    label: 'Interpret',
    description: 'A reading of what a passage means, defended from its words.',
    enabled: false,
  },
  {
    key: 'evaluate',
    label: 'Evaluate',
    description: 'A judgment that names the standard it judges by.',
    enabled: false,
  },
  {
    key: 'synthesize',
    label: 'Synthesize',
    description:
      'Two or more sources brought together into one point neither makes alone.',
    enabled: false,
  },
];

/**
 * Whether an assignment type takes a paragraph type at all: Daily Pages does,
 * and only while at least one type is switched on.
 */
export function offersParagraphModesForKind(
  kind: string | null | undefined
): boolean {
  return kind === 'daily_pages' && enabledParagraphModes().length > 0;
}

export function enabledParagraphModes(): ParagraphMode[] {
  return DAILY_PAGES_PARAGRAPH_MODES.filter((mode) => mode.enabled);
}

/** A switched-on type by key, or null for anything else. */
export function getParagraphMode(
  key: string | null | undefined
): ParagraphMode | null {
  if (!key) return null;
  return (
    DAILY_PAGES_PARAGRAPH_MODES.find(
      (mode) => mode.key === key && mode.enabled
    ) ?? null
  );
}

/**
 * The label for any stored type, switched on or not. For showing a teacher
 * what an existing assignment was set to; choosing a type still goes through
 * `getParagraphMode`, which only returns switched-on ones.
 */
export function paragraphModeLabel(
  key: string | null | undefined
): string | null {
  if (!key) return null;
  return DAILY_PAGES_PARAGRAPH_MODES.find((mode) => mode.key === key)?.label ?? null;
}

export type ParseParagraphModeResult =
  | { success: true; value: ParagraphModeKey | null }
  | { success: false; message: string };

/** Absent or blank means no type was chosen. */
export function parseParagraphMode(
  formData: FormData
): ParseParagraphModeResult {
  const raw = formData.get(PARAGRAPH_MODE_FIELD)?.toString().trim() ?? '';
  if (!raw) return { success: true, value: null };
  const mode = getParagraphMode(raw);
  if (!mode) {
    return { success: false, message: 'Paragraph type is not available.' };
  }
  return { success: true, value: mode.key };
}

/** The grading layer. Empty when no switched-on type is chosen. */
export function buildParagraphModeGradingBlock(
  key: string | null | undefined
): string {
  const mode = getParagraphMode(key);
  if (!mode?.gradingInstructions) return '';
  return `Paragraph type: ${mode.label}\n${mode.gradingInstructions}`;
}

/** The tutor layer. Empty when no switched-on type is chosen. */
export function buildParagraphModeTutorInstructions(
  key: string | null | undefined
): string {
  const mode = getParagraphMode(key);
  if (!mode?.tutorInstructions) return '';
  return `PARAGRAPH TYPE: ${mode.label}\n${mode.tutorInstructions}`;
}
