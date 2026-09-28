import { z } from 'zod';

/**
 * Structured feedback for a single writing-practice response.
 *
 * The shape is intentionally aligned with Yawp's lesson philosophy:
 * "guiding, not doing". Feedback names what worked and points at what to
 * reconsider, but it never hands the student the finished sentence.
 */
export type PracticeFeedbackStatus = 'strong' | 'developing' | 'needs_revision';

export const PRACTICE_FEEDBACK_STATUSES: PracticeFeedbackStatus[] = [
  'strong',
  'developing',
  'needs_revision',
];

export const practiceFeedbackSchema = z.object({
  status: z.enum(['strong', 'developing', 'needs_revision']),
  /** One warm sentence summarizing where the response stands. */
  summary: z.string().min(1),
  /** Concrete things the student did well (may be empty for a blank attempt). */
  strengths: z.array(z.string().min(1)).max(4),
  /** Specific, guiding next steps — hints, not the corrected sentence. */
  focus: z.array(z.string().min(1)).max(4),
  /** One encouraging sentence to keep the student practicing. */
  encouragement: z.string().min(1),
});

export type PracticeFeedback = z.infer<typeof practiceFeedbackSchema>;

/**
 * Full payload returned to the client. `degraded` marks feedback produced by
 * the deterministic fallback (AI unavailable) so the UI can label it as a
 * quick check rather than full tutor feedback.
 */
export type PracticeFeedbackResult = PracticeFeedback & {
  degraded: boolean;
};

/**
 * The `feedbackJson` payload persisted for a constructed-response (composition)
 * assigned-practice attempt: the prompt snapshot, the student's writing, and
 * the tutor feedback it earned. The `kind` discriminator keeps it distinct from
 * ACT attempt records sharing the same column.
 */
export type CompositionAttemptRecord = PracticeFeedbackResult & {
  kind: 'composition';
  exercise: string;
  instruction: string;
  response: string;
};

/**
 * Narrows an attempt's `feedbackJson` (typed `unknown` at the DB boundary) to
 * a composition attempt record.
 */
export function isCompositionAttemptRecord(
  value: unknown
): value is CompositionAttemptRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<CompositionAttemptRecord>;
  return (
    record.kind === 'composition' &&
    typeof record.response === 'string' &&
    typeof record.summary === 'string'
  );
}

export type PracticeFeedbackInput = {
  lessonTitle: string;
  /** Short concept label, e.g. "comma splices". */
  skill: string;
  /** The lesson's explicit rule text, used to ground the tutor. */
  rule: string;
  /** The practice sentence/prompt the student was asked to work on. */
  exercise: string;
  /** The specific instruction for this exercise. */
  instruction: string;
  /** The student's response. */
  response: string;
};

const STATUS_LABELS: Record<PracticeFeedbackStatus, string> = {
  strong: 'Strong work',
  developing: 'Coming along',
  needs_revision: 'Keep revising',
};

export function practiceFeedbackStatusLabel(
  status: PracticeFeedbackStatus
): string {
  return STATUS_LABELS[status];
}

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Cheap, no-AI guardrails that should never reach the tutor:
 * a blank response, or a response that is identical to the prompt.
 * Returns `null` when the response is worth sending on for real feedback.
 */
export function detectPracticeGuardrail(
  input: Pick<PracticeFeedbackInput, 'exercise' | 'response'>
): PracticeFeedback | null {
  const response = input.response.trim();

  if (response.length === 0) {
    return {
      status: 'needs_revision',
      summary: 'Add your revision so the tutor has something to look at.',
      strengths: [],
      focus: ['Rewrite the sentence in the box, then check it again.'],
      encouragement:
        'Give it a shot — a rough first attempt is enough to start.',
    };
  }

  if (normalize(response) === normalize(input.exercise)) {
    return {
      status: 'needs_revision',
      summary: 'This is still the original sentence — try changing it.',
      strengths: [],
      focus: [
        'Make at least one edit that applies the skill before checking again.',
      ],
      encouragement:
        "You've got the prompt in front of you; now make it yours.",
    };
  }

  return null;
}

/**
 * Deterministic feedback used when the AI tutor is unavailable.
 *
 * This path cannot tell a correct revision from an incorrect one — it only
 * knows the response is non-empty and changed. So it must never read as a
 * verdict: no "strengths" (praising a revision the check never evaluated is
 * what made a wrong answer look right), and a summary that says plainly it was
 * not checked. The status stays `needs_revision` so an unevaluated attempt can
 * never count as mastery in assigned practice, where only `strong` does.
 */
export function buildFallbackPracticeFeedback(
  input: PracticeFeedbackInput
): PracticeFeedback {
  const guardrail = detectPracticeGuardrail(input);
  if (guardrail) return guardrail;

  return {
    status: 'needs_revision',
    summary:
      'Your response was recorded, but the tutor is offline — nobody has checked whether it is correct yet.',
    strengths: [],
    focus: [
      `Re-read the rule for ${input.skill} and check your response against it yourself.`,
      'Read it aloud — does it sound complete and controlled?',
    ],
    encouragement:
      'Check again once the tutor is back to find out how you did.',
  };
}
