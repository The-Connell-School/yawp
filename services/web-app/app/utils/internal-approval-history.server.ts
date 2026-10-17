import { Prisma } from '@app/prisma';
import { prisma } from './db.server';
import { approvalHistory, publicApprovalEmailLog, type ApprovalHistoryRow } from './internal-approval-history';

// #581 owns these additive fields. The allowlist supports current main and the
// dependency schema without selecting link IDs, request fingerprints or notes.
const baseFields = ['id', 'applicationId', 'createdAt', 'adminName', 'adminEmail', 'adminRole', 'status', 'decidedAt', 'redirectedFromId'];
const cadenceFields = ['firstSentAt', 'reminderCount', 'lastReminderAt', 'lastReminderSource', 'nextAutoReminderAt',
  'autoRemindersStopped', 'stopReason', 'needsManualFollowUp', 'teacherFollowUpCount', 'lastTeacherFollowUpAt', 'forwardedByRole'];
const availableFields = new Set(Prisma.dmmf.datamodel.models.find(model => model.name === 'FreeTierAdminApproval')?.fields.map(field => field.name));
const select = Object.fromEntries([...baseFields, ...cadenceFields.filter(field => availableFields.has(field))].map(field => [field, true])) as Prisma.FreeTierAdminApprovalSelect;

export function persistedApprovalFollowUpFilter() {
  // Before #581 there is no persisted follow-up state. Never infer it from a
  // count or post-filter a page; that would corrupt cursors and totals.
  return availableFields.has('needsManualFollowUp')
    ? { adminApprovals: { some: { needsManualFollowUp: true, status: 'PENDING' } } }
    : { id: { in: [] as string[] } };
}

export async function readApprovalHistories(applicationIds: string[]) {
  const approvals = await prisma.freeTierAdminApproval.findMany({
    where: { applicationId: { in: applicationIds } }, select,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  // Evidence must include accepted historical sends beyond the 50-row detail
  // display. Payloads and raw provider errors are never read.
  const emails = await prisma.freeTierEmailLog.findMany({
    where: { applicationId: { in: applicationIds }, success: true,
      kind: { in: ['admin_approval', 'admin_approval_reminder', 'teacher_followup'] } },
    select: { id: true, applicationId: true, createdAt: true, kind: true, toEmail: true, success: true },
  });
  return new Map(applicationIds.map(id => [id, approvalHistory(
    approvals.filter(row => row.applicationId === id) as unknown as ApprovalHistoryRow[],
    emails.filter(row => row.applicationId === id),
  )]));
}

export async function readApprovalEmailLog(applicationId: string) {
  return publicApprovalEmailLog(await prisma.freeTierEmailLog.findMany({
    where: { applicationId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 50,
    select: { id: true, createdAt: true, kind: true, toEmail: true, success: true },
  }));
}
