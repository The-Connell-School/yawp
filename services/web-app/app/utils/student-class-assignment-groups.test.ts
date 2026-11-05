import { describe, expect, test } from 'bun:test';
import { groupStudentClassAssignmentsByType } from './student-class-assignment-groups';

const assignments = [
  {
    id: 'ca-thesis',
    assignment: { assignmentType: { id: 'type-thesis', title: 'Thesis Builder' } },
  },
  {
    id: 'ca-daily-2',
    assignment: { assignmentType: { id: 'type-daily', title: 'Daily Pages' } },
  },
  {
    id: 'ca-daily-1',
    assignment: { assignmentType: { id: 'type-daily', title: 'Daily Pages' } },
  },
] as const;

describe('groupStudentClassAssignmentsByType', () => {
  test('orders groups by assignment type catalog order', () => {
    const groups = groupStudentClassAssignmentsByType([...assignments], [
      { id: 'type-daily', title: 'Daily Pages' },
      { id: 'type-thesis', title: 'Thesis Builder' },
    ]);

    expect(groups.map((g) => g.assignmentTypeId)).toEqual([
      'type-daily',
      'type-thesis',
    ]);
    expect(groups[0]?.assignments.map((a) => a.id)).toEqual([
      'ca-daily-2',
      'ca-daily-1',
    ]);
  });

  test('appends types missing from the catalog at the end alphabetically', () => {
    const groups = groupStudentClassAssignmentsByType([...assignments], [
      { id: 'type-thesis', title: 'Thesis Builder' },
    ]);

    expect(groups.map((g) => g.assignmentTypeId)).toEqual([
      'type-thesis',
      'type-daily',
    ]);
  });
});
