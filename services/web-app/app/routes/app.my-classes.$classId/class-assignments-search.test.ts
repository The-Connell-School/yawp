import { describe, expect, test } from 'bun:test';

import { filterClassAssignmentsByQuery } from './class-assignments-search';

describe('filterClassAssignmentsByQuery', () => {
  const assignments = [
    { title: 'The Gilded Age DBQ', assignmentType: { title: 'DBQ' } },
    { title: 'Cold War LEQ', assignmentType: { title: 'LEQ' } },
    { title: null, assignmentType: { title: 'Reading Response' } },
  ];

  test('returns all assignments when the query is empty', () => {
    expect(filterClassAssignmentsByQuery(assignments, '')).toEqual(assignments);
    expect(filterClassAssignmentsByQuery(assignments, '   ')).toEqual(
      assignments
    );
  });

  test('matches assignment titles case-insensitively', () => {
    expect(filterClassAssignmentsByQuery(assignments, 'gilded')).toEqual([
      assignments[0],
    ]);
  });

  test('matches assignment type when the title is missing', () => {
    expect(filterClassAssignmentsByQuery(assignments, 'reading')).toEqual([
      assignments[2],
    ]);
  });

  test('matches by assignment type even when the title also exists', () => {
    expect(filterClassAssignmentsByQuery(assignments, 'leq')).toEqual([
      assignments[1],
    ]);
  });
});
