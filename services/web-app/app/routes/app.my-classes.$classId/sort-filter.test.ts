import { describe, expect, test } from 'bun:test';
import {
  filterAssignmentsByType,
  sortAssignments,
  sortStudents,
  type SortableAssignment,
  type SortableStudent,
} from './sort-filter';

function student(name: string | null, email = `${name ?? 'x'}@example.com`): SortableStudent {
  return { profile: { user: { name, email } } };
}

function assignment(
  title: string | null,
  dueDate: Date | string | null,
  typeId = 'type-default'
): SortableAssignment {
  return {
    title,
    dueDate,
    assignmentTypeId: typeId,
    assignmentType: { id: typeId, title: typeId },
  };
}

describe('sortStudents', () => {
  test('sorts case-insensitively A→Z by default', () => {
    const list = [student('grace hopper'), student('Ada Lovelace'), student('Alan Turing')];
    expect(
      sortStudents(list, 'asc').map((s) => s.profile.user.name)
    ).toEqual(['Ada Lovelace', 'Alan Turing', 'grace hopper']);
  });

  test('flips to Z→A on descending', () => {
    const list = [student('Ada'), student('Linus'), student('Grace')];
    expect(sortStudents(list, 'desc').map((s) => s.profile.user.name)).toEqual([
      'Linus',
      'Grace',
      'Ada',
    ]);
  });

  test('uses locale-aware comparison so Ángela sorts before Beatriz', () => {
    const list = [
      student('Zoe'),
      student('Beatriz'),
      student('Ángela Ruiz'),
    ];
    expect(sortStudents(list, 'asc').map((s) => s.profile.user.name)).toEqual([
      'Ángela Ruiz',
      'Beatriz',
      'Zoe',
    ]);
  });

  test('uses email as a deterministic tiebreaker when names collide', () => {
    const list = [
      student('Alex', 'alex.z@example.com'),
      student('Alex', 'alex.a@example.com'),
    ];
    expect(sortStudents(list, 'asc').map((s) => s.profile.user.email)).toEqual([
      'alex.a@example.com',
      'alex.z@example.com',
    ]);
  });

  test('treats a null name as the empty string', () => {
    const list = [student('Ada'), student(null)];
    const result = sortStudents(list, 'asc').map((s) => s.profile.user.name);
    expect(result[0]).toBeNull();
    expect(result[1]).toBe('Ada');
  });
});

describe('sortAssignments by title', () => {
  test('sorts A→Z by title using locale-aware comparison', () => {
    const list = [
      assignment('Macbeth essay', '2026-05-10'),
      assignment('Daily Pages — Wk 3', '2026-05-14'),
      assignment('Reading reflection', '2026-05-05'),
    ];
    expect(
      sortAssignments(list, { column: 'title', direction: 'asc' }).map((a) => a.title)
    ).toEqual(['Daily Pages — Wk 3', 'Macbeth essay', 'Reading reflection']);
  });

  test('flips to Z→A on descending', () => {
    const list = [
      assignment('Apple essay', '2026-05-01'),
      assignment('Zebra essay', '2026-05-02'),
    ];
    expect(
      sortAssignments(list, { column: 'title', direction: 'desc' }).map((a) => a.title)
    ).toEqual(['Zebra essay', 'Apple essay']);
  });

  test('treats null titles as "Untitled Assignment" for sort purposes', () => {
    const list = [assignment('Zebra essay', null), assignment(null, null)];
    expect(
      sortAssignments(list, { column: 'title', direction: 'asc' }).map((a) => a.title)
    ).toEqual([null, 'Zebra essay']);
  });

  test('breaks ties on title with due date ascending (no-due-date sinks)', () => {
    const list = [
      assignment('Same title', null),
      assignment('Same title', '2026-05-15'),
      assignment('Same title', '2026-05-01'),
    ];
    expect(
      sortAssignments(list, { column: 'title', direction: 'asc' }).map(
        (a) => a.dueDate
      )
    ).toEqual(['2026-05-01', '2026-05-15', null]);
  });
});

describe('sortAssignments by due date', () => {
  test('soonest first by default', () => {
    const list = [
      assignment('A', '2026-05-15'),
      assignment('B', '2026-05-01'),
      assignment('C', '2026-05-10'),
    ];
    expect(
      sortAssignments(list, { column: 'dueDate', direction: 'asc' }).map(
        (a) => a.title
      )
    ).toEqual(['B', 'C', 'A']);
  });

  test('latest first on descending, with missing dates still sinking last', () => {
    const list = [
      assignment('A', '2026-05-15'),
      assignment('No-due', null),
      assignment('B', '2026-05-01'),
    ];
    expect(
      sortAssignments(list, { column: 'dueDate', direction: 'desc' }).map(
        (a) => a.title
      )
    ).toEqual(['A', 'B', 'No-due']);
  });

  test('missing dates sink to the bottom in ascending direction too', () => {
    const list = [
      assignment('No-due', null),
      assignment('A', '2026-05-15'),
      assignment('B', '2026-05-01'),
    ];
    expect(
      sortAssignments(list, { column: 'dueDate', direction: 'asc' }).map(
        (a) => a.title
      )
    ).toEqual(['B', 'A', 'No-due']);
  });

  test('breaks ties on due date with title ascending', () => {
    const list = [
      assignment('Zeta', '2026-05-10'),
      assignment('Alpha', '2026-05-10'),
    ];
    expect(
      sortAssignments(list, { column: 'dueDate', direction: 'asc' }).map(
        (a) => a.title
      )
    ).toEqual(['Alpha', 'Zeta']);
  });

  test('orders multiple no-due-date entries by title', () => {
    const list = [
      assignment('Zeta', null),
      assignment('Alpha', null),
      assignment('Beta', '2026-05-10'),
    ];
    expect(
      sortAssignments(list, { column: 'dueDate', direction: 'asc' }).map(
        (a) => a.title
      )
    ).toEqual(['Beta', 'Alpha', 'Zeta']);
  });
});

describe('filterAssignmentsByType', () => {
  const a = assignment('A', '2026-05-01', 'type-1');
  const b = assignment('B', '2026-05-02', 'type-2');
  const c = assignment('C', '2026-05-03', 'type-3');

  test('empty selection means "all", not "none"', () => {
    expect(filterAssignmentsByType([a, b, c], new Set())).toEqual([a, b, c]);
  });

  test('narrowing the selection returns only matching rows', () => {
    expect(filterAssignmentsByType([a, b, c], new Set(['type-1', 'type-3']))).toEqual([
      a,
      c,
    ]);
  });

  test('returns an empty list when no row matches the selection', () => {
    expect(filterAssignmentsByType([a, b], new Set(['type-nonexistent']))).toEqual([]);
  });

  test('filter composes with sort: filter then sort by title Z→A', () => {
    const filtered = filterAssignmentsByType(
      [a, b, c],
      new Set(['type-1', 'type-3'])
    );
    expect(
      sortAssignments(filtered, { column: 'title', direction: 'desc' }).map(
        (x) => x.title
      )
    ).toEqual(['C', 'A']);
  });
});
