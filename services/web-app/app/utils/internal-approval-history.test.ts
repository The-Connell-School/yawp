import { expect, test } from 'bun:test';
import { approvalHistory, publicApprovalEmailLog } from './internal-approval-history';
const at = (day: number) => new Date(Date.UTC(2026, 9, day));
const row = (id = 'a', extra = {}) => ({ id, adminName: id, adminEmail: id + '@example.test', adminRole: null,
  status: 'PENDING', createdAt: at(1), decidedAt: null, redirectedFromId: null, ...extra });
const log = (kind: string, day: number, success = true, extra = {}) => ({ id: `log-${day}`, kind,
  createdAt: at(day), toEmail: 'a@example.test', success, error: null, ...extra });

test('absent approval has exact nulls and zero teacher follow-ups', () => {
  expect(approvalHistory([], [])).toEqual({ adminRequest: null, teacherFollowUps: { count: 0, lastSentAt: null }, forwards: [] });
});
test('legacy first send and reminders use accepted evidence, never row creation or failed sends', () => {
  const history = approvalHistory([row()], [log('admin_approval', 2, false), log('admin_approval', 3),
    log('admin_approval_reminder', 4, false), log('admin_approval_reminder', 5)]);
  expect(history.adminRequest).toEqual({ currentApprovalId: 'a', adminName: 'a', adminEmail: 'a@example.test',
    adminRole: null, status: 'PENDING', firstSentAt: at(3).toISOString(), reminderCount: 1,
    lastReminderAt: at(5).toISOString(), lastReminderSource: null, nextAutoReminderAt: null,
    autoRemindersStopped: false, stopReason: null, needsManualFollowUp: false });
  expect(approvalHistory([row()], []).adminRequest?.firstSentAt).toBeNull();
});
test('persisted cadence remains readable and authoritative, including uncertainty follow-up', () => {
  expect(approvalHistory([row('a', { firstSentAt: at(2), reminderCount: 4, lastReminderAt: at(6),
    lastReminderSource: 'manual', nextAutoReminderAt: null, autoRemindersStopped: true,
    stopReason: 'max_reached', needsManualFollowUp: true })], []).adminRequest).toMatchObject({
    firstSentAt: at(2).toISOString(), reminderCount: 4, lastReminderAt: at(6).toISOString(),
    lastReminderSource: 'manual', nextAutoReminderAt: null, autoRemindersStopped: true,
    stopReason: 'max_reached', needsManualFollowUp: true,
  });
});
test('multi-hop history uses previous decision time and replacement role, with truthful legacy nulls', () => {
  const result = approvalHistory([row('c', { createdAt: at(5), redirectedFromId: 'b', forwardedByRole: 'teacher',
    teacherFollowUpCount: 1, lastTeacherFollowUpAt: at(8) }),
    row('a', { status: 'REDIRECTED', decidedAt: at(2), teacherFollowUpCount: 2, lastTeacherFollowUpAt: at(2) }),
    row('b', { createdAt: at(3), status: 'REDIRECTED', redirectedFromId: 'a', decidedAt: at(4),
      teacherFollowUpCount: 3, lastTeacherFollowUpAt: at(6) })], []);
  expect(result.adminRequest?.currentApprovalId).toBe('c');
  expect(result.teacherFollowUps).toEqual({ count: 6, lastSentAt: at(8).toISOString() });
  expect(result.forwards).toEqual([
    { approvalId: 'a', fromAdminName: 'a', fromAdminEmail: 'a@example.test', toAdminName: 'b', toAdminEmail: 'b@example.test', forwardedAt: at(2).toISOString(), byRole: null },
    { approvalId: 'b', fromAdminName: 'b', fromAdminEmail: 'b@example.test', toAdminName: 'c', toAdminEmail: 'c@example.test', forwardedAt: at(4).toISOString(), byRole: 'teacher' },
  ]);
});
test('legacy evidence is isolated per administrator and bounded by replacement creation', () => {
  const result = approvalHistory([row('a', { status: 'REDIRECTED', decidedAt: at(4) }), row('b', { createdAt: at(5), redirectedFromId: 'a' })],
    [log('admin_approval', 2), log('admin_approval_reminder', 3), log('admin_approval', 6, true, { toEmail: 'b@example.test' })]);
  expect(result.adminRequest).toMatchObject({ firstSentAt: at(6).toISOString(), reminderCount: 0 });
});
test('email projection is newest first, bounded, and excludes payloads, signed links and provider errors', () => {
  const logs = Array.from({ length: 55 }, (_, index) => ({ ...log('admin_approval_reminder', 1), id: String(index).padStart(3, '0'),
    createdAt: new Date(at(1).getTime() + index), success: false,
    error: 'provider secret https://example.test/?t=secret', payload: { signedUrl: 'secret' } }));
  const result = publicApprovalEmailLog(logs);
  expect(result).toHaveLength(50);
  expect(result[0]).toEqual({ kind: 'admin_reminder', toEmail: 'a@example.test',
    sentAt: logs[54]!.createdAt.toISOString(), success: false, error: 'email_failed' });
  expect(JSON.stringify(result)).not.toContain('secret');
  expect(publicApprovalEmailLog([log('teacher_followup', 1)])[0]?.error).toBeNull();
});
test('historical terminal rows retain metadata and nullable cadence without invented dates', () => {
  for (const [status, stopReason] of [['APPROVED', 'approved'], ['REDIRECTED', 'forwarded'], ['EXPIRED', 'manual'], ['SUPERSEDED', 'manual']]) {
    const result = approvalHistory([row('a', { status, stopReason, adminRole: 'Principal', autoRemindersStopped: true,
      firstSentAt: null, reminderCount: 0, lastReminderAt: null, lastReminderSource: null, nextAutoReminderAt: null,
      needsManualFollowUp: false, teacherFollowUpCount: 0, lastTeacherFollowUpAt: null })], []);
    expect(result.adminRequest).toEqual({ currentApprovalId: 'a', adminName: 'a', adminEmail: 'a@example.test', adminRole: 'Principal',
      status, firstSentAt: null, reminderCount: 0, lastReminderAt: null, lastReminderSource: null, nextAutoReminderAt: null,
      autoRemindersStopped: true, stopReason, needsManualFollowUp: false });
  }
});
