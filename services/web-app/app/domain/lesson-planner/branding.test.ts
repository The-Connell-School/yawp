/**
 * "YAWP" always appears as "Yawp!" (Brian's run 2, item 18), everywhere the
 * planner writes or tells the model to write it.
 */
import { describe, expect, test } from 'bun:test';
import {
  buildLessonPlannerSystemPrompt,
  buildLessonPlannerSystemPromptBlocks,
  RECOMMENDED_LESSON_PLANNER_PROMPTS,
} from '~/routes/api.domain.lesson-planner/build-system-prompt';
import { PLANNING_PROGRESS_LABELS } from './planning-progress';
import { FAILED_DECK_NOTE } from './slide-deck';
import { FAILED_UNIT_NOTE } from './unit-plan';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const UNBRANDED = /\b(?:Yawp|YAWP|yawp)\b(?!!)(?![-_.\w])/;

function unbranded(text: string): string[] {
  return text
    .split('\n')
    .filter((line) => UNBRANDED.test(line.replace(/`[^`]*`/g, '')));
}

describe("Yawp! everywhere (Brian's run 2, item 18)", () => {
  test('the system prompt, every variant', () => {
    for (const intakeV2 of [false, true]) {
      for (const exitTicketsAvailable of [false, true]) {
        for (const writingPracticeAvailable of [false, true]) {
          const prompt = buildLessonPlannerSystemPrompt({
            teacherName: null,
            organizationName: 'Connell School',
            intakeV2,
            exitTicketsAvailable,
            writingPracticeAvailable,
          } as any);
          expect(unbranded(prompt)).toEqual([]);
          const blocks = buildLessonPlannerSystemPromptBlocks({
            teacherName: null,
            organizationName: 'Connell School',
            intakeV2,
            exitTicketsAvailable,
            writingPracticeAvailable,
          });
          expect(unbranded(blocks.map((block) => block.text).join('\n'))).toEqual([]);
        }
      }
    }
  });

  test('says how to write the name', () => {
    const prompt = buildLessonPlannerSystemPrompt({ teacherName: null, organizationName: 'X' });
    expect(prompt).toContain('The product is written Yawp! (capital Y, lowercase "awp", the exclamation point), every time');
  });

  test('starter prompts, progress labels and notes the model reads', () => {
    expect(unbranded(JSON.stringify(RECOMMENDED_LESSON_PLANNER_PROMPTS))).toEqual([]);
    expect(unbranded(Object.values(PLANNING_PROGRESS_LABELS).join('\n'))).toEqual([]);
    expect(unbranded(FAILED_DECK_NOTE)).toEqual([]);
    expect(unbranded(FAILED_UNIT_NOTE)).toEqual([]);
  });

  test('the tool descriptions and notes the model reads', () => {
    const source = readFileSync(join(import.meta.dir, 'lesson-planner-tools.server.ts'), 'utf8');
    // Only string literals, not comments.
    const strings = [...source.matchAll(/(['"`])((?:\\.|(?!\1).)*)\1/g)].map((match) => match[2]!);
    expect(unbranded(strings.join('\n'))).toEqual([]);
  });
});
