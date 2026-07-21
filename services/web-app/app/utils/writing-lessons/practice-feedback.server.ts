import { getLLMCompletion } from '~/utils/getLLMCompletion';
import { parseFirstJsonValue } from '~/utils/llm-json.server';

import {
  buildFallbackPracticeFeedback,
  detectPracticeGuardrail,
  practiceFeedbackSchema,
  type PracticeFeedbackInput,
  type PracticeFeedbackResult,
} from './practice-feedback.shared';

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const FEEDBACK_REQUEST_DEADLINE_MS = 30_000;

const SYSTEM_PROMPT = [
  'You are a warm, sharp writing tutor for the Yawp! writing program.',
  'A high-school student is practicing one specific skill. You are given the',
  "skill, its rule, the practice prompt, and the student's revision.",
  '',
  'Follow the Yawp! philosophy: guide, do not do the work. Point out what the',
  'student did well and what to reconsider, but NEVER hand them the finished',
  'sentence. Speak directly to the student with "you" language. Be concise,',
  'encouraging, and never condescending.',
  '',
  'Judge ONLY whether the revision correctly applies this one skill. Do not',
  'nitpick unrelated issues.',
  '',
  'Return ONLY valid JSON, no markdown, matching this schema:',
  '{',
  '  "status": "strong" | "developing" | "needs_revision",',
  '  "summary": string,        // one warm sentence on where the response stands',
  '  "strengths": string[],    // 0-3 specific things the student did well',
  '  "focus": string[],        // 1-3 specific, guiding next steps (hints, not the answer)',
  '  "encouragement": string   // one short encouraging sentence',
  '}',
  'Use "strong" when the skill is applied correctly, "developing" when it is',
  'partly there, and "needs_revision" when the core error remains.',
].join('\n');

function buildUserPrompt(input: PracticeFeedbackInput): string {
  return [
    `Skill: ${input.skill}`,
    `Lesson: ${input.lessonTitle}`,
    '',
    'The rule for this skill:',
    input.rule,
    '',
    'Practice prompt:',
    input.exercise,
    '',
    'What the student was asked to do:',
    input.instruction,
    '',
    "The student's revision:",
    input.response,
  ].join('\n');
}

/**
 * Produces feedback on a single practice response.
 *
 * AI-primary: grounded tutor feedback via {@link getLLMCompletion}. Falls back
 * to deterministic guidance (flagged `degraded: true`) whenever the tutor is
 * unavailable, misconfigured, or returns output we cannot trust — mirroring the
 * outage-resilience used elsewhere in the grading stack.
 */
export async function generatePracticeFeedback(
  input: PracticeFeedbackInput
): Promise<PracticeFeedbackResult> {
  const guardrail = detectPracticeGuardrail(input);
  if (guardrail) return { ...guardrail, degraded: false };

  // Delegate provider selection (and Anthropic->OpenAI fallback) to
  // getLLMCompletion, exactly like the rest of the site's AI. If no provider is
  // configured or the call fails, the catch below returns degraded feedback.
  try {
    const responseText = await getLLMCompletion({
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserPrompt(input) }],
      model: process.env.AI_MODEL ?? DEFAULT_MODEL,
      temperature: 0.2,
      maxTokens: 600,
      allowFallbackProvider: false,
      logPayload: 'metadata-only',
      signal: AbortSignal.timeout(FEEDBACK_REQUEST_DEADLINE_MS),
      metadata: {
        feature: 'writing-practice-feedback',
        skill: input.skill,
        lessonTitle: input.lessonTitle,
      },
    });

    const parsed = practiceFeedbackSchema.safeParse(
      parseFirstJsonValue(responseText)
    );
    if (!parsed.success) {
      return { ...buildFallbackPracticeFeedback(input), degraded: true };
    }

    return { ...parsed.data, degraded: false };
  } catch {
    return { ...buildFallbackPracticeFeedback(input), degraded: true };
  }
}
