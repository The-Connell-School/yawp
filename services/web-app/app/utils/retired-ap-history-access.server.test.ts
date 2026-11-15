import { describe, expect, test } from 'bun:test';
import {
  assertNotRetiredApHistoryAssignmentType,
  assertNotRetiredApHistoryDocument,
  isRetiredApHistoryAssignmentType,
  isRetiredApHistoryDocument,
} from './retired-ap-history-access.server';

describe('retired AP History deep links', () => {
  test('detects assignment type by system key', () => {
    expect(isRetiredApHistoryAssignmentType('ap_history_essay')).toBe(true);
    expect(isRetiredApHistoryAssignmentType('daily_pages')).toBe(false);
    expect(isRetiredApHistoryAssignmentType(null)).toBe(false);
  });

  test('detects documents linked to AP History assignments', () => {
    expect(
      isRetiredApHistoryDocument({
        assignment: {
          assignmentType: { systemKey: 'ap_history_essay' },
        },
      })
    ).toBe(true);
    expect(
      isRetiredApHistoryDocument({
        assignmentType: { systemKey: 'ap_history_essay' },
      })
    ).toBe(true);
    expect(
      isRetiredApHistoryDocument({
        assignment: { assignmentType: { systemKey: 'daily_pages' } },
      })
    ).toBe(false);
  });

  test('assert helpers throw a 404 response', () => {
    expect(() =>
      assertNotRetiredApHistoryAssignmentType('ap_history_essay')
    ).toThrow();
    try {
      assertNotRetiredApHistoryAssignmentType('ap_history_essay');
    } catch (error) {
      expect(error).toMatchObject({ status: 404 });
    }

    expect(() =>
      assertNotRetiredApHistoryDocument({
        assignment: { assignmentType: { systemKey: 'ap_history_essay' } },
      })
    ).toThrow();
  });
});