import type { Organization, OrganizationPlan, Prisma } from '@app/prisma';
import {
  FREE_CLASSROOM_ASSIGNMENT_KINDS,
  FREE_CLASSROOM_ASSIGNMENT_QUOTAS,
  type FreeClassroomAssignmentQuotaKind,
  getEntitlements,
  getEntitlementsForPlan,
} from '~/utils/entitlements.server';
import { prisma } from '~/utils/db.server';

export class FreeClassroomAssignmentQuotaError extends Error {
  readonly code: 'quota_exhausted' | 'kind_not_allowed';
  readonly kind: string | null;

  constructor(
    message: string,
    code: 'quota_exhausted' | 'kind_not_allowed',
    kind: string | null
  ) {
    super(message);
    this.name = 'FreeClassroomAssignmentQuotaError';
    this.code = code;
    this.kind = kind;
  }
}

export function freeClassroomQuotaMessage(
  kind: FreeClassroomAssignmentQuotaKind,
  remaining: number
) {
  const labels: Record<FreeClassroomAssignmentQuotaKind, string> = {
    class_starter: 'Class Starters',
    prewriting: 'Prewriting assignments',
    thesis_statement: 'Thesis Statement assignments',
  };
  const cap = FREE_CLASSROOM_ASSIGNMENT_QUOTAS[kind];
  if (remaining <= 0) {
    return `You've used all ${cap} free ${labels[kind]}.`;
  }
  return `${remaining} of ${cap} ${labels[kind]} left`;
}

export function isFreeClassroomAssignmentKind(
  kind: string | null | undefined
): kind is FreeClassroomAssignmentQuotaKind {
  return Boolean(
    kind && FREE_CLASSROOM_ASSIGNMENT_KINDS.includes(kind as FreeClassroomAssignmentQuotaKind)
  );
}

export async function countAssignmentsOfKindForOrganization(
  organizationId: string,
  kind: string,
  client: Pick<typeof prisma, 'assignment'> = prisma
) {
  return client.assignment.count({
    where: {
      assignmentType: { kind },
      classAssignments: {
        some: {
          class: {
            school: { organizationId },
          },
        },
      },
    },
  });
}

export async function getFreeClassroomAssignmentQuotaUsage(
  organizationId: string,
  client: Pick<typeof prisma, 'assignment'> = prisma
) {
  const usage = new Map<FreeClassroomAssignmentQuotaKind, number>();
  for (const kind of FREE_CLASSROOM_ASSIGNMENT_KINDS) {
    usage.set(
      kind,
      await countAssignmentsOfKindForOrganization(organizationId, kind, client)
    );
  }
  return usage;
}

export function buildAssignmentCreationQuotaFields(
  plan: OrganizationPlan,
  kind: string | null | undefined,
  createdCount: number
) {
  if (plan !== 'FREE_CLASSROOM' || !isFreeClassroomAssignmentKind(kind)) {
    return {};
  }
  const cap = FREE_CLASSROOM_ASSIGNMENT_QUOTAS[kind];
  const remaining = Math.max(0, cap - createdCount);
  return {
    kind,
    quotaTotal: cap,
    quotaRemaining: remaining,
    quotaLabel: freeClassroomQuotaMessage(kind, remaining),
    quotaExhausted: remaining <= 0,
    quotaExhaustedMessage: freeClassroomQuotaMessage(kind, 0),
  };
}

export async function loadAssignmentCreationQuotasForTypes(
  organization: Pick<Organization, 'id' | 'plan'>,
  types: Array<{ id: string; kind: string | null }>
) {
  if (organization.plan !== 'FREE_CLASSROOM') {
    return new Map<string, ReturnType<typeof buildAssignmentCreationQuotaFields>>();
  }
  const usage = await getFreeClassroomAssignmentQuotaUsage(organization.id);
  const byId = new Map<
    string,
    ReturnType<typeof buildAssignmentCreationQuotaFields>
  >();
  for (const type of types) {
    const created = type.kind && isFreeClassroomAssignmentKind(type.kind)
      ? usage.get(type.kind) ?? 0
      : 0;
    byId.set(
      type.id,
      buildAssignmentCreationQuotaFields(organization.plan, type.kind, created)
    );
  }
  return byId;
}

export async function assertCanCreateAssignmentOfKindInTransaction(
  tx: Prisma.TransactionClient,
  organization: Pick<Organization, 'id' | 'plan'>,
  kind: string | null | undefined
) {
  if (organization.plan !== 'FREE_CLASSROOM') return;
  if (!isFreeClassroomAssignmentKind(kind)) {
    throw new FreeClassroomAssignmentQuotaError(
      'That assignment type is not included in the free classroom bundle.',
      'kind_not_allowed',
      kind ?? null
    );
  }
  await tx.$executeRawUnsafe(
    `SELECT pg_advisory_xact_lock(hashtext('free_classroom_assignment_quota:' || $1))`,
    organization.id
  );
  const created = await countAssignmentsOfKindForOrganization(
    organization.id,
    kind,
    tx
  );
  const entitlements = getEntitlementsForPlan(organization.plan);
  if (!entitlements.canCreateAssignmentOfKind({ kind, createdCount: created })) {
    throw new FreeClassroomAssignmentQuotaError(
      freeClassroomQuotaMessage(kind, 0),
      'quota_exhausted',
      kind
    );
  }
}

export async function assertCanCreateClassForOrganization(
  organization: Pick<Organization, 'id' | 'plan'>,
  client: Pick<typeof prisma, 'class'> = prisma
) {
  const entitlements = getEntitlements(organization);
  if (entitlements.activeClassCap == null) return;
  const currentActiveClasses = await client.class.count({
    where: {
      isArchived: false,
      school: { organizationId: organization.id },
    },
  });
  if (!entitlements.canCreateClass({ currentActiveClasses })) {
    throw new Error(
      'Free classroom accounts include one class. Archive your existing class or upgrade to add another.'
    );
  }
}
