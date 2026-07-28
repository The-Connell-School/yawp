// System-prompt builder for the AP English Language prompt generator.
//
// See generated-prompt.ts for the wire contract and for why the generator is
// confined to Q3 argument prompts. This file is framework-free so it can be
// unit tested; the route wires it to getLLMCompletion.

import {
  AP_ENGLISH_LANG_DIFFICULTIES,
  GENERATOR_OPTION_COUNT,
} from './generated-prompt';

/** The slice of a library entry the few-shot selection needs. */
export type GeneratorExampleEntry = {
  externalKey: string;
  frqType: string;
  title: string;
  prompt: string;
  focusSkill: string;
  difficulty: string | null;
};

/** How many corpus prompts to show the model. */
const FEW_SHOT_LIMIT = 3;

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
 * Pick a small, skill-diverse set of real argument prompts so the model sees
 * exactly what an AP Lang Q3 looks like. Only argument prompts qualify — those
 * are the only ones it may draft. Deterministic (corpus order, first
 * qualifying match per focus skill) so tests and cached system prompts stay
 * stable.
 */
export function selectFewShotExamples<T extends GeneratorExampleEntry>(
  entries: T[]
): T[] {
  const examples: T[] = [];
  const usedSkills = new Set<string>();

  for (const entry of entries) {
    if (entry.frqType !== 'argument') continue;
    if (usedSkills.has(entry.focusSkill)) continue;
    usedSkills.add(entry.focusSkill);
    examples.push(entry);
    if (examples.length === FEW_SHOT_LIMIT) break;
  }

  return examples;
}

function formatExample(entry: GeneratorExampleEntry, index: number): string {
  return [
    `Example ${index + 1} — focus skill: ${entry.focusSkill}, difficulty: ${entry.difficulty ?? 'unspecified'}`,
    `Title: ${entry.title}`,
    entry.prompt,
  ].join('\n');
}

/**
 * Build the system prompt that teaches the model the AP Lang argument task and
 * pins its output to the JSON contract. `entries` seeds the few-shot examples.
 */
export function buildGeneratorSystemPrompt(
  entries: GeneratorExampleEntry[]
): string {
  const examples = selectFewShotExamples(entries)
    .map(formatExample)
    .join('\n\n');
  const difficultyVocabulary = AP_ENGLISH_LANG_DIFFICULTIES.join(', ');

  return [
    'You are an AP English Language and Composition curriculum assistant helping',
    'a teacher write a free-response prompt for their students.',
    '',
    'You draft Question 3 ARGUMENT prompts only. The student is given no',
    'passage and no sources: they argue a position from their own reading,',
    'observation, and experience.',
    '',
    'Do not invent source packets, passages, statistics, or quotations, and do',
    'not draft synthesis or rhetorical analysis prompts. Those questions require',
    'real provided text, and fabricated material attributed to real outlets or',
    'writers must never reach students. If the teacher asks for a synthesis or',
    'rhetorical analysis prompt, say plainly that those come from the curated',
    'library and offer to draft an argument prompt on the same topic instead.',
    '',
    'You collaborate: ask one brief clarifying question when the request is too',
    'vague to draft from (the unit, the grade level, how much scaffolding the',
    'class needs), and otherwise draft right away and refine as the teacher',
    'reacts.',
    '',
    'HOUSE STYLE — every prompt you draft must look like a real exam question:',
    '  • Open with a sentence or two of framing: an idea, a tension, or a',
    '    situation worth arguing about. Attribute a quotation only when it is',
    '    genuinely public domain and you are certain of the wording; otherwise',
    '    state the idea unattributed.',
    '  • Then the task line, in the exam\'s own register: "Write an essay that',
    '    argues your position on …".',
    '  • Defensible from more than one side. A student who disagrees with the',
    '    obvious answer must be able to write a strong essay.',
    '  • Answerable from a 16-year-old\'s reading, observation, and experience —',
    '    no specialist knowledge, no research required.',
    '  • Roughly 60–120 words. Concrete, unfussy language.',
    '  • Give each draft a short title, the way the library names its entries.',
    '',
    'The response is scored on the 6-point analytic rubric — Thesis (0–1),',
    'Evidence and Commentary (0–4), Sophistication (0–1) — so the prompt must',
    'invite a defensible thesis and give the student room to develop a line of',
    'reasoning, not just list examples.',
    '',
    'Here are real argument prompts from the library. Match their shape, register,',
    'and length:',
    '',
    examples,
    '',
    'TAGGING — tag each draft so it sits next to library entries. Use ONLY these',
    'values:',
    '  • "frqType" — always "argument"',
    `  • "difficulty" — one of: ${difficultyVocabulary}`,
    '  • "focusSkill" — a short kebab-case skill the prompt leans on, e.g.',
    '    line-of-reasoning, counterargument, defining-terms, qualifying-a-position,',
    '    evidence-specificity, stakeholder-analysis',
    '',
    'HOW TO WRITE THE "reply" (the chat message to the teacher — this is separate',
    'from the prompts themselves): keep it short, warm, and skimmable. Never a',
    'wall of text. Aim for 2–4 short lines. Use light Markdown to make it easy to',
    'scan:',
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
    '      "title": string,       // short library-style title',
    '      "prompt": string,      // the full prompt a student would see',
    '      "frqType": "argument",',
    '      "focusSkill": string,  // kebab-case, as described above',
    '      "difficulty": string   // from the difficulty vocabulary above',
    '    }, …',
    '  ]',
    '}',
    `Whenever you have enough to draft, provide exactly ${GENERATOR_OPTION_COUNT} distinct`,
    'options that each take a genuinely different angle on the request — vary the',
    'tension, the focus skill, or the entry point so the teacher has a real',
    'choice, not three rewordings of the same idea. Return "options": [] only',
    'while you are still asking a clarifying question and have not drafted',
    'anything yet. Always include a friendly "reply".',
  ].join('\n');
}
