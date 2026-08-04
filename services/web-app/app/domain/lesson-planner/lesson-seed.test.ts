import { describe, expect, test } from 'bun:test';
import { buildLessonSeed, pickNextStep } from './lesson-seed';
import type { ClassInsightSummary } from '~/domain/assignment-insights/class-insight-synthesis';

const summary: ClassInsightSummary = {
  overview: 'The class argued well but landed their essays softly.',
  categories: [
    {
      key: 'organization_and_structure',
      label: 'Organization/Structure',
      status: 'gap',
      summary: 'Conclusions restate the intro instead of extending it.',
    },
  ],
  nextSteps: [
    {
      title: 'Teach conclusions that answer "so what?"',
      detail:
        'Model two conclusions side by side and have students revise their own.',
      rubricCategory: 'organization_and_structure',
    },
    {
      title: 'Rebuild topic sentences',
      detail: 'Sort strong and weak topic sentences before drafting.',
      rubricCategory: 'organization_and_structure',
    },
  ],
};

describe('pickNextStep', () => {
  test('returns the requested step', () => {
    expect(pickNextStep(summary, '1')?.title).toBe('Rebuild topic sentences');
  });

  test('defaults to the first step when no index is given', () => {
    expect(pickNextStep(summary, null)?.title).toBe(
      'Teach conclusions that answer "so what?"'
    );
  });

  test('returns null for an out-of-range or unparseable index', () => {
    expect(pickNextStep(summary, '9')).toBeNull();
    expect(pickNextStep(summary, 'first')).toBeNull();
    expect(pickNextStep(summary, '-1')).toBeNull();
  });

  test('returns null when there are no next steps at all', () => {
    expect(pickNextStep({ ...summary, nextSteps: [] }, '0')).toBeNull();
  });
});

describe('buildLessonSeed', () => {
  const seed = buildLessonSeed({
    step: summary.nextSteps[0]!,
    className: 'English 10 — Period 3',
    assignmentTitle: 'The Crucible argument essay',
  });

  test('opens with the teaching move the summary recommended', () => {
    expect(seed.prompt).toContain('Teach conclusions that answer "so what?"');
    expect(seed.prompt).toContain(
      'Model two conclusions side by side and have students revise their own.'
    );
  });

  test('carries the class, assignment, and rubric skill into the ask', () => {
    expect(seed.prompt).toContain('English 10 — Period 3');
    expect(seed.prompt).toContain('The Crucible argument essay');
    expect(seed.prompt).toContain('Organization/Structure');
  });

  test('asks the planner to plan rather than to re-diagnose', () => {
    expect(seed.prompt.toLowerCase()).toContain('lesson');
  });

  test('summarizes its origin for the teacher-facing banner', () => {
    expect(seed.context).toContain('English 10 — Period 3');
    expect(seed.context).toContain('Teach conclusions that answer "so what?"');
  });

  test('reads naturally when the class and assignment are unknown', () => {
    const bare = buildLessonSeed({
      step: summary.nextSteps[1]!,
      className: null,
      assignmentTitle: null,
    });
    expect(bare.prompt).toContain('Rebuild topic sentences');
    expect(bare.prompt).not.toContain('null');
    expect(bare.context).not.toContain('null');
  });

  test('names the rubric skill for any canonical key', () => {
    const evidenceSeed = buildLessonSeed({
      step: {
        title: 'Practice citing evidence',
        detail: 'Short embedded-quote drills.',
        rubricCategory: 'evidence_and_support',
      },
      className: null,
      assignmentTitle: null,
    });
    expect(evidenceSeed.prompt).toContain('Practice citing evidence');
    expect(evidenceSeed.prompt).toContain('Evidence/Support');
  });
});
