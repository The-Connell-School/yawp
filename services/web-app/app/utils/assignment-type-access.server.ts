import { prisma } from '~/utils/db.server';

export const ASSIGNMENT_TYPE_ACCESS_FEATURE_PREFIX = 'assignment_type:';

const ASSIGNMENT_TYPE_ACCESS_TARGET_KINDS = [
  'teacher',
  'school',
  'organization',
] as const;

type AssignmentTypeAccessTargetKind =
  (typeof ASSIGNMENT_TYPE_ACCESS_TARGET_KINDS)[number];

export type AssignmentTypeAccessScope = {
  organizationId: string | null | undefined;
  schoolId?: string | null | undefined;
  teacherProfileId?: string | null | undefined;
};

type AssignmentTypeAccessTarget = {
  featureKey: string;
  targetKind: string;
  targetId: string;
  enabled: boolean;
};

type AssignmentTypeAccessCandidate = {
  id: string;
  organizationAssignments: Array<{ organizationId: string }>;
};

function distinctStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value)))
  );
}

function normalizeScopes(scopes: AssignmentTypeAccessScope[]) {
  return scopes.filter((scope) => Boolean(scope.organizationId));
}

export function getAssignmentTypeAccessFeatureKey(assignmentTypeId: string) {
  return `${ASSIGNMENT_TYPE_ACCESS_FEATURE_PREFIX}${assignmentTypeId}`;
}

function getAssignmentTypeIdFromFeatureKey(featureKey: string) {
  return featureKey.startsWith(ASSIGNMENT_TYPE_ACCESS_FEATURE_PREFIX)
    ? featureKey.slice(ASSIGNMENT_TYPE_ACCESS_FEATURE_PREFIX.length)
    : null;
}

function buildTargetIds(scopes: AssignmentTypeAccessScope[]) {
  return {
    organizationIds: distinctStrings(
      scopes.map((scope) => scope.organizationId)
    ),
    schoolIds: distinctStrings(scopes.map((scope) => scope.schoolId)),
    teacherProfileIds: distinctStrings(
      scopes.map((scope) => scope.teacherProfileId)
    ),
  };
}

