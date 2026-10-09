/*
  Grant a UA student license to an existing student membership by email.
  - Dry-run by default: prints the planned change, no writes.
  - Use --apply to write.

  Usage:
    bun run packages/prisma/scripts/grant-ua-student-license.ts \
      --email jncrew@gmail.com \
      --organization-id <UA_ORG_ID> \
      [--actor-id <MEMBERSHIP_OR_STAFF_ID>] \
      [--actor-email ops@example.com] \
      [--apply]
*/

import { PrismaClient, Prisma } from '@app/prisma';
import { UA_STUDENT_LICENSE_COHORT, UA_STUDENT_LICENSE_VALID_UNTIL } from '../../../services/web-app/app/domain/student-license/student-license.server.ts';
import { randomUUID } from 'node:crypto';

type Plan = {
  kind: 'plan';
  membershipId: string;
  organizationId: string;
  userId: string;
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
    userId: user.id,
    cohort: UA_STUDENT_LICENSE_COHORT,
    validUntil: UA_STUDENT_LICENSE_VALID_UNTIL,
    existing: existing || undefined,
  };
}

export async function grantUaStudentLicense(
  prisma: Pick<PrismaClient, 'studentLicense' | 'internalImpersonationEvent'>,
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

async function main() {
  const args = new Map<string, string | true>();
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i] || '';
    if (!a.startsWith('--')) continue;
    const [k, v] = a.split('=', 2);
    args.set(k.replace(/^--/, ''), v ?? true);
  }

  const email = (args.get('email') as string) || '';
  const organizationId = (args.get('organization-id') as string) || '';
  const apply = args.has('apply');
  const actorId = (args.get('actor-id') as string) || '';
  const actorEmail = (args.get('actor-email') as string) || '';

  const prisma = new PrismaClient();
  try {
    const planned = await planGrantUaStudentLicense(prisma, { email, organizationId });
    if (planned.kind === 'error') {
      console.error(planned.message);
      process.exit(2);
    }
    if (planned.kind === 'noop') {
      console.log(JSON.stringify(planned, null, 2));
      process.exit(0);
    }

    // Compute rollback plan text up-front
    const rollback = planned.existing
      ? {
          kind: 'update',
          sql: `UPDATE "StudentLicense" SET "status"='${planned.existing.status}', "validUntil"='${planned.existing.validUntil.toISOString()}' WHERE "membershipId"='${planned.membershipId}' AND "cohort"='${planned.cohort}';`,
          note:
            'Reverts status and validUntil on the existing license row identified by (membershipId, cohort).',
        }
      : {
          kind: 'delete',
          sql: `DELETE FROM "StudentLicense" WHERE "membershipId"='${planned.membershipId}' AND "cohort"='${planned.cohort}';`,
          note: 'Deletes the newly created license row.',
        };

    // Dry run (default)
    if (!apply) {
      console.log(
        JSON.stringify(
          {
            ...planned,
            auditPreview: {
              action: 'script.ua_license_grant.dry_run',
              resourceType: 'StudentLicense',
              resourceId: planned.existing?.id ?? '(pending)',
            },
            rollback,
          },
          null,
          2
        )
      );
      console.log('(dry-run — pass --apply to write)');
      process.exit(0);
    }

    // Apply
    const before = planned.existing ?? null;
    const applied = await grantUaStudentLicense(prisma, planned);

    // Append-only audit log entry (InternalImpersonationEvent)
    // Note: this table is used as a general internal audit ledger; we mint a synthetic session id.
    try {
      const requestId = randomUUID();
      const sessionId = `script:${requestId}`;
      const changes = {
        before,
        after: applied,
        actor: { actorId: actorId || '(unspecified)', actorEmail: actorEmail || '(unspecified)' },
        target: {
          userId: planned.userId,
          membershipId: planned.membershipId,
          organizationId: planned.organizationId,
          cohort: planned.cohort,
        },
      };
      await prisma.internalImpersonationEvent.create({
        data: {
          sessionId,
          actorId: actorId || '(unspecified)',
          userId: planned.userId,
          organizationId: planned.organizationId,
          action: 'script.ua_license_grant.apply',
          resourceType: 'StudentLicense',
          resourceId: applied.id,
          requestId: Buffer.from(JSON.stringify(changes)).toString('base64url'),
          requestAction: 'apply',
          jobId: `${planned.membershipId}:${planned.cohort}`,
        },
      });
    } catch (e) {
      console.error('Audit log write failed:', e);
      // Do not fail the operation; the license has already been applied.
    }

    console.log(
      JSON.stringify(
        {
          kind: 'applied',
          license: applied,
          rollback,
        },
        null,
        2
      )
    );
    process.exit(0);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

