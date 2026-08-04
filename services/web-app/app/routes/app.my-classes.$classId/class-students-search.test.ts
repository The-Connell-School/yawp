import { describe, expect, test } from 'bun:test';

import { filterClassStudentsByQuery } from './class-students-search';

describe('filterClassStudentsByQuery', () => {
  const students = [
    { user: { name: 'Ángela Ruiz', email: 'angela@yawp.test' } },
    { user: { name: 'Brian Adams', email: 'brian@yawp.test' } },
    { user: { name: null, email: 'zoe@yawp.test' } },
  ];

  test('returns all students when the query is empty', () => {
    expect(filterClassStudentsByQuery(students, '')).toEqual(students);
    expect(filterClassStudentsByQuery(students, '   ')).toEqual(students);
  });

  test('matches student names case-insensitively', () => {
    expect(filterClassStudentsByQuery(students, 'brian')).toEqual([
      students[1],
    ]);
  });

  test('matches student emails when names are missing', () => {
    expect(filterClassStudentsByQuery(students, 'zoe@')).toEqual([students[2]]);
  });
});
