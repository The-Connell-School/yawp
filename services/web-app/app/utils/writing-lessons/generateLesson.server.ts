import fs from 'fs';
import path from 'path';

import { getLLMCompletion } from '~/utils/getLLMCompletion';

import {
  WRITING_LESSON_TOPICS,
  type WritingLessonTopicKey,
} from './topics';

const promptPath = path.join(__dirname, 'prompt.md');
const promptContent = fs.readFileSync(promptPath, 'utf-8');

/**
 * Generates a writing lesson for the given topic and grade level using Claude AI.
 *
 * The lesson follows the structure defined in prompt.md: hook, rule/concept,
 * examples (before/after), quick tip, and practice exercises.
 */
export async function generateLesson({
  topic,
  gradeLevel,
  customFocus,
}: {
  topic: WritingLessonTopicKey;
  gradeLevel: string;
  customFocus?: string;
}) {
  const topicDef = WRITING_LESSON_TOPICS[topic];

  const userMessageParts = [
    `Generate a writing lesson on "${topicDef.name}" (${topicDef.description}) for ${gradeLevel} students.`,
  ];

  if (customFocus) {
    userMessageParts.push(
      `Specific focus: ${customFocus}`
    );
  }

  userMessageParts.push(
    'Follow the lesson structure, tone guidelines, and output format described in your instructions. Return only the lesson markdown.'
  );

  const result = await getLLMCompletion({
    model: 'claude-3-5-sonnet-20240620',
    system: promptContent,
    messages: [{ role: 'user', content: userMessageParts.join('\n\n') }],
    maxTokens: 4096,
  });

  return result;
}
