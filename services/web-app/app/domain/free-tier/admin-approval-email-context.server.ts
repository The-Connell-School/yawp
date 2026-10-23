import type { FreeTierAdminApproval, Prisma } from '@app/prisma';
import { prisma } from '~/utils/db.server';
import { adminApprovalTeacherRerouteLeadMarker } from './admin-approval-copy';

export type AdminApprovalEmailContext = {
  forwardedByAdminName?: string | null;
  routedByTeacher?: boolean;
};

type Tx = Prisma.TransactionClient;

export async function resolveAdminApprovalEmailContext(
  approval: Pick<
    FreeTierAdminApproval,
    'redirectedFromId' | 'forwardedByRole'
  >,
  db: Tx | typeof prisma = prisma
): Promise<AdminApprovalEmailContext> {
  if (approval.forwardedByRole === 'teacher') {
    return { routedByTeacher: true };
  }
  if (!approval.redirectedFromId) return {};
  const previous = await db.freeTierAdminApproval.findUnique({
    where: { id: approval.redirectedFromId },
    select: { adminName: true },
  });
  if (!previous?.adminName.trim()) return {};
  return { forwardedByAdminName: previous.adminName.trim() };
}

export function adminApprovalEmailContextFromStoredMessage(args: {
  text: string;
  forwardedByAdminName?: string | null;
  routedByTeacher?: boolean;
}): AdminApprovalEmailContext {
  if (args.routedByTeacher) return { routedByTeacher: true };
  if (args.forwardedByAdminName?.trim()) {
    return { forwardedByAdminName: args.forwardedByAdminName.trim() };
  }
  const forwardLead = args.text.match(
    /^(.+) forwarded this to you as the right person/m
  );
  if (forwardLead?.[1]?.trim()) {
    return { forwardedByAdminName: forwardLead[1].trim() };
  }
  if (args.text.includes(adminApprovalTeacherRerouteLeadMarker())) {
    return { routedByTeacher: true };
  }
  return {};
}

export function mergeAdminApprovalEmailContext(
  fromApproval: AdminApprovalEmailContext,
  fromMessage: AdminApprovalEmailContext
): AdminApprovalEmailContext {
  if (fromApproval.routedByTeacher) {
    return { routedByTeacher: true };
  }
  if (fromMessage.routedByTeacher || fromMessage.forwardedByAdminName) {
    return fromMessage;
  }
  return fromApproval;
}
