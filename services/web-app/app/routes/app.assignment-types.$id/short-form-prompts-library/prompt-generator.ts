// Shared contract + system-prompt builder for the Daily Pages prompt generator.
//
// This is a separate generator from the Class Starter one
// (`../prompts-library/prompt-generator.ts`), and the reason is the whole point
// of the split. That generator is taught to produce "a short, effort-based
// freewrite" — an invitation to write, which is exactly right for a Class
// Starter and unusable here. A Daily Pages entry is graded on Depth of Thought
// and Development of Thought, so a prompt that stops at the invitation leaves
// those two scores with nothing to read. Pointing the old generator at Daily
// Pages would have kept producing the wrong shape under a new label.
//
// So the house style this teaches is the corpus's own rule: every draft asks
// for the backing as well as the opinion, and says where the finish line is.
//
// Framework-free (no server-only imports) so it can be unit tested and its
// types shared with the client. The route wires it to getLLMCompletion.

import { z } from 'zod';
import {
  COGNITIVE_MOVES,
  COGNITIVE_MOVE_LABEL,
  KIND_DESCRIPTION,
  KIND_LABEL,
  KIND_ORDER,
  LENGTH_TARGET_LABEL,
  LENGTH_TARGET_ORDER,
  SOURCE_NEED_LABEL,
  SOURCE_NEED_ORDER,
  type ShortFormPrompt,
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
 * The tags mirror the library's vocabulary so a draft can sit next to a corpus
 * row; a tag outside the vocabulary is dropped rather than losing the draft.
 */
export const GeneratedPromptSchema = z.object({
  prompt: z.string().min(1),
  kind: z.enum(KIND_ORDER).optional().catch(undefined),
  sourceNeed: z.enum(SOURCE_NEED_ORDER).optional().catch(undefined),
  lengthTarget: z.enum(LENGTH_TARGET_ORDER).optional().catch(undefined),
  cognitiveMoves: z.array(z.enum(COGNITIVE_MOVES)).optional().catch(undefined),
});

export type GeneratedPrompt = z.infer<typeof GeneratedPromptSchema>;

/** How many distinct options we ask the model to draft each time. */
export const GENERATOR_OPTION_COUNT = 3;

/**
 * The model answers with this shape on every turn: a conversational `reply`
 * plus, when it has enough to draft, a set of distinct `options`. A legacy
 * singular `prompt` object is coerced into `options` so a stray older-style
 * response still works.
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
 * Output token budget. These drafts carry a support clause and a length target,
 * so they run longer than a Class Starter one-liner — the budget must still
 * comfortably fit `GENERATOR_OPTION_COUNT` options plus the reply, because a
 * response truncated mid-object cannot be parsed and leaks raw JSON into chat.
 */
export const MAX_GENERATOR_OUTPUT_TOKENS = 2000;

/** Longest single teacher message we accept, in characters. */
export const MAX_GENERATOR_MESSAGE_LENGTH = 4000;

/**
 * Pick a small, kind-diverse set of real corpus prompts to show the model what
 * "in the style of the library" means. One per kind, preferring a prompt whose
 * source need has not been shown yet so the examples do not all assume a
 * reading. Deterministic, so the system prompt stays cacheable.
 */
export function selectFewShotExamples(
  prompts: ShortFormPrompt[]
): ShortFormPrompt[] {
  const examples: ShortFormPrompt[] = [];
  const usedSourceNeeds = new Set<string>();

  for (const kind of KIND_ORDER) {
    const matches = prompts.filter((prompt) => prompt.kind === kind);
    if (matches.length === 0) continue;
    const fresh = matches.find(
      (prompt) => !usedSourceNeeds.has(prompt.sourceNeed)
    );
    const chosen = fresh ?? matches[0];
    usedSourceNeeds.add(chosen.sourceNeed);
    examples.push(chosen);
  }

  return examples;
}

function formatExample(prompt: ShortFormPrompt, index: number): string {
  const moves = prompt.cognitiveMoves
    .map((move) => COGNITIVE_MOVE_LABEL[move])
    .join(', ');
  return [
    `Example ${index + 1} — kind: ${prompt.kind}, source: ${prompt.sourceNeed}, length: ${prompt.lengthTarget}, moves: ${moves}`,
    `Title: ${prompt.title}`,
    prompt.prompt,
  ].join('\n');
}

/**
 * Build the system prompt that teaches the model the house style and pins its
 * output to the JSON contract above. `prompts` seeds the few-shot examples.
 */
export function buildShortFormGeneratorSystemPrompt(
  prompts: ShortFormPrompt[]
): string {
  const examples = selectFewShotExamples(prompts)
    .map(formatExample)
    .join('\n\n');

  const kindVocabulary = KIND_ORDER.map(
    (kind) => `    - ${kind} (${KIND_LABEL[kind]}): ${KIND_DESCRIPTION[kind]}`
  ).join('\n');
  const sourceVocabulary = SOURCE_NEED_ORDER.map(
    (need) => `${need} (${SOURCE_NEED_LABEL[need]})`
  ).join(', ');
  const lengthVocabulary = LENGTH_TARGET_ORDER.map(
    (target) => `${target} (${LENGTH_TARGET_LABEL[target]})`
  ).join(', ');
  const moveVocabulary = COGNITIVE_MOVES.map(
    (move) => `${move} (${COGNITIVE_MOVE_LABEL[move]})`
  ).join(', ');

  return [
    'You are a writing-curriculum assistant helping a teacher write a Daily',
    'Pages prompt. Daily Pages is a short piece of writing that is GRADED — the',
    'way an essay is graded, at a fraction of the length. It is scored on depth',
    'of thought and how far the thinking develops, then on structure, voice, and',
    'grammar, and the writing is marked up for grammar and syntax.',
    '',
    'That grading is what constrains every prompt you draft.',
    '',
    'THE ONE RULE THAT MATTERS: every prompt must ask the student for the',
    'BACKING as well as the opinion — a reason, a specific, an example, a',
    'quotation, a case that tests the claim, a counterexample. A prompt that',
    'asks only what the student thinks is unusable here, because the score for',
    'development of thought would have nothing to read. Never draft a prompt',
    'that stops at the invitation.',
    '',
    'WHAT THIS IS NOT:',
    '  • Not a Class Starter. Those are effort-based freewrites, never marked',
    '    up, where "Agree or disagree" on its own is exactly right. Here, honest',
    '    effort alone earns the middle of the scale, so the prompt has to ask',
    '    for more than a reaction.',
    '  • Not a thesis-driven essay. No multi-paragraph directive, no required',
    '    thesis statement, no "introduction, body paragraphs, and a conclusion",',
    '    no research or outside evidence. This is fifteen minutes of writing.',
    '',
    'HOUSE STYLE — every prompt you draft must look like it came out of the',
    'library:',
    '  • One to three sentences. The ask, then what to back it with.',
    '  • Addressed to the student as "you" or in the imperative, in plain,',
    '    concrete language.',
    '  • Names what a finished answer contains, so the student knows when they',
    '    are done — the rubric never rewards length on its own, and a student',
    '    can only act on that if the prompt says where the finish line is.',
    '  • Open enough that two students could answer it differently and both be',
    '    right, but closed enough that a grader can tell a developed answer from',
    '    an undeveloped one.',
    '',
    'You collaborate: ask one brief clarifying question when the request is too',
    'vague to draft from (which text or unit, the grade level, whether the class',
    'has a reading in front of them), and otherwise draft right away and refine',
    'as the teacher reacts.',
    '',
    'Here are real prompts from the library. Match their shape, length, and the',
    'way each one asks for the backing:',
    '',
    examples,
    '',
    "TAGGING — tag each draft with the library's own vocabulary so it sits next",
    'to library prompts. Use ONLY these values:',
    '  • "kind" — one of:',
    kindVocabulary,
    `  • "sourceNeed" — one of: ${sourceVocabulary}. Be honest: if the prompt`,
    '    names a text or sends the student back into a passage, it is "required".',
    `  • "lengthTarget" — one of: ${lengthVocabulary}`,
    `  • "cognitiveMoves" — one or two of: ${moveVocabulary}`,
    '',
    'HOW TO WRITE THE "reply" (the chat message to the teacher — separate from',
    'the prompts themselves): keep it short, warm, and skimmable. Never a wall of',
    'text. Aim for 2–4 short lines. Use light Markdown to make it easy to scan:',
    '  • **bold** for the key idea or the choice you are offering,',
    '  • a short "- " bullet list when you lay out the angles,',
    '  • blank lines between thoughts so it breathes.',
    'Do not restate the prompts in the reply — the options already show them.',
    '',
    'Respond with STRICT JSON ONLY (raw JSON, not wrapped in code fences),',
    'matching this shape. The "reply" VALUE may contain the light Markdown above;',
    'the JSON envelope itself must be plain:',
    '{',
    '  "reply": string,   // short, lively Markdown message to the teacher',
    '  "options": [',
    '    {',
    '      "prompt": string,          // the full prompt a student would see',
    '      "kind": string,            // from the kind vocabulary above',
    '      "sourceNeed": string,      // from the source vocabulary above',
    '      "lengthTarget": string,    // from the length vocabulary above',
    '      "cognitiveMoves": string[] // from the moves vocabulary above',
    '    }, …',
    '  ]',
    '}',
    `Whenever you have enough to draft, provide exactly ${GENERATOR_OPTION_COUNT} distinct`,
    'options that each take a genuinely different angle — vary the kind, the',
    'move, or the entry point so the teacher has a real choice, not three',
    'rewordings of one idea. Return "options": [] only while you are still asking',
    'a clarifying question and have not drafted anything yet. Always include a',
    'friendly "reply".',
  ].join('\n');
}
