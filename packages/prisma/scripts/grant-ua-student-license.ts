/* 
  Grant a UA student license to an existing student membership by email.
  - Dry-run by default: prints the planned change, no writes.
  - Use --yes to apply.

  Usage:
    bun run packages/prisma/scripts/grant-ua-student-license.ts \
      --email jncrew@gmail.com \
      --organization-id <UA_ORG_ID> \
      [--yes]
*/

import { PrismaClient, Prisma } from '@app/prisma';
import { UA_STUDENT_LICENSE_COHORT, UA_STUDENT_LICENSE_VALID_UNTIL } from '../../../services/web-app/app/domain/student-license/student-license.server.ts';

type Plan = {
  kind: 'plan';
  membershipId: string;
  organizationId: string;
  cohort: string;
  validUntil: Date;
  existing?: { id: string; status: string; validUntil: Date };
};

type Result =
  | Plan
  | { kind: 'noop'; reason: string }
  | { kind: 'error'; message: string };

export async function planGrantUaStudentLicense(
  prisma: Pick<PrismaClient, 'user' | 'orgMembership' | 'studentLicense'>,
  {
    email,
    organizationId,
  }: {
    email: string;
    organizationId: string;
  }
): Promise<Result> {
  const normalizedEmail = email.trim();
  if (!normalizedEmail) return { kind: 'error', message: 'Email is required' };
  if (!organizationId) return { kind: 'error', message: 'organization-id is required' };

  const user = await prisma.user.findFirst({
    where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
    select: { id: true, email: true },
  });
  if (!user) {
    return {
      kind: 'error',
      message:
        'User not found. Ask the user to complete UA signup at /ua/sign-up first.',
    };
  }

  const membership = await prisma.orgMembership.findFirst({
    where: {
      userId: user.id,
      organizationId,
      role: 'STUDENT',
      isActive: true,
    },
    select: { id: true, organizationId: true },
  });
  if (!membership) {
    return {
      kind: 'error',
      message:
        'Active STUDENT membership in the specified organization not found. Ensure the user verified the invitation and belongs to the UA org.',
    };
  }

  const existing = await prisma.studentLicense.findUnique({
    where: {
      membershipId_cohort: {
        membershipId: membership.id,
        cohort: UA_STUDENT_LICENSE_COHORT,
      },
    },
    select: { id: true, status: true, validUntil: true },
  });

  if (
    existing &&
    existing.status === 'ACTIVE' &&
    existing.validUntil.getTime() > Date.now()
  ) {
    return { kind: 'noop', reason: 'License already ACTIVE and valid in the future' };
  }

  return {
    kind: 'plan',
    membershipId: membership.id,
    organizationId: membership.organizationId,
    cohort: UA_STUDENT_LICENSE_COHORT,
    validUntil: UA_STUDENT_LICENSE_VALID_UNTIL,
    existing: existing || undefined,
  };
}

export async function grantUaStudentLicense(
  prisma: Pick<PrismaClient, 'studentLicense'>,
  plan: Extract<Plan, { kind: 'plan' }>
) {
  const { membershipId, organizationId, cohort, validUntil } = plan;
  const upsert = await prisma.studentLicense.upsert({
    where: { membershipId_cohort: { membershipId, cohort } },
    create: {
      membershipId,
      organizationId,
      cohort,
      status: 'ACTIVE',
      source: 'MANUAL',
      validUntil,
    },
    update: {
      status: 'ACTIVE',
      source: 'MANUAL',
      validUntil,
    },
    select: { id: true, status: true, validUntil: true },
  });
  return upsert;
}

if (import.meta.main) {
  const args = new Map<string, string | true>();
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i] || '';
    if (a.startsWith('--')) {
      const [k, v] = a.split('=', 2);
      args.set(k.replace(/^--/, ''), v ?? true);
    }
  }

  const email = (args.get('email') as string) || '';
  const organizationId = (args.get('organization-id') as string) || '';
  const yes = args.has('yes');

  const prisma = new PrismaClient();
  try {
    const planned = await planGrantUaStudentLicense(prisma, { email, organizationId });
    if (planned.kind === 'error') {
      console.error(planned.message);
      process.exitCode = 2;
      return;
    }
    if (planned.kind === 'noop') {
      console.log(JSON.stringify(planned, null, 2));
      return;
    }
    // Dry run
    if (!yes) {
      console.log(JSON.stringify(planned, null, 2));
      console.log('(dry-run — pass --yes to apply)');
      return;
    }
    const applied = await grantUaStudentLicense(prisma, planned);
    console.log(JSON.stringify({ kind: 'applied', ...applied }, null, 2));
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

