import { describe, expect, test } from 'bun:test';

import { safeAssignedReturnPath } from './return-path';

describe('safeAssignedReturnPath', () => {
  test('accepts a valid assigned-practice path', () => {
    expect(
      safeAssignedReturnPath('/app/writing-lessons/assigned/clx123_ab-CD')
    ).toBe('/app/writing-lessons/assigned/clx123_ab-CD');
  });

  test('accepts a self-directed session path with its set in the query', () => {
    expect(safeAssignedReturnPath('/app/writing-lessons/practice')).toBe(
      '/app/writing-lessons/practice'
    );
    expect(
      safeAssignedReturnPath(
        '/app/writing-lessons/practice?skills=fixing-comma-splices,passive-voice&count=10'
      )
    ).toBe(
      '/app/writing-lessons/practice?skills=fixing-comma-splices,passive-voice&count=10'
    );
    expect(
      safeAssignedReturnPath(
        '/app/writing-lessons/practice?skills=topic-sentences&count=5&topic=skateboarding'
      )
    ).toBe(
      '/app/writing-lessons/practice?skills=topic-sentences&count=5&topic=skateboarding'
    );
  });

  test('rejects anything that is not a practice path', () => {
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
    expect(
      safeAssignedReturnPath('/app/writing-lessons/practice/../../admin')
    ).toBeNull();
    expect(
      safeAssignedReturnPath('/app/writing-lessons/practice?next=//evil.test')
    ).toBeNull();
  });
});
