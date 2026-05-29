import { describe, expect, test } from 'bun:test';
import { getDashboardCreatableAssignmentTypes } from './assignment-types-list';

describe('getDashboardCreatableAssignmentTypes', () => {
  test('excludes AP History from the generic dashboard assignment creator', () => {
    const assignmentTypes = [
      {
        id: 'daily-pages',
        title: 'Daily Pages',
        systemKey: null,
        image: null,
      },
      {
        id: 'ap-history',
        title: 'AP History Essay',
        systemKey: 'ap_history_essay',
        image: null,
      },
    ];

    expect(getDashboardCreatableAssignmentTypes(assignmentTypes)).toEqual([
      assignmentTypes[0],
    ]);
  });
});
