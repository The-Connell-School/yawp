// Shared contract + system-prompt builder for the LLM Thesis Prompt Generator.
//
// The generator is the third way a teacher can start a Thesis-Driven Essay
// assignment (alongside "Document" and "Assignment"): instead of browsing the
// fixed library, the teacher describes what they want and works with the LLM to
// draft a brand-new prompt that matches the *house style* of the library —
// the same opening directive / find-your-own-angle / formal-organization shape
// every library prompt uses.
//
// This file is framework-free (no server-only imports) so it can be unit tested
// and its types shared with the client. The route wires it to getLLMCompletion.

import { z } from 'zod';
import {
  CATEGORY_LABEL,
  type ThesisCategory,
  type ThesisPrompt,
} from './data';

/** One turn in the teacher <-> LLM conversation. */
export type GeneratorMessage = {
  role: 'user' | 'assistant';
  content: string;
};

/**
 * A finished, ready-to-use prompt the LLM has drafted. Present only once the
 * conversation has produced something the teacher could assign as-is.
 */
export const GeneratedPromptSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
});

export type GeneratedPrompt = z.infer<typeof GeneratedPromptSchema>;

/** How many distinct options we ask the model to draft each time. */
export const GENERATOR_OPTION_COUNT = 3;

/**
 * The model answers with this shape on every turn: a conversational `reply`
 * plus, when it has enough to draft, a set of distinct `options`. Keeping the
 * two separate lets the UI show the chat message and a pageable set of
 * assignable prompt cards. A legacy singular `prompt` is coerced into
 * `options` so a stray older-style response still works.
 */
export const GeneratorResponseSchema = z
  .object({
    reply: z.string().min(1),
    options: z.array(GeneratedPromptSchema).optional(),
    prompt: GeneratedPromptSchema.nullable().optional(),
  })
  .transform(({ reply, options, prompt }) => ({
    reply,
    options:
      options && options.length > 0 ? options : prompt ? [prompt] : [],
  }));

export type GeneratorResponse = z.infer<typeof GeneratorResponseSchema>;

/** How many turns of history we keep/forward to keep the request bounded. */
export const MAX_GENERATOR_MESSAGES = 24;

/**
 * Output token budget. Must comfortably fit `GENERATOR_OPTION_COUNT` full
 * multi-paragraph prompts plus the reply — if the model runs out of tokens
 * mid-object the JSON is truncated and can't be parsed, so keep this generous.
 */
export const MAX_GENERATOR_OUTPUT_TOKENS = 4000;

/** Longest single teacher message we accept, in characters. */
export const MAX_GENERATOR_MESSAGE_LENGTH = 4000;

/**
 * The Anthropic model to use, mirroring the rubric-extract route: honor
 * `AI_MODEL` when it points at a Claude model, otherwise fall back to a stable
 * default. getLLMCompletion handles provider fallback from here.
 */
export function resolveGeneratorModel(
  env: Record<string, string | undefined> = process.env
): string {
  const configured = env.AI_MODEL?.trim();
  return configured && configured.includes('claude')
    ? configured
    : 'claude-sonnet-4-6';
}

/**
 * Pick a small, category-diverse set of real corpus prompts to show the model
 * exactly what "in the style and format of the library" means. Deterministic
 * (first match per category, stable category order) so tests are stable.
 */
export function selectFewShotExamples(
  prompts: ThesisPrompt[],
  perCategoryLimit = 1
): ThesisPrompt[] {
  const order: ThesisCategory[] = [
    'general',
    'theme',
    'single-text',
    'applied-to-text',
    'history-subject',
  ];
  const examples: ThesisPrompt[] = [];
  for (const category of order) {
    const matches = prompts.filter((p) => p.category === category);
    examples.push(...matches.slice(0, perCategoryLimit));
  }
  return examples;
}

/**
 * Build the system prompt that teaches the model the house style and pins its
 * output to the JSON contract above. `prompts` seeds the few-shot examples.
 */
export function buildGeneratorSystemPrompt(prompts: ThesisPrompt[]): string {
  const examples = selectFewShotExamples(prompts)
    .map((example, index) =>
      [
        `Example ${index + 1} — category: ${CATEGORY_LABEL[example.category]}`,
        `Title: ${example.title}`,
        'Prompt:',
        example.prompt,
      ].join('\n')
    )
    .join('\n\n');

  return [
    'You are a writing-curriculum assistant helping a teacher draft a prompt for',
    'a formal, thesis-driven critical essay. You collaborate: ask a brief',
    'clarifying question when the request is vague (topic, text, grade level,',
    'the cognitive move you want), and otherwise draft a prompt right away and',
    'refine it as the teacher reacts.',
    '',
    'Every prompt you draft MUST match the house style of the existing library,',
    'which always has three parts, in this order:',
    '  1. An opening directive that names the task and topic, e.g. "Write a',
    '     thesis-driven critical essay on…" or "Write an essay about…".',
    '  2. A "find your own angle" middle paragraph that gives the student room to',
    '     explore what they actually care about. Invite them to take an original',
    '     position and to "go where the emotional charge is" — what moved them,',
    '     grabbed them, or upset them — rather than answering an assigned thesis.',
    '  3. A closing sentence about formal organization, worded like: "Your essay',
    '     should be organized formally, with an introduction, thesis statement,',
    '     body paragraphs, and a conclusion."',
    '',
    'Voice: warm, direct, addressed to the student as "you". Multi-paragraph',
    '(use blank lines between the three parts). Do not include rubrics, word',
    'counts, or numbered sub-questions. Keep the topic front and center.',
    '',
    'Here are real prompts from the library. Match their tone, shape, and length:',
    '',
    examples,
    '',
    'HOW TO WRITE THE "reply" (the chat message to the teacher — this is separate',
    'from the prompt bodies): keep it short, warm, and skimmable. Never a wall of',
    'text. Aim for 2–4 short lines. Use light Markdown to make it easy to scan:',
    '  • **bold** for the key idea or the choice you are offering,',
    '  • a short "- " bullet list when you lay out the angles or ask the teacher',
    '    to pick between things,',
    '  • blank lines between thoughts so it breathes.',
    'Lead with a bit of energy, then get to the point. Do not restate the whole',
    'prompt in the reply — the options already show it.',
    '',
    'Respond with STRICT JSON ONLY (raw JSON, not wrapped in code fences),',
    'matching this shape. The "reply" VALUE may contain the light Markdown above;',
    'the JSON envelope itself must be plain:',
    '{',
    '  "reply": string,   // short, lively Markdown message to the teacher',
    '  "options": [ { "title": string, "body": string }, … ]',
    '}',
    `Whenever you have enough to draft, provide exactly ${GENERATOR_OPTION_COUNT} distinct`,
    'options that each take a genuinely different angle on the request — vary the',
    'focus, the cognitive move, or the entry point so the teacher has a real',
    'choice, not three rewordings of the same idea. Every option is a complete',
    'multi-paragraph prompt in the house style (all three parts) with its own',
    'short "title" like the example titles, and its "body" is the full prompt a',
    'student would receive. Return "options": [] only while you are still asking a',
    'clarifying question and have not drafted anything yet. Always include a',
    'friendly "reply".',
  ].join('\n');
}
