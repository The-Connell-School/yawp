/** Manual and weekly reminders share the same persisted count. Historical counts are retained. */
export function canSendApprovalReminder(acceptedCount: number) {
  return acceptedCount < 3;
}
