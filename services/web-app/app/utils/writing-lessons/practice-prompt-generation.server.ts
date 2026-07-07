import { z } from 'zod';

import { getLLMCompletion } from '~/utils/getLLMCompletion';
import { parseFirstJsonValue } from '~/utils/llm-json.server';

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
  'Do NOT reuse the example sentences. Do NOT number them. Return ONLY valid JSON',
  'of the form: {"prompts":[{"exercise":string,"instruction":string}, ...]}.',
].join('\n');

function buildUserPrompt(input: {
  skill: string;
  lessonTitle: string;
  rule: string;
  exampleExercises: string[];
  count: number;
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

    return parsed.data.prompts.slice(0, input.count).map((prompt) => ({
      exercise: prompt.exercise.trim(),
      instruction: prompt.instruction.trim(),
    }));
  } catch {
    return [];
  }
}
