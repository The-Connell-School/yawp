import { redirect } from 'react-router';
import { prisma } from '~/utils/db.server';

const TERMINAL_OPEN_PATHS = ['/app/free-tier/status', '/auth/logout'];

function isTerminalOpenPath(pathname: string) {
  return TERMINAL_OPEN_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

export type FreeTierGateApplication = {
  id: string;
  status: string;
  organizationId: string | null;
  adminApprovals: Array<{ adminName: string; adminEmail: string }>;
};

export async function loadFreeTierGateApplication(
  userId: string
): Promise<FreeTierGateApplication | null> {
  return prisma.freeTierApplication.findFirst({
    where: { userId },
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
}

export async function enforceFreeTierTeacherGate(args: {
  userId: string;
  pathname: string;
  organizationPlan?: string;
  application?: FreeTierGateApplication | null;
}) {
  const application =
    args.application === undefined
      ? await loadFreeTierGateApplication(args.userId)
      : args.application;
  if (!application) return null;

  if (application.status === 'REJECTED' || application.status === 'EXPIRED') {
    if (!isTerminalOpenPath(args.pathname)) throw redirect('/app/free-tier/status');
    return application;
  }

  // APPROVED teachers use normal /app routes (setup redirect removed — see gate tests).
  if (application.status === 'APPROVED') {
    return application;
  }

  if (application.status === 'SENT' || application.status === 'MANUAL_REVIEW') {
    if (!args.pathname.startsWith('/app/free-tier/pending')) {
      throw redirect('/app/free-tier/pending');
    }
    return application;
  }

  if (application.status === 'ADMIN_SUBMITTED') {
    if (!args.pathname.startsWith('/app/free-tier/onboarding')) {
      throw redirect('/app/free-tier/onboarding');
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
