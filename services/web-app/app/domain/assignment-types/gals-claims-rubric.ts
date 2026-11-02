import type {
  PromptConfigData,
  RubricData,
  RubricScoreLabel,
  ScoringScaleData,
} from './assignment-type-rubric.shared';

/**
 * GALS Claims: a low-stakes middle-school assignment where the student states
 * one sentence after "My claim:". The Grading Assistant judges that sentence
 * only, on two bands — Excellent and Needs Some Improvement.
 */

export const GALS_CLAIMS_ASSIGNMENT_TYPE_KIND = 'gals_claims';

export const GALS_CLAIMS_CATEGORY_KEY = 'my_claim';

export const GALS_CLAIMS_SCORE_LABELS: RubricScoreLabel[] = [
  { value: 0, label: 'Needs Some Improvement' },
  { value: 1, label: 'Excellent' },
];

export const GALS_CLAIMS_SCORING_SCALE: ScoringScaleData = {
  type: 'points_scale',
  minScore: 0,
  maxScore: 1,
};

export const GALS_CLAIMS_RUBRIC: RubricData = {
  categories: [
    {
      key: GALS_CLAIMS_CATEGORY_KEY,
      label: 'My claim',
      weight: 1,
      description:
        'The one sentence the student wrote after "My claim:". Excellent means the claim (1) answers the whole question, including both parts when the question has two parts, (2) is one complete sentence that says who or what it is about and what they do or are, and (3) states what the student thinks — an answer someone could disagree with, not the question repeated or a bare fact. Needs Some Improvement means one or more checks are missing, or there is no claim yet. Spelling, capital letters, and punctuation do not change the band when a reader can understand the claim.',
      scoreLabels: GALS_CLAIMS_SCORE_LABELS,
      feedbackEnabled: false,
      grammarHighlighting: false,
    },
  ],
};

export const GALS_CLAIMS_FEEDBACK_INSTRUCTIONS = [
  'Write feedback the student can read on their own: about a 3rd to 5th grade reading level, short sentences, everyday words, plain text.',
  '',
  'If Excellent: celebrate exactly what they did. Name the check they did best. You may add one small spelling or punctuation tip. Keep it under three sentences.',
  '',
  'If Needs Some Improvement: start with one true thing that is working. Then name the ONE most important thing to fix, using the check order above (whole question, then one complete sentence, then disagreeable opinion). Say what is missing and why. Give one clear next step. Never rewrite the claim for them. Fix one thing only, even if more than one check is missing.',
  '',
  'Never mention points, scores, or grades. Never mention a student\'s learning needs.',
].join('\n');

export const GALS_CLAIMS_PROMPT_CONFIG: PromptConfigData = {
  gradingInstructions: [
    'You are grading a GALS Claims assignment: super low stakes. The student was asked to write one sentence after the label "My claim:".',
    '',
    'Grade only that claim sentence. Ignore everything else in the submission, including setup sentences, reasons, or labels other than "My claim:".',
    '',
    'When grading context includes the extracted claim sentence, treat that text as the only evidence. When no claim is present, score Needs Some Improvement.',
    '',
    'Use exactly two bands:',
    '- 1, Excellent: the claim does all three checks — answers the whole question (both parts if the question has two parts); is one complete sentence about who or what and what they do or are; says what the student thinks (disagreeable, not the question repeated or a bare fact).',
    '- 0, Needs Some Improvement: missing one or more checks, or no claim yet.',
    '',
    'Spelling, capital letters, and punctuation do not change the band if a reader can understand the claim.',
    '',
    'Anchor your read in the assignment prompt when it is available: the claim should answer that question.',
    '',
    'Grading Assistant instructions',
    GALS_CLAIMS_FEEDBACK_INSTRUCTIONS,
  ].join('\n'),
};

const MY_CLAIM_LINE = /^\s*my claim\s*:\s*(.*)$/i;
const MY_CLAIM_INLINE = /my claim\s*:\s*([^\n]+)/i;

/** The sentence after "My claim:", or null when the label or claim is missing. */
export function extractGalsClaimSentence(documentText: string): string | null {
  const text = documentText.trim();
  if (!text) return null;

  for (const line of text.split(/\r?\n/)) {
    const match = line.match(MY_CLAIM_LINE);
    if (match) {
      const claim = match[1]?.trim() ?? '';
      return claim.length > 0 ? claim : null;
    }
  }

  const inline = text.match(MY_CLAIM_INLINE);
  const claim = inline?.[1]?.trim() ?? '';
  return claim.length > 0 ? claim : null;
}

/** Extra context for the grader: the claim sentence alone, or a missing-claim note. */
export function buildGalsClaimsGradingContext(
  documentText: string
): string | null {
  const claim = extractGalsClaimSentence(documentText);
  if (!claim) {
    return [
      'The student did not include a usable sentence after "My claim:" yet.',
      'Score Needs Some Improvement and coach them toward writing one complete claim sentence.',
    ].join(' ');
  }

  return [
    'Grade only this claim sentence (ignore the rest of the submission):',
    '',
    claim,
  ].join('\n');
}

export function isGalsClaimsAssignmentType(
  assignmentType: { kind?: string | null } | null | undefined
): boolean {
  return assignmentType?.kind === GALS_CLAIMS_ASSIGNMENT_TYPE_KIND;
}
