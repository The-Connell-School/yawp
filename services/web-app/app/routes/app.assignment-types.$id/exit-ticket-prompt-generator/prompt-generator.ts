// Exit ticket prompt generator contract + system prompt.
//
// Exit tickets are short, end-of-lesson checks — one idea, explain in their
// own words, no answer key. This generator drafts topic lines teachers can drop
// into a specific exit ticket (focus + topic) before the sheet composes the
// student-facing prompt.

import { z } from 'zod';
import {
  MAX_GENERATOR_MESSAGE_LENGTH,
  MAX_GENERATOR_MESSAGES,
  MAX_GENERATOR_OUTPUT_TOKENS,
  resolveGeneratorModel,
  type GeneratorMessage,
} from '../prompts-library/prompt-generator';

export {
  MAX_GENERATOR_MESSAGE_LENGTH,
  MAX_GENERATOR_MESSAGES,
  MAX_GENERATOR_OUTPUT_TOKENS,
  resolveGeneratorModel,
};
export type { GeneratorMessage };

export const GeneratedExitTicketOptionSchema = z.object({
  prompt: z.string().min(1),
  /** Optional hint for which focus fits best; the teacher still chooses in the form. */
  focusHint: z
    .enum(['understand-text', 'explain-concept', 'ask-question'])
    .optional()
    .catch(undefined),
});

export type GeneratedExitTicketOption = z.infer<
  typeof GeneratedExitTicketOptionSchema
>;

export const ExitTicketGeneratorResponseSchema = z
  .object({
    reply: z.string().min(1),
    options: z.array(GeneratedExitTicketOptionSchema).optional(),
    prompt: GeneratedExitTicketOptionSchema.nullable().optional(),
  })
  .transform(({ reply, options, prompt }) => ({
    reply,
    options: options && options.length > 0 ? options : prompt ? [prompt] : [],
  }));

export const GENERATOR_OPTION_COUNT = 3;

export function buildExitTicketGeneratorSystemPrompt(): string {
  return [
    'You help high-school English teachers draft exit ticket questions for Yawp!.',
    '',
    'An exit ticket is the last five minutes of a lesson: one question that shows',
    'whether today landed. It is not a quiz with an answer key and not a journal.',
    'Students write in their own words; there is nothing to pick from.',
    '',
    'Rules for every draft you offer:',
    '  • Ask for ONE thing — one idea the lesson turned on.',
    '  • Ask them to explain, not merely recall a fact.',
    '  • Address students as "you" or use the imperative.',
    '  • Keep it short enough to answer in a few sentences at the end of class.',
    '  • Do not bundle multiple questions.',
    '',
    'Collaborate: ask one brief clarifying question when you need the lesson topic,',
    'grade level, or whether they want a check on the text vs. a concept — then draft.',
    '',
    'Respond with STRICT JSON ONLY (raw JSON, not code fences):',
    '{',
    '  "reply": string,',
    '  "options": [',
    '    {',
    '      "prompt": string,',
    '      "focusHint": "understand-text" | "explain-concept" | "ask-question" (optional)',
    '    }',
    '  ]',
    '}',
    `Provide exactly ${GENERATOR_OPTION_COUNT} distinct options when you draft, each`,
    'with a different angle. Return "options": [] only while clarifying.',
  ].join('\n');
}
