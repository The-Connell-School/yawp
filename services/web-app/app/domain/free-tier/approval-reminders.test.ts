import { expect, test } from 'bun:test';
import { canSendApprovalReminder } from './approval-reminders';

test('allows exactly three reminders and rejects already exhausted or legacy higher counts', () => {
  expect([0, 1, 2, 3, 4, 10].map(canSendApprovalReminder)).toEqual([
    true,
    true,
    true,
    false,
    false,
    false,
  ]);
});
