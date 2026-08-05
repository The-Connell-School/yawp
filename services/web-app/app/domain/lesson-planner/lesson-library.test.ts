import { describe, expect, test } from 'bun:test';
import {
  buildLessonLibrary,
  classDisplayName,
  groupLessonHistory,
} from './lesson-library';

function lesson(overrides: Record<string, unknown> = {}) {
  return {
    id: 'plan-1',
    title: 'Plan a lesson on conclusions',
    packetTitle: 'Conclusions, period 3',
    updatedAt: new Date('2026-08-04T10:00:00.000Z'),
    starredAt: null,
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

  test('keeps a draft in the history rather than hiding it', () => {
    // The old library dropped anything with nothing kept, so a lesson a
    // teacher started and came back to later looked lost.
    const rows = buildLessonLibrary([
      lesson({ messages: [{ keptAudience: null }] }),
      lesson({ id: 'plan-2', messages: [] }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.sectionCount === 0)).toBe(true);
  });

  test('reports whether the teacher starred it', () => {
    expect(buildLessonLibrary([lesson()])[0]!.starred).toBe(false);
    expect(
      buildLessonLibrary([
        lesson({ starredAt: new Date('2026-08-05T00:00:00.000Z') }),
      ])[0]!.starred
    ).toBe(true);
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

describe('groupLessonHistory', () => {
  test('lifts the starred lessons above the rest', () => {
    const rows = buildLessonLibrary([
      lesson({ id: 'a', packetTitle: 'Unstarred' }),
      lesson({
        id: 'b',
        packetTitle: 'Starred',
        starredAt: new Date('2026-08-05T00:00:00.000Z'),
      }),
    ]);
    const { starred, recent } = groupLessonHistory(rows);
    expect(starred.map((row) => row.title)).toEqual(['Starred']);
    expect(recent.map((row) => row.title)).toEqual(['Unstarred']);
  });

  test('copes with a history that is all one or the other', () => {
    expect(groupLessonHistory([])).toEqual({ starred: [], recent: [] });
    const none = buildLessonLibrary([lesson()]);
    expect(groupLessonHistory(none).starred).toEqual([]);
    expect(groupLessonHistory(none).recent).toHaveLength(1);
  });
});
