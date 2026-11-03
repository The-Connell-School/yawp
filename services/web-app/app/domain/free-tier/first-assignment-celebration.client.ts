const PENDING_KEY = 'yawp:first-assignment-celebration:pending';
const PENDING_CLASS_KEY = 'yawp:first-assignment-celebration:pending-class';
const ackKey = (assignmentId: string) =>
  `yawp:first-assignment-celebration:ack:${assignmentId}`;

export function readFirstAssignmentCelebrationPending(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(PENDING_KEY);
}

export function readFirstAssignmentCelebrationPendingClassId(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(PENDING_CLASS_KEY);
}

export function writeFirstAssignmentCelebrationPending(
  assignmentId: string,
  classId?: string | null
) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PENDING_KEY, assignmentId);
  if (classId) {
    window.localStorage.setItem(PENDING_CLASS_KEY, classId);
  }
}

export function acknowledgeFirstAssignmentCelebration(assignmentId: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ackKey(assignmentId), '1');
  const pending = window.localStorage.getItem(PENDING_KEY);
  if (pending === assignmentId) {
    window.localStorage.removeItem(PENDING_KEY);
    window.localStorage.removeItem(PENDING_CLASS_KEY);
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
