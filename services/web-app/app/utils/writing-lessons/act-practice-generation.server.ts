import { z } from 'zod';

import { getLLMCompletion } from '~/utils/getLLMCompletion';
import { parseFirstJsonValue } from '~/utils/llm-json.server';
import {
  generatedActQuestionSchema,
  isRenderableActQuestion,
  type ActPracticeQuestion,
} from './act-practice.shared';
import { filterAppropriateActQuestions } from './practice-content-safety';

const DEFAULT_MODEL = 'claude-sonnet-4-6';

const generationSchema = z.object({
  questions: z.array(generatedActQuestionSchema).min(1),
});

const SYSTEM_PROMPT = [
  'You write ACT English–style multiple-choice questions for the Yawp! writing',
  'program. Each question drills ONE grammar or usage skill.',
  '',
  'Model every item on the ACT English section:',
  '- "sentence": one expository, academic sentence in the register of an ACT',
  '  passage — topics like history, science, the arts, nature, or biography.',
  '  Keep it informational and neutral in tone (not casual or pop-culture).',
  '- "underline": the EXACT substring of "sentence" that is under test. It must',
  '  appear in "sentence" verbatim.',
  '- "choices": exactly FOUR options. choices[0] MUST be the original underlined',
  '  text, character-for-character (it is shown to students as "NO CHANGE").',
  '  choices[1..3] are alternative replacements for the underlined portion.',
  '- "correctChoiceIndex": the 0-based index (0–3) of the single correct choice.',
  '- "explanation": one or two sentences saying why the correct choice is right,',
  '  in plain, encouraging language.',
  '',
  'Exactly one choice must be correct; the other three must be clearly wrong for',
  'this skill. Vary which index is correct across items.',
  '',
  'CONTENT POLICY — these appear in a classroom, so every sentence, choice, and',
  'explanation MUST be school-appropriate: no profanity, slurs, sexual or',
  'suggestive content, graphic violence, weapons used to harm, self-harm, or',
  'drug/alcohol use.',
  '',
  'Return ONLY valid JSON of the form:',
  '{"questions":[{"sentence":string,"underline":string,"choices":[string,string,string,string],"correctChoiceIndex":number,"explanation":string}]}',
].join('\n');

function buildUserPrompt(input: {
  skill: string;
  lessonTitle: string;
  rule: string;
  exampleSentences: string[];
  count: number;
}): string {
  const examples = input.exampleSentences
    .slice(0, 6)
    .map((sentence, index) => `${index + 1}. ${sentence}`)
    .join('\n');

  return [
    `Skill: ${input.skill}`,
    `Lesson: ${input.lessonTitle}`,
    '',
    'The rule for this skill:',
    input.rule,
    '',
    'Example sentences that exhibit this skill (for style only — do not repeat):',
    examples || '(none)',
    '',
    `Write ${input.count} new, distinct ACT English questions for this skill.`,
  ].join('\n');
}

/**
 * Generates novel ACT English multiple-choice questions for one skill, grounded
 * in the lesson's rule and examples. Returns an empty array on any failure
 * (missing provider, bad output, API error) so callers fall back to the static
 * bank. Malformed items (underline not in the sentence, choice A not equal to
 * the underline, out-of-range answer) and any off-policy item are dropped.
 */
export async function generateActPracticeQuestions(input: {
  lessonSlug: string;
  skill: string;
  lessonTitle: string;
  rule: string;
  exampleSentences: string[];
  count: number;
}, attribution?: {
  organizationId?: string;
  membershipId?: string;
  classId?: string;
  route?: string;
  requestId?: string;
}): Promise<ActPracticeQuestion[]> {
  if (input.count <= 0) return [];

  try {
    const responseText = await getLLMCompletion({
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserPrompt(input) }],
      model: process.env.AI_MODEL ?? DEFAULT_MODEL,
      temperature: 0.8,
      maxTokens: 2500,
      metadata: {
        feature: 'writing-practice-act-generation',
        skill: input.skill,
        count: input.count,
      },
      attribution: {
        organizationId: attribution?.organizationId ?? null,
        membershipId: attribution?.membershipId ?? null,
        classId: attribution?.classId,
        route:
          attribution?.route ??
          'utils/writing-lessons/act-practice-generation',
        requestId: attribution?.requestId ?? `${Date.now()}-${Math.random()}`,
      },
    });

    const parsed = generationSchema.safeParse(
      parseFirstJsonValue(responseText)
    );
    if (!parsed.success) return [];

    const candidates = parsed.data.questions.map((question) => ({
      sentence: question.sentence.trim(),
      underline: question.underline.trim(),
      choices: question.choices.map((choice) => choice.trim()),
      correctChoiceIndex: question.correctChoiceIndex,
      explanation: question.explanation.trim(),
    }));

    // Keep only items that render cleanly AND whose "NO CHANGE" option (choice A)
    // is exactly the underlined text — otherwise the deterministic grade and the
    // on-screen highlight would disagree.
    const wellFormed = candidates.filter(
      (question) =>
        isRenderableActQuestion(question) &&
        question.choices[0] === question.underline
    );

    const safe = filterAppropriateActQuestions(wellFormed).slice(
      0,
      input.count
    );

    return safe.map((question, index) => ({
      id: `${input.lessonSlug}-act-gen-${index + 1}-${crypto.randomUUID()}`,
      ...question,
    }));
  } catch {
    return [];
  }
}
