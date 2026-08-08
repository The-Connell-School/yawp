// Shared contract + system-prompt builder for the LLM Daily Pages Prompt
// Generator.
//
// The generator is a third way a teacher can start a Daily Pages assignment
// (alongside "Document" and "Assignment"): instead of browsing the fixed
// library, the teacher describes what they want and works with the LLM to draft
// brand-new prompts that match the *house style* of the library — a short,
// provocative one-or-two-sentence invitation to write, not an essay assignment.
//
// This file is framework-free (no server-only imports) so it can be unit tested
// and its types shared with the client. The route wires it to getLLMCompletion.

import { z } from 'zod';
import {
  COGNITIVE_MOVE_LABEL,
  COGNITIVE_MOVES,
  type LibraryPrompt,
  PROMPT_TYPE_LABEL,
  PROMPT_TYPES,
  SERIOUSNESS_LABEL,
  SERIOUSNESS_LEVELS,
} from './data';

/** One turn in the teacher <-> LLM conversation. */
export type GeneratorMessage = {
  role: 'user' | 'assistant';
  content: string;
};

/**
 * A finished, ready-to-assign Daily Pages prompt the LLM has drafted.
 *
 * Only `prompt` is load-bearing — it is the text that lands in the assignment.
 * The facet tags mirror the library's own vocabulary so a draft can be shown
 * with the same "Agree / disagree · Moderate" line a library row uses; when the
 * model tags a draft with something outside the vocabulary we drop the tag
 * rather than lose the draft.
 */
export const GeneratedPromptSchema = z.object({
  prompt: z.string().min(1),
  type: z.enum(PROMPT_TYPES).optional().catch(undefined),
  seriousness: z.enum(SERIOUSNESS_LEVELS).optional().catch(undefined),
  cognitiveMoves: z.array(z.enum(COGNITIVE_MOVES)).optional().catch(undefined),
});

export type GeneratedPrompt = z.infer<typeof GeneratedPromptSchema>;

/** How many distinct options we ask the model to draft each time. */
export const GENERATOR_OPTION_COUNT = 3;

/**
 * The model answers with this shape on every turn: a conversational `reply`
 * plus, when it has enough to draft, a set of distinct `options`. Keeping the
 * two separate lets the UI show the chat message and a pageable set of
 * assignable prompt cards. A legacy singular `prompt` object is coerced into
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
    options: options && options.length > 0 ? options : prompt ? [prompt] : [],
  }));

export type GeneratorResponse = z.infer<typeof GeneratorResponseSchema>;

/** How many turns of history we keep/forward to keep the request bounded. */
export const MAX_GENERATOR_MESSAGES = 24;

/**
 * Output token budget. Daily Pages drafts are one-liners, but the budget must
 * still comfortably fit `GENERATOR_OPTION_COUNT` options plus the reply — if the
 * model runs out of tokens mid-object the JSON is truncated and can't be parsed,
 * which is what leaks raw JSON into the chat.
 */
export const MAX_GENERATOR_OUTPUT_TOKENS = 1500;

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
 * Pick a small, type-diverse set of real corpus prompts to show the model
 * exactly what "in the style of the library" means. One prompt per type, and
 * within that we prefer a prompt whose seriousness hasn't been shown yet so the
 * examples don't all read heavy. Deterministic (stable type order, first
 * qualifying match) so tests and cached system prompts are stable.
 */
export function selectFewShotExamples(
  prompts: LibraryPrompt[]
): LibraryPrompt[] {
  const examples: LibraryPrompt[] = [];
  const usedSeriousness = new Set<string>();

  for (const type of PROMPT_TYPES) {
    const matches = prompts.filter((prompt) => prompt.type === type);
    if (matches.length === 0) continue;
    const fresh = matches.find(
      (prompt) => !usedSeriousness.has(prompt.seriousness)
    );
    const chosen = fresh ?? matches[0];
    usedSeriousness.add(chosen.seriousness);
    examples.push(chosen);
  }

  return examples;
}

function formatExample(prompt: LibraryPrompt, index: number): string {
  const moves = prompt.cognitiveMoves
    .map((move) => COGNITIVE_MOVE_LABEL[move])
    .join(', ');
  return [
    `Example ${index + 1} — type: ${prompt.type}, seriousness: ${prompt.seriousness}, moves: ${moves}`,
    prompt.prompt,
  ].join('\n');
}

