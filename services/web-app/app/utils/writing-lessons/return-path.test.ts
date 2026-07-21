import { describe, expect, test } from 'bun:test';

import { safeAssignedReturnPath } from './return-path';

describe('safeAssignedReturnPath', () => {
  test('accepts a valid assigned-practice path', () => {
    expect(
      safeAssignedReturnPath('/app/writing-lessons/assigned/clx123_ab-CD')
    ).toBe('/app/writing-lessons/assigned/clx123_ab-CD');
  });

  test('rejects anything that is not an assigned-practice path', () => {
    expect(safeAssignedReturnPath(null)).toBeNull();
    expect(safeAssignedReturnPath('')).toBeNull();
    expect(safeAssignedReturnPath('/app/writing-lessons')).toBeNull();
    expect(safeAssignedReturnPath('/app/admin')).toBeNull();
    // Open-redirect attempts.
    expect(safeAssignedReturnPath('https://evil.example.com')).toBeNull();
    expect(safeAssignedReturnPath('//evil.example.com')).toBeNull();
    expect(
      safeAssignedReturnPath('/app/writing-lessons/assigned/a/../../admin')
    ).toBeNull();
  });
});
