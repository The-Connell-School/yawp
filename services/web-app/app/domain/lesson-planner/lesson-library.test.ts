import { describe, expect, test } from 'bun:test';
import { buildLessonLibrary, classDisplayName } from './lesson-library';

function lesson(overrides: Record<string, unknown> = {}) {
  return {
    id: 'plan-1',
    title: 'Plan a lesson on conclusions',
    packetTitle: 'Conclusions, period 3',
    updatedAt: new Date('2026-08-04T10:00:00.000Z'),
    messages: [
      { keptAudience: 'teacher' },
      { keptAudience: 'student' },
      { keptAudience: null },
    ],
    originClassAssignment: {
      class: { title: null, grade: 'English 10', period: '3' },
      assignment: { title: 'The Crucible argument essay' },
    },
    ...overrides,
  };
}

describe('classDisplayName', () => {
  test('prefers an explicit class title', () => {
    expect(
      classDisplayName({ title: 'Honors English', grade: '10', period: '3' })
    ).toBe('Honors English');
  });

  test('falls back to grade and period', () => {
    expect(
      classDisplayName({ title: null, grade: 'English 10', period: '3' })
    ).toBe('English 10 · Period 3');
  });

  test('falls back to grade alone, then to nothing', () => {
    expect(
      classDisplayName({ title: null, grade: 'English 10', period: null })
    ).toBe('English 10');
    expect(
      classDisplayName({ title: null, grade: null, period: null })
    ).toBeNull();
  });
});

describe('buildLessonLibrary', () => {
  test('names each lesson by its packet title', () => {
    expect(buildLessonLibrary([lesson()])[0]!.title).toBe(
      'Conclusions, period 3'
    );
  });

  test('falls back to the conversation title when unnamed', () => {
    expect(buildLessonLibrary([lesson({ packetTitle: null })])[0]!.title).toBe(
      'Plan a lesson on conclusions'
    );
  });

  test('counts kept sections and handouts, ignoring unkept replies', () => {
    expect(buildLessonLibrary([lesson()])[0]).toMatchObject({
      sectionCount: 2,
      handoutCount: 1,
    });
  });

  test('carries the class and assignment it was planned for', () => {
    expect(buildLessonLibrary([lesson()])[0]).toMatchObject({
      className: 'English 10 · Period 3',
      assignmentTitle: 'The Crucible argument essay',
    });
  });

  test('handles a standalone lesson with no class behind it', () => {
    const [row] = buildLessonLibrary([lesson({ originClassAssignment: null })]);
    expect(row).toMatchObject({ className: null, assignmentTitle: null });
  });

  test('leaves drafts out — a lesson with nothing kept is not a lesson yet', () => {
    expect(
      buildLessonLibrary([
        lesson({ messages: [{ keptAudience: null }] }),
        lesson({ id: 'plan-2', messages: [] }),
      ])
    ).toEqual([]);
  });

  test('serializes the timestamp for the client', () => {
    expect(buildLessonLibrary([lesson()])[0]!.updatedAt).toBe(
      '2026-08-04T10:00:00.000Z'
    );
    expect(
      buildLessonLibrary([
        lesson({ updatedAt: '2026-01-01T00:00:00.000Z' }),
      ])[0]!.updatedAt
    ).toBe('2026-01-01T00:00:00.000Z');
  });
});
