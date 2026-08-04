import { describe, expect, test } from 'bun:test';
import { rubricCategories } from '~/domain/grading/rubric';
import {
  buildLessonPlannerSystemPrompt,
  RECOMMENDED_LESSON_PLANNER_PROMPTS,
} from './build-system-prompt';

describe('buildLessonPlannerSystemPrompt', () => {
  const prompt = buildLessonPlannerSystemPrompt({
    teacherName: 'Ms. Rivera',
    organizationName: 'Connell School',
  });

  test('includes the teacher and organization context', () => {
    expect(prompt).toContain('Ms. Rivera');
    expect(prompt).toContain('Connell School');
  });

  test('names the expertise the planner is supposed to bring', () => {
    const lower = prompt.toLowerCase();
    for (const expertise of [
      'pedagogy',
      'differentiation',
      'psychology',
      'group work',
      'audience',
    ]) {
      expect(lower).toContain(expertise);
    }
  });

  test('grounds the model in the canonical grading rubric, verbatim', () => {
    for (const category of rubricCategories) {
      expect(prompt).toContain(category.label);
      expect(prompt).toContain(category.description);
    }
  });

  test('lists the artifacts a teacher can ask for', () => {
    const lower = prompt.toLowerCase();
    for (const artifact of [
      'slide deck',
      'lecture notes',
      'activit',
      'handout',
      'exit ticket',
    ]) {
      expect(lower).toContain(artifact);
    }
  });

  test('requires parallel lessons when the teacher describes two class personalities', () => {
    const lower = prompt.toLowerCase();
    expect(lower).toContain('introvert');
    expect(lower).toContain('extrovert');
    // The differentiated versions must stay genuinely different, not relabeled.
    expect(lower).toContain('same objective');
  });

  test('asks for the class context it needs before planning blind', () => {
    const lower = prompt.toLowerCase();
    expect(lower).toContain('grade level');
    expect(lower).toContain('how long');
  });

  test('forbids inventing Yawp curriculum or class data', () => {
    const lower = prompt.toLowerCase();
    expect(lower).toContain('do not invent');
    expect(lower).toContain('never fabricate');
  });

  test('keeps the clickable suggestions protocol the chat UI parses', () => {
    expect(prompt).toContain('```suggestions');
  });

  test('drops the teacher name gracefully when it is unknown', () => {
    const anonymous = buildLessonPlannerSystemPrompt({
      teacherName: null,
      organizationName: 'Connell School',
    });
    expect(anonymous).toContain('a teacher');
    expect(anonymous).not.toContain('null');
  });
});

describe('RECOMMENDED_LESSON_PLANNER_PROMPTS', () => {
  test('exposes a stable set of starter prompts', () => {
    expect(RECOMMENDED_LESSON_PLANNER_PROMPTS.length).toBeGreaterThan(0);
    const ids = new Set<string>();
    for (const entry of RECOMMENDED_LESSON_PLANNER_PROMPTS) {
      expect(entry.id).toBeTruthy();
      expect(entry.label).toBeTruthy();
      expect(entry.prompt).toBeTruthy();
      ids.add(entry.id);
    }
    expect(ids.size).toBe(RECOMMENDED_LESSON_PLANNER_PROMPTS.length);
  });
});
