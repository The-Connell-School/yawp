/** Public projections. No signed links, delivery payloads or provider errors leave this module. */
export type ApprovalHistoryRow = {
  id: string; createdAt: Date; adminName: string; adminEmail: string; adminRole: string | null;
  status: string; decidedAt: Date | null; redirectedFromId: string | null;
  firstSentAt?: Date | null; reminderCount?: number; lastReminderAt?: Date | null;
  lastReminderSource?: string | null; nextAutoReminderAt?: Date | null;
  autoRemindersStopped?: boolean; stopReason?: string | null; needsManualFollowUp?: boolean;
  teacherFollowUpCount?: number; lastTeacherFollowUpAt?: Date | null; forwardedByRole?: string | null;
};
export type ApprovalEmailEvidence = {
  id: string; createdAt: Date; kind: string; toEmail: string; success: boolean;
};
const iso = (date: Date | null | undefined) => date?.toISOString() ?? null;
const order = (a: { createdAt: Date; id: string }, b: { createdAt: Date; id: string }) =>
  a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id);
const role = (value: string | null | undefined) => ['teacher', 'admin', 'staff'].includes(value ?? '') ? value : null;
const stop = (value: string | null | undefined) => ['max_reached', 'approved', 'forwarded', 'manual'].includes(value ?? '') ? value : null;

export function approvalHistory(approvals: ApprovalHistoryRow[], emails: ApprovalEmailEvidence[]) {
  const rows = [...approvals].sort(order);
  const current = rows.at(-1);
  const evidence = (row: ApprovalHistoryRow) => {
    const next = rows[rows.indexOf(row) + 1];
    return emails.filter(log => log.success && log.toEmail.toLowerCase() === row.adminEmail.toLowerCase()
      && log.createdAt >= row.createdAt && (!next || log.createdAt < next.createdAt)).sort(order);
  };
  const currentEmails = current ? evidence(current) : [];
  const reminders = currentEmails.filter(log => log.kind === 'admin_approval_reminder');
  const followUps = emails.filter(log => log.success && log.kind === 'teacher_followup').sort(order);
  const persistedTeacherCounts = rows.some(row => row.teacherFollowUpCount !== undefined);
  const latestTeacher = rows.map(row => row.lastTeacherFollowUpAt).filter((at): at is Date => !!at)
    .sort((a, b) => a.getTime() - b.getTime()).at(-1);
  return {
    adminRequest: current ? {
      currentApprovalId: current.id, adminName: current.adminName, adminEmail: current.adminEmail,
      adminRole: current.adminRole, status: current.status,
      firstSentAt: iso(current.firstSentAt ?? currentEmails.find(log => log.kind === 'admin_approval')?.createdAt),
      reminderCount: current.reminderCount ?? reminders.length,
      lastReminderAt: iso(current.lastReminderAt ?? reminders.at(-1)?.createdAt),
      lastReminderSource: ['auto', 'manual'].includes(current.lastReminderSource ?? '') ? current.lastReminderSource : null,
      nextAutoReminderAt: current.autoRemindersStopped ? null : iso(current.nextAutoReminderAt),
      autoRemindersStopped: current.autoRemindersStopped ?? false,
      stopReason: stop(current.stopReason), needsManualFollowUp: current.needsManualFollowUp ?? false,
    } : null,
    teacherFollowUps: { count: persistedTeacherCounts ? rows.reduce((sum, row) => sum + (row.teacherFollowUpCount ?? 0), 0) : followUps.length,
      lastSentAt: iso(persistedTeacherCounts ? latestTeacher : followUps.at(-1)?.createdAt) },
    forwards: rows.flatMap(replacement => {
      const previous = rows.find(row => row.id === replacement.redirectedFromId);
      return previous ? [{ approvalId: previous.id, fromAdminName: previous.adminName, fromAdminEmail: previous.adminEmail,
        toAdminName: replacement.adminName, toAdminEmail: replacement.adminEmail,
        forwardedAt: iso(previous.decidedAt), byRole: role(replacement.forwardedByRole) }] : [];
    }),
  };
}

export function publicApprovalEmailLog(logs: ApprovalEmailEvidence[]) {
  return [...logs].sort((a, b) => order(b, a)).slice(0, 50).map(log => ({
    kind: log.kind === 'admin_approval_reminder' ? 'admin_reminder' : log.kind,
    toEmail: log.toEmail, sentAt: log.createdAt.toISOString(), success: log.success,
    error: log.success ? null : 'email_failed',
  }));
}
