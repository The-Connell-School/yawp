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

export function filterAssignmentTypesForOrganizationPlan<
  T extends { kind?: string | null | undefined },
>(organization: Pick<Organization, 'plan'>, types: T[]): T[] {
  if (organization.plan !== 'FREE_CLASSROOM') return types;
  return types.filter((type) => isFreeClassroomAssignmentKind(type.kind));
}

const usageClient = (client: Pick<typeof prisma, 'freeClassroomAssignmentKindUsage'>) =>
  client.freeClassroomAssignmentKindUsage;

export async function getLifetimeAssignmentKindCount(
  organizationId: string,
  kind: string,
  client: Pick<typeof prisma, 'freeClassroomAssignmentKindUsage'> = prisma
) {
  const row = await usageClient(client).findUnique({
    where: { organizationId_kind: { organizationId, kind } },
    select: { lifetimeCreatedCount: true },
  });
  return row?.lifetimeCreatedCount ?? 0;
}

async function incrementLifetimeAssignmentKindCount(
  tx: Prisma.TransactionClient,
  organizationId: string,
  kind: FreeClassroomAssignmentQuotaKind
) {
  await tx.freeClassroomAssignmentKindUsage.upsert({
    where: { organizationId_kind: { organizationId, kind } },
    create: { organizationId, kind, lifetimeCreatedCount: 1 },
    update: { lifetimeCreatedCount: { increment: 1 } },
  });
}

export async function getFreeClassroomAssignmentQuotaUsage(
  organizationId: string,
  client: Pick<typeof prisma, 'freeClassroomAssignmentKindUsage'> = prisma
) {
  const usage = new Map<FreeClassroomAssignmentQuotaKind, number>();
  for (const kind of FREE_CLASSROOM_ASSIGNMENT_KINDS) {
    usage.set(
      kind,
      await getLifetimeAssignmentKindCount(organizationId, kind, client)
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
    const created =
      type.kind && isFreeClassroomAssignmentKind(type.kind)
        ? usage.get(type.kind) ?? 0
        : 0;
    byId.set(
      type.id,
      buildAssignmentCreationQuotaFields(organization.plan, type.kind, created)
    );
  }
  return byId;
}

export async function resolveOrganizationForClassIds(
  tx: Prisma.TransactionClient,
  classIds: string[]
): Promise<Pick<Organization, 'id' | 'plan'> | null> {
  if (classIds.length === 0) return null;
  const unique = [...new Set(classIds)];
  const rows = await tx.class.findMany({
    where: { id: { in: unique } },
    select: {
      id: true,
      school: { select: { organization: { select: { id: true, plan: true } } } },
    },
  });
  if (rows.length !== unique.length) {
    throw new Error('class_not_found_for_assignment_deploy');
  }
  const orgIds = new Set(rows.map((row) => row.school.organization.id));
  if (orgIds.size !== 1) {
    throw new Error('assignment_deploy_classes_must_share_organization');
  }
  return rows[0]!.school.organization;
}

async function assertCanConsumeAssignmentKindSlot(
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
  const created = await getLifetimeAssignmentKindCount(
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

export async function assertCanCreateAssignmentOfKindInTransaction(
  tx: Prisma.TransactionClient,
  organization: Pick<Organization, 'id' | 'plan'>,
  kind: string | null | undefined
) {
  await assertCanConsumeAssignmentKindSlot(tx, organization, kind);
  if (organization.plan === 'FREE_CLASSROOM' && isFreeClassroomAssignmentKind(kind)) {
    await incrementLifetimeAssignmentKindCount(tx, organization.id, kind);
  }
}

export async function assertCanRetypeAssignmentOfKindInTransaction(
  tx: Prisma.TransactionClient,
  organization: Pick<Organization, 'id' | 'plan'>,
  previousKind: string | null | undefined,
  nextKind: string | null | undefined
) {
  if (organization.plan !== 'FREE_CLASSROOM') return;
  if (previousKind === nextKind) return;
  await assertCanCreateAssignmentOfKindInTransaction(tx, organization, nextKind);
}

export async function enforceFreeClassroomAssignmentCreateInTransaction(
  tx: Prisma.TransactionClient,
  params: {
    classIds: string[];
    assignmentTypeId: string;
  }
) {
  const organization = await resolveOrganizationForClassIds(tx, params.classIds);
  if (!organization || organization.plan !== 'FREE_CLASSROOM') return;
  const assignmentType = await tx.assignmentType.findUnique({
    where: { id: params.assignmentTypeId },
    select: { kind: true },
  });
  await assertCanCreateAssignmentOfKindInTransaction(
    tx,
    organization,
    assignmentType?.kind ?? null
  );
}

export async function enforceFreeClassroomAssignmentRetypeInTransaction(
  tx: Prisma.TransactionClient,
  params: {
    classIds: string[];
    previousAssignmentTypeId: string;
    nextAssignmentTypeId: string;
  }
) {
  const organization = await resolveOrganizationForClassIds(tx, params.classIds);
  if (!organization || organization.plan !== 'FREE_CLASSROOM') return;
  const types = await tx.assignmentType.findMany({
    where: { id: { in: [params.previousAssignmentTypeId, params.nextAssignmentTypeId] } },
    select: { id: true, kind: true },
  });
  const byId = new Map(types.map((row) => [row.id, row.kind]));
  await assertCanRetypeAssignmentOfKindInTransaction(
    tx,
    organization,
    byId.get(params.previousAssignmentTypeId) ?? null,
    byId.get(params.nextAssignmentTypeId) ?? null
  );
}

/** No-op for SCHOOL and other plans; free classroom cap enforced in-transaction. */
export async function assertCanCreateClassForOrganizationPlan(
  tx: Prisma.TransactionClient,
  organization: Pick<Organization, 'id' | 'plan'>
) {
  if (organization.plan !== 'FREE_CLASSROOM') return;
  await assertCanCreateClassInTransaction(tx, organization);
}

export async function assertCanCreateClassInTransaction(
  tx: Prisma.TransactionClient,
  organization: Pick<Organization, 'id' | 'plan'>
) {
  const entitlements = getEntitlements(organization);
  if (entitlements.activeClassCap == null) return;
  await tx.$executeRawUnsafe(
    `SELECT pg_advisory_xact_lock(hashtext('free_classroom_active_class:' || $1))`,
    organization.id
  );
  const currentActiveClasses = await tx.class.count({
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

/** @deprecated Prefer assertCanCreateClassInTransaction inside the create transaction. */
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
