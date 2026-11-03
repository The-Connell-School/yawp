const PENDING_KEY = 'yawp:first-assignment-celebration:pending';
const ackKey = (assignmentId: string) =>
  `yawp:first-assignment-celebration:ack:${assignmentId}`;

export function readFirstAssignmentCelebrationPending(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(PENDING_KEY);
}

export function writeFirstAssignmentCelebrationPending(assignmentId: string) {
  window.localStorage.setItem(PENDING_KEY, assignmentId);
}

export function acknowledgeFirstAssignmentCelebration(assignmentId: string) {
  window.localStorage.setItem(ackKey(assignmentId), '1');
  const pending = window.localStorage.getItem(PENDING_KEY);
  if (pending === assignmentId) {
    window.localStorage.removeItem(PENDING_KEY);
  }
}

export function isFirstAssignmentCelebrationAcknowledged(assignmentId: string) {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(ackKey(assignmentId)) === '1';
}

export function shouldOfferFirstAssignmentCelebrationReopen() {
  const pending = readFirstAssignmentCelebrationPending();
  if (!pending) return false;
  return !isFirstAssignmentCelebrationAcknowledged(pending);
}
