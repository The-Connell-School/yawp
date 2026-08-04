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

  test('requires suggestion chips on the turn that asks for class context', () => {
    const lower = prompt.toLowerCase();
    // The intake turn is where one-tap answers save the most typing, and the
    // planner opens with it almost every time.
    expect(lower).toContain('always end with one when you ask for class');
  });

  test('asks for whole ready-to-send answers, not fragments', () => {
    const lower = prompt.toLowerCase();
    expect(lower).toContain('send verbatim');
    expect(lower).toContain('a whole reply the teacher could have typed');
  });

  test('does not tell the planner to omit chips whenever it is not offering a menu', () => {
    // The old rule suppressed chips on open questions — which is exactly the
    // intake turn, where they are most useful.
    expect(prompt.toLowerCase()).not.toContain(
      'omit the block entirely when you are not asking the teacher to choose'
    );
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

describe('buildLessonPlannerSystemPrompt — teaching out of Yawp', () => {
  const prompt = buildLessonPlannerSystemPrompt({
    teacherName: null,
    organizationName: 'Connell School',
  });

  test('tells the planner to build lessons out of Yawp itself', () => {
    const lower = prompt.toLowerCase();
    for (const surface of [
      'daily pages',
      'quick writing lesson',
      "teacher's lounge",
      'assignment',
    ]) {
      expect(lower).toContain(surface);
    }
  });

  test('names the catalog tools it should call before improvising', () => {
    for (const tool of [
      'search_daily_pages_prompts',
      'list_writing_lessons',
      'get_writing_lesson',
      'list_lounge_materials',
      'list_assignment_types',
    ]) {
      expect(prompt).toContain(tool);
    }
  });

  test('requires real ids and links for anything it cites from the catalog', () => {
    const lower = prompt.toLowerCase();
    expect(lower).toContain('prompt id');
    expect(lower).toContain('link');
  });

  test('forbids naming Yawp material that did not come back from a tool', () => {
    const lower = prompt.toLowerCase();
    // The old blanket ban on naming Yawp material is gone — it must now cite
    // real catalog items and only those.
    expect(lower).toContain('never name a daily pages prompt');
    expect(lower).toContain('did not come back from a tool');
  });

  test('prefers existing Yawp material over inventing an activity', () => {
    expect(prompt.toLowerCase()).toContain('before you invent');
  });
});
