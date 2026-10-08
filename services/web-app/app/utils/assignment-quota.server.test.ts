import { describe, expect, test } from 'bun:test';
import {
  buildAssignmentCreationQuotaFields,
  freeClassroomQuotaMessage,
  isFreeClassroomAssignmentKind,
} from './assignment-quota.server';

describe('assignment-quota helpers', () => {
  test('labels remaining class starters', () => {
    expect(freeClassroomQuotaMessage('class_starter', 8)).toBe(
      '8 of 12 Class Starters left'
    );
    expect(freeClassroomQuotaMessage('class_starter', 0)).toBe(
      "You've used all 12 free Class Starters."
    );
  });

  test('builds quota fields only for free classroom kinds', () => {
    expect(
      buildAssignmentCreationQuotaFields('SCHOOL', 'class_starter', 0)
    ).toEqual({});
    const fields = buildAssignmentCreationQuotaFields(
      'FREE_CLASSROOM',
      'prewriting',
      2
    );
    expect(fields.quotaRemaining).toBe(1);
    expect(fields.quotaExhausted).toBe(false);
    expect(isFreeClassroomAssignmentKind('prewriting')).toBe(true);
    expect(isFreeClassroomAssignmentKind('essay')).toBe(false);
  });
});
