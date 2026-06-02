import { describe, expect, test } from 'bun:test';
import { getGenericAssignmentTypes } from './assignment-types-list';

describe('getGenericAssignmentTypes', () => {
  test('omits AP History from generic dashboard assignment creation options', () => {
    const assignmentTypes = [
      { id: 'daily-pages', title: 'Daily Pages', systemKey: null },
      {
        id: 'ap-history',
        title: 'AP History Essay',
        systemKey: 'ap_history_essay',
      },
    ];

    expect(getGenericAssignmentTypes(assignmentTypes)).toEqual([
      { id: 'daily-pages', title: 'Daily Pages', systemKey: null },
    ]);
  });
});