async function getAssignmentTypeAccessTargetsForScopes({
  assignmentTypeIds,
  scopes,
}: {
  assignmentTypeIds?: string[];
  scopes: AssignmentTypeAccessScope[];
}): Promise<AssignmentTypeAccessTarget[]> {
  const normalizedScopes = normalizeScopes(scopes);
  if (normalizedScopes.length === 0) return [];

  const { organizationIds, schoolIds, teacherProfileIds } =
    buildTargetIds(normalizedScopes);
  const targetIds = distinctStrings([
    ...organizationIds,
    ...schoolIds,
    ...teacherProfileIds,
  ]);
  if (targetIds.length === 0) return [];

  return prisma.featureAccessTarget.findMany({
    where: {
      featureKey: assignmentTypeIds?.length
        ? {
            in: assignmentTypeIds.map((assignmentTypeId) =>
              getAssignmentTypeAccessFeatureKey(assignmentTypeId)
            ),
          }
        : { startsWith: ASSIGNMENT_TYPE_ACCESS_FEATURE_PREFIX },
      targetKind: { in: [...ASSIGNMENT_TYPE_ACCESS_TARGET_KINDS] },
      targetId: { in: targetIds },
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: {
      featureKey: true,
      targetKind: true,
      targetId: true,
      enabled: true,
    },
  });
}

function matchesTarget(
  target: AssignmentTypeAccessTarget,
  kind: AssignmentTypeAccessTargetKind,
  targetId: string | null | undefined
) {
  return (
    target.targetKind === kind &&
    Boolean(targetId) &&
    target.targetId === targetId
  );
}

function resolveAssignmentTypeOverride({
  assignmentTypeId,
  accessTargets,
  scope,
}: {
  assignmentTypeId: string;
  accessTargets: AssignmentTypeAccessTarget[];
  scope: AssignmentTypeAccessScope;
}): boolean | null {
  const featureKey = getAssignmentTypeAccessFeatureKey(assignmentTypeId);
  const scopedTargets = accessTargets.filter(
    (target) => target.featureKey === featureKey
  );

  for (const [kind, targetId] of [
    ['teacher', scope.teacherProfileId],
    ['school', scope.schoolId],
    ['organization', scope.organizationId],
  ] as const) {
    const match = scopedTargets.find((target) =>
      matchesTarget(target, kind, targetId)
    );
    if (match) return match.enabled;
  }

  return null;
}

function hasOrganizationDefault(
  assignmentType: AssignmentTypeAccessCandidate,
  scope: AssignmentTypeAccessScope
) {
  return assignmentType.organizationAssignments.some(
    (assignment) => assignment.organizationId === scope.organizationId
  );
}

function isAssignmentTypeVisibleForScope({
  assignmentType,
  accessTargets,
  scope,
}: {
  assignmentType: AssignmentTypeAccessCandidate;
  accessTargets: AssignmentTypeAccessTarget[];
  scope: AssignmentTypeAccessScope;
}) {
  const override = resolveAssignmentTypeOverride({
    assignmentTypeId: assignmentType.id,
    accessTargets,
    scope,
  });

  if (override !== null) return override;
  return hasOrganizationDefault(assignmentType, scope);
}

export async function getAvailableAssignmentTypesForScopes<
  TResult extends { id: string },
  TSelect extends Record<string, unknown> = Record<string, unknown>,
>({
  scopes,
  select,
  orderBy,
}: {
  scopes: AssignmentTypeAccessScope[];
  select: TSelect;
  orderBy?: unknown;
}): Promise<TResult[]> {
  const normalizedScopes = normalizeScopes(scopes);
  if (normalizedScopes.length === 0) return [];

  const accessTargets = await getAssignmentTypeAccessTargetsForScopes({
    scopes: normalizedScopes,
  });
  const targetedAssignmentTypeIds = distinctStrings(
    accessTargets.map((target) =>
      getAssignmentTypeIdFromFeatureKey(target.featureKey)
    )
  );
  const { organizationIds } = buildTargetIds(normalizedScopes);
  const accessOr = [
    organizationIds.length > 0
      ? {
          organizationAssignments: {
            some: { organizationId: { in: organizationIds } },
          },
        }
      : null,
    targetedAssignmentTypeIds.length > 0
      ? { id: { in: targetedAssignmentTypeIds } }
      : null,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));

  if (accessOr.length === 0) return [];

  const candidates = await prisma.assignmentType.findMany({
    where: {
      archivedAt: null,
      OR: accessOr,
    },
    select: {
      ...select,
      id: true,
      organizationAssignments: {
        select: { organizationId: true },
      },
    },
    orderBy,
  } as never);

  const keepOrganizationAssignments = Boolean(select.organizationAssignments);

  return (
    candidates as unknown as Array<
      AssignmentTypeAccessCandidate & Record<string, unknown>
    >
  )
    .filter((assignmentType) =>
      normalizedScopes.some((scope) =>
        isAssignmentTypeVisibleForScope({
          assignmentType,
          accessTargets,
          scope,
        })
      )
    )
    .map((assignmentType) => {
      if (keepOrganizationAssignments) return assignmentType;
      const { organizationAssignments: _organizationAssignments, ...rest } =
        assignmentType;
      return rest;
    }) as TResult[];
}

export async function isAssignmentTypeAvailableForEveryScope({
  assignmentTypeId,
  scopes,
}: {
  assignmentTypeId: string;
  scopes: AssignmentTypeAccessScope[];
}) {
  const normalizedScopes = normalizeScopes(scopes);
  if (normalizedScopes.length === 0) return false;

  const [assignmentType, accessTargets] = await Promise.all([
    prisma.assignmentType.findFirst({
      where: { id: assignmentTypeId, archivedAt: null },
      select: {
        id: true,
        organizationAssignments: {
          select: { organizationId: true },
        },
      },
    }),
    getAssignmentTypeAccessTargetsForScopes({
      assignmentTypeIds: [assignmentTypeId],
      scopes: normalizedScopes,
    }),
  ]);

  if (!assignmentType) return false;

  return normalizedScopes.every((scope) =>
    isAssignmentTypeVisibleForScope({
      assignmentType,
      accessTargets,
      scope,
    })
  );
}

export async function isAssignmentTypeAvailableForAnyScope({
  assignmentTypeId,
  scopes,
}: {
  assignmentTypeId: string;
  scopes: AssignmentTypeAccessScope[];
}) {
  const normalizedScopes = normalizeScopes(scopes);
  if (normalizedScopes.length === 0) return false;

  const [assignmentType, accessTargets] = await Promise.all([
    prisma.assignmentType.findFirst({
      where: { id: assignmentTypeId, archivedAt: null },
      select: {
        id: true,
        organizationAssignments: {
          select: { organizationId: true },
        },
      },
    }),
    getAssignmentTypeAccessTargetsForScopes({
      assignmentTypeIds: [assignmentTypeId],
      scopes: normalizedScopes,
    }),
  ]);

  if (!assignmentType) return false;

  return normalizedScopes.some((scope) =>
    isAssignmentTypeVisibleForScope({
      assignmentType,
      accessTargets,
      scope,
    })
  );
}
