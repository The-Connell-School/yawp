import { z } from 'zod';

import { getLLMCompletion } from '~/utils/getLLMCompletion';
import { parseFirstJsonValue } from '~/utils/llm-json.server';
import { filterAppropriatePrompts } from './practice-content-safety';

const DEFAULT_MODEL = 'claude-sonnet-4-6';

export type GeneratedPracticePrompt = {
  exercise: string;
  instruction: string;
};

const generationSchema = z.object({
  prompts: z
    .array(
      z.object({
        exercise: z.string().min(1),
        instruction: z.string().min(1),
      })
    )
    .min(1),
});

const SYSTEM_PROMPT = [
  'You author short writing-practice items for the Yawp! writing program.',
  'Given one skill, its rule, and a few example practice sentences, invent NEW',
  'practice items that drill the same skill.',
  '',
  'Each item is:',
  '- "exercise": one short sentence a student will revise. It should exhibit the',
  '  exact issue the skill targets (or set up the task the examples imply), so a',
  '  student has something concrete to fix or write.',
  '- "instruction": one short line telling the student what to do.',
  '',
  'Vary the topics widely (music, sports, school life, technology, social issues,',
  'food, travel) and keep them engaging and age-appropriate for high schoolers.',
  'EXCEPTION: when the request names a student-chosen topic, ground every item',
  'in that topic instead — the student asked for practice about their own',
  'interest, and specificity to it is the point.',
  '',
  'CONTENT POLICY — these sentences are shown to students in a classroom, so',
  'every item MUST be school-appropriate. Never include profanity, slurs, sexual',
  'or suggestive content, graphic violence, weapons used to harm, self-harm or',
  'suicide, or drug/alcohol use. Keep the tone clean and classroom-safe.',
  '',
  'Do NOT reuse the example sentences. Do NOT number them. Return ONLY valid JSON',
  'of the form: {"prompts":[{"exercise":string,"instruction":string}, ...]}.',
].join('\n');

function buildUserPrompt(input: {
  skill: string;
  lessonTitle: string;
  rule: string;
  exampleExercises: string[];
  count: number;
  topic?: string;
}): string {
  const examples = input.exampleExercises
    .slice(0, 6)
    .map((exercise, index) => `${index + 1}. ${exercise}`)
    .join('\n');

  return [
    `Skill: ${input.skill}`,
    `Lesson: ${input.lessonTitle}`,
    '',
    'The rule for this skill:',
    input.rule,
    '',
    'Example practice sentences (for style only — do not repeat them):',
    examples || '(none)',
    '',
    ...(input.topic
      ? [
          `The student's chosen topic: ${input.topic}`,
          'Ground every item in that topic — it is what this student cares',
          'about. Stay school-appropriate even if the topic invites edginess.',
          '',
        ]
      : []),
    `Generate ${input.count} new, distinct practice items for this skill.`,
  ].join('\n');
}

/**
 * Generates novel practice prompts for a single skill, grounded in the lesson's
 * rule and existing prompts. Returns an empty array on any failure (missing
 * provider, bad output, API error) so callers can fall back to the static bank.
 */
export async function generatePracticePrompts(input: {
  skill: string;
  lessonTitle: string;
  rule: string;
  exampleExercises: string[];
  count: number;
  /** Optional student-chosen interest every generated item is grounded in. */
  topic?: string;
}): Promise<GeneratedPracticePrompt[]> {
  if (input.count <= 0) return [];

  try {
    const responseText = await getLLMCompletion({
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserPrompt(input) }],
      model: process.env.AI_MODEL ?? DEFAULT_MODEL,
      temperature: 0.9,
      maxTokens: 2000,
      metadata: {
        feature: 'writing-practice-prompt-generation',
        skill: input.skill,
        count: input.count,
      },
    });

    const parsed = generationSchema.safeParse(
      parseFirstJsonValue(responseText)
    );
    if (!parsed.success) return [];

    const trimmed = parsed.data.prompts.map((prompt) => ({
      exercise: prompt.exercise.trim(),
      instruction: prompt.instruction.trim(),
    }));

    // Hard content-safety gate: drop any item that trips the school-appropriate
    // screen before it can reach a student, then cap to the requested count.
    // If the model returns something off-policy, the caller simply gets fewer
    // (or zero) items and falls back to the static, human-authored bank.
    return filterAppropriatePrompts(trimmed).slice(0, input.count);
  } catch {
    return [];
  }
}