/**
 * Build the system prompt that teaches the model the house style and pins its
 * output to the JSON contract above. `prompts` seeds the few-shot examples.
 */
export function buildGeneratorSystemPrompt(prompts: LibraryPrompt[]): string {
  const examples = selectFewShotExamples(prompts)
    .map(formatExample)
    .join('\n\n');

  const typeVocabulary = PROMPT_TYPES.map(
    (type) => `    - ${type} (${PROMPT_TYPE_LABEL[type]})`
  ).join('\n');
  const seriousnessVocabulary = SERIOUSNESS_LEVELS.map(
    (level) => `${level} (${SERIOUSNESS_LABEL[level]})`
  ).join(', ');
  const moveVocabulary = COGNITIVE_MOVES.map(
    (move) => `${move} (${COGNITIVE_MOVE_LABEL[move]})`
  ).join(', ');

  return [
    'You are a writing-curriculum assistant helping a teacher write a Daily',
    'Pages prompt. Daily Pages is a short, effort-based freewrite: every student',
    'in the class gets a blank document titled with the prompt and writes for a',
    'few minutes. Feedback is about ideas, never about correctness or scores.',
    '',
    'You collaborate: ask one brief clarifying question when the request is too',
    'vague to draft from (the text or unit, the grade level, how heavy the',
    'teacher wants it), and otherwise draft right away and refine as the teacher',
    'reacts.',
    '',
    'HOUSE STYLE — every prompt you draft must look like it came out of the',
    'library:',
    '  • One or two sentences. Short enough to read aloud in one breath.',
    '  • A claim, a question, or a provocation the student can push against —',
    '    often a statement followed by an invitation ("Agree or disagree.",',
    '    "Defend, complicate, or reject this.", "Which one is the real you?").',
    '  • Addressed to the student as "you", in plain, concrete language.',
    '  • No thesis statement, no formal essay structure, no rubrics,',
    '    no word counts, no numbered sub-questions, no "in 3 paragraphs".',
    '    This is not a thesis-driven essay assignment — it is an invitation to',
    '    think on the page.',
    '  • Open enough that two students could answer it in completely different',
    '    ways and both be right.',
    '',
    'Here are real prompts from the library. Match their tone, shape, and',
    'length:',
    '',
    examples,
    '',
    'TAGGING — tag each draft with the library\'s own vocabulary so it sits next',
    'to library prompts. Use ONLY these values:',
    '  • "type" — one of:',
    typeVocabulary,
    `  • "seriousness" — one of: ${seriousnessVocabulary}`,
    `  • "cognitiveMoves" — one or two of: ${moveVocabulary}`,
    '',
    'HOW TO WRITE THE "reply" (the chat message to the teacher — this is separate',
    'from the prompts themselves): keep it short, warm, and skimmable. Never a',
    'wall of text. Aim for 2–4 short lines. Use light Markdown to make it easy to',
    'scan:',
    '  • **bold** for the key idea or the choice you are offering,',
    '  • a short "- " bullet list when you lay out the angles or ask the teacher',
    '    to pick between things,',
    '  • blank lines between thoughts so it breathes.',
    'Lead with a bit of energy, then get to the point. Do not restate the prompts',
    'in the reply — the options already show them.',
    '',
    'Respond with STRICT JSON ONLY (raw JSON, not wrapped in code fences),',
    'matching this shape. The "reply" VALUE may contain the light Markdown above;',
    'the JSON envelope itself must be plain:',
    '{',
    '  "reply": string,   // short, lively Markdown message to the teacher',
    '  "options": [',
    '    {',
    '      "prompt": string,          // the full prompt a student would see',
    '      "type": string,            // from the type vocabulary above',
    '      "seriousness": string,     // from the seriousness vocabulary above',
    '      "cognitiveMoves": string[] // from the moves vocabulary above',
    '    }, …',
    '  ]',
    '}',
    `Whenever you have enough to draft, provide exactly ${GENERATOR_OPTION_COUNT} distinct`,
    'options that each take a genuinely different angle on the request — vary the',
    'type, the cognitive move, or the entry point so the teacher has a real',
    'choice, not three rewordings of the same idea. Return "options": [] only',
    'while you are still asking a clarifying question and have not drafted',
    'anything yet. Always include a friendly "reply".',
  ].join('\n');
}
