import { redirect } from 'react-router';
import { prisma } from '~/utils/db.server';
import { getEntitlementsForPlan } from '~/utils/entitlements.server';

const OPEN_PREFIXES = [
  '/app/free-tier',
  '/auth/logout',
];

export async function enforceFreeTierTeacherGate(args: {
  userId: string;
  pathname: string;
  organizationPlan?: string;
}) {
  const application = await prisma.freeTierApplication.findFirst({
    where: { userId: args.userId },
    select: {
      id: true,
      status: true,
      organizationId: true,
      adminApprovals: {
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { adminName: true, adminEmail: true },
      },
    },
  });
  if (!application) return null;

  const open = OPEN_PREFIXES.some((p) => args.pathname === p || args.pathname.startsWith(`${p}/`));
  if (application.status === 'REJECTED' || application.status === 'EXPIRED') {
    if (!open) throw redirect('/app/free-tier/status');
    return application;
  }

  if (application.status === 'APPROVED') {
    if (application.organizationId) {
      const activeClasses = await prisma.class.count({
        where: {
          isArchived: false,
          teachers: {
            some: { userId: args.userId },
          },
        },
      });
      const cap = getEntitlementsForPlan('FREE_CLASSROOM').activeClassCap;
      if (activeClasses < (cap ?? 1) && !args.pathname.startsWith('/app/free-tier/setup')) {
        throw redirect('/app/free-tier/setup');
      }
    }
    return application;
  }

  if (
    application.status === 'SENT' ||
    application.status === 'ADMIN_SUBMITTED' ||
    application.status === 'MANUAL_REVIEW'
  ) {
    if (!args.pathname.startsWith('/app/free-tier/pending')) {
      throw redirect('/app/free-tier/pending');
    }
    return application;
  }

  if (application.status === 'ACCOUNT_CREATED') {
    if (!args.pathname.startsWith('/app/free-tier/onboarding')) {
      throw redirect('/app/free-tier/onboarding');
    }
    return application;
  }

  return application;
}
