import { getLLMCompletion } from '~/utils/getLLMCompletion';
import crypto from 'node:crypto';
import { parseFirstJsonValue } from '~/utils/llm-json.server';

import {
  buildFallbackPracticeFeedback,
  detectPracticeGuardrail,
  practiceFeedbackSchema,
  type PracticeFeedbackInput,
  type PracticeFeedbackResult,
} from './practice-feedback.shared';

const DEFAULT_MODEL = 'claude-sonnet-4-6';

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
  'Be accurate before you are kind. A student who is told a broken revision is',
  'correct learns the error. Work in this order:',
  '1. Decide whether the original error is actually gone in the revision.',
  '2. Decide whether the revision introduced a new instance of the same error.',
  '3. Only then choose a status.',
  'If the original error survives in any form, the status is "needs_revision" —',
  'no matter how much else the student changed, how much effort it shows, or',
  'how fluent it reads. Rewording around an error is not fixing it. When you',
  'are unsure whether the error is gone, choose "needs_revision" and say what',
  'to look at; never resolve doubt in favour of a pass.',
  '',
  'Never list a strength that is merely "you made a change" or "you attempted',
  'a revision" — a strength names something specific the student got right.',
  '',
  'Return ONLY valid JSON, no markdown, matching this schema:',
  '{',
  '  "status": "strong" | "developing" | "needs_revision",',
  '  "summary": string,        // one warm sentence on where the response stands',
  '  "strengths": string[],    // 0-3 specific things the student did well',
  '  "focus": string[],        // 1-3 specific, guiding next steps (hints, not the answer)',
  '  "encouragement": string   // one short encouraging sentence',
  '}',
  'Use "strong" ONLY when the error is fully fixed and no new instance of it',
  'was introduced. Use "developing" when the error is gone but the result is',
  'clumsy or the fix is incomplete elsewhere in the sentence. Use',
  '"needs_revision" whenever the core error remains.',
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
  input: PracticeFeedbackInput,
  attribution?: {
    organizationId?: string;
    membershipId?: string;
    classId?: string;
    route?: string;
    requestId?: string;
  }
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
      metadata: {
        feature: 'writing-practice-feedback',
        skill: input.skill,
        lessonTitle: input.lessonTitle,
      },
      attribution: {
        organizationId: attribution?.organizationId ?? null,
        membershipId: attribution?.membershipId ?? null,
        classId: attribution?.classId,
        route: attribution?.route ?? 'utils/writing-lessons/practice-feedback',
        requestId: attribution?.requestId ?? crypto.randomUUID(),
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
