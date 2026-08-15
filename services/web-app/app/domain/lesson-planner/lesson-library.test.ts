import { describe, expect, test } from 'bun:test';
import {
  buildLessonLibrary,
  classDisplayName,
  splitDraftsAndLibrary,
} from './lesson-library';

function lesson(overrides: Record<string, unknown> = {}) {
  return {
    id: 'plan-1',
    title: 'Plan a lesson on conclusions',
    packetTitle: 'Conclusions, period 3',
    updatedAt: new Date('2026-08-04T10:00:00.000Z'),
    publishedAt: null,
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

  test('reports whether the teacher published it', () => {
    expect(buildLessonLibrary([lesson()])[0]!.published).toBe(false);
    expect(
      buildLessonLibrary([
        lesson({ publishedAt: new Date('2026-08-05T00:00:00.000Z') }),
      ])[0]!.published
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

describe('splitDraftsAndLibrary', () => {
  test('a lesson starts as a draft', () => {
    const [row] = buildLessonLibrary([lesson()]);
    expect(row!.published).toBe(false);

    const { drafts, library } = splitDraftsAndLibrary([row!]);
    expect(drafts).toHaveLength(1);
    expect(library).toHaveLength(0);
  });

  test('publishing moves it out of the drafts and into the library', () => {
    const [row] = buildLessonLibrary([
      lesson({ publishedAt: new Date('2026-08-05T10:00:00.000Z') }),
    ]);
    expect(row!.published).toBe(true);

    const { drafts, library } = splitDraftsAndLibrary([row!]);
    expect(drafts).toHaveLength(0);
    expect(library).toHaveLength(1);
  });

  /**
   * The two lists are the whole point: a half-finished lesson and one taught
   * for three years should never sit in the same place. Every lesson is in
   * exactly one of them.
   */
  test('every lesson lands in exactly one list', () => {
    const rows = buildLessonLibrary([
      lesson({ id: 'a' }),
      lesson({ id: 'b', publishedAt: new Date('2026-08-05T10:00:00.000Z') }),
      lesson({ id: 'c' }),
    ]);

    const { drafts, library } = splitDraftsAndLibrary(rows);
    expect(drafts.map((row) => row.id)).toEqual(['a', 'c']);
    expect(library.map((row) => row.id)).toEqual(['b']);
    expect(drafts.length + library.length).toBe(rows.length);
  });
});
