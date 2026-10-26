import { describe, expect, test } from 'bun:test';
import {
  CLASS_STARTER_DEFAULT_POINT_VALUE,
  DAILY_PAGES_DEFAULT_POINT_VALUE,
  defaultPointValueForNewAssignment,
  resolveNewAssignmentPointValue,
} from './new-assignment-defaults';
import { EXIT_TICKET_DEFAULT_POINT_VALUE } from '~/domain/assignment-types/exit-ticket';
import { DEFAULT_SAVED_ASSIGNMENT_POINT_VALUE } from '~/domain/assignments/saved-assignments';
import { DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL } from '~/domain/grading/grading-assistant-strictness';

describe('defaultPointValueForNewAssignment', () => {
  test('Class Starter defaults to 10 points', () => {
    expect(
      defaultPointValueForNewAssignment({ kind: 'class_starter' })
    ).toBe(CLASS_STARTER_DEFAULT_POINT_VALUE);
    expect(CLASS_STARTER_DEFAULT_POINT_VALUE).toBe(10);
  });

  test('Exit Ticket defaults to 10 points', () => {
    expect(
      defaultPointValueForNewAssignment({ kind: 'exit_ticket' })
    ).toBe(EXIT_TICKET_DEFAULT_POINT_VALUE);
  });

  test('Daily Pages defaults to 20 points', () => {
    expect(
      defaultPointValueForNewAssignment({ kind: 'daily_pages' })
    ).toBe(DAILY_PAGES_DEFAULT_POINT_VALUE);
    expect(DAILY_PAGES_DEFAULT_POINT_VALUE).toBe(20);
  });

  test('Daily Pages engagement rubric without kind defaults to 20 points', () => {
    expect(
      defaultPointValueForNewAssignment({
        kind: null,
        rubricName: 'daily-pages-engagement',
      })
    ).toBe(20);
  });

  test('other assignment types keep the legacy 100-point default', () => {
    expect(defaultPointValueForNewAssignment({ kind: 'thesis_statement' })).toBe(
      DEFAULT_SAVED_ASSIGNMENT_POINT_VALUE
    );
    expect(defaultPointValueForNewAssignment({ kind: null })).toBe(100);
  });
});

describe('resolveNewAssignmentPointValue', () => {
  test('editing keeps the stored value', () => {
    expect(
      resolveNewAssignmentPointValue({
        isEditing: true,
        explicitPointValue: 37,
        assignmentType: { kind: 'class_starter' },
      })
    ).toBe(37);
  });

  test('reuse passes an explicit value through', () => {
    expect(
      resolveNewAssignmentPointValue({
        isEditing: false,
        explicitPointValue: 250,
        assignmentType: { kind: 'class_starter' },
      })
    ).toBe(250);
  });

  test('new assignments without an explicit value use the type default', () => {
    expect(
      resolveNewAssignmentPointValue({
        isEditing: false,
        explicitPointValue: undefined,
        assignmentType: { kind: 'class_starter' },
      })
    ).toBe(10);
  });
});

describe('grading assistant strictness default', () => {
  test('new assignments default to Beginner site-wide', () => {
    expect(DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL).toBe('beginner');
  });
});
