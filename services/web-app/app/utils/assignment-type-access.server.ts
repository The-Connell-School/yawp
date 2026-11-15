import { AP_HISTORY_ASSIGNMENT_TYPE_KEY } from '~/domain/ap-history/schema';
import type { Prisma } from '@app/prisma';
import { prisma } from '~/utils/db.server';

/**
 * AP History is retired from prod (Bryant, Nov 14 2026): no teacher, student,
 * admin or Lesson Planner surface may offer it. Closed PRs keep the feature for
 * a later revival; until then every availability check excludes it here.
 * `systemKey` is nullable, so the OR keeps rows with no system key.
 */
export const RETIRED_ASSIGNMENT_TYPE_WHERE = {
  OR: [
    { systemKey: null },
    { systemKey: { not: AP_HISTORY_ASSIGNMENT_TYPE_KEY } },
  ],
} satisfies Prisma.AssignmentTypeWhereInput;

/** List UIs hide AP History assignments; rows stay in the database. */
export const HIDE_AP_HISTORY_CLASS_ASSIGNMENT_WHERE = {
  NOT: {
    assignment: {
      assignmentType: { systemKey: AP_HISTORY_ASSIGNMENT_TYPE_KEY },
    },
  },
} satisfies Prisma.ClassAssignmentWhereInput;

/** List UIs hide student/teacher documents tied to AP History assignments. */
export const HIDE_AP_HISTORY_DOCUMENT_WHERE = {
  NOT: {
    assignment: {
      assignmentType: { systemKey: AP_HISTORY_ASSIGNMENT_TYPE_KEY },
    },
  },
} satisfies Prisma.DocumentWhereInput;

export type AssignmentTypeAccessScope = {
  organizationId: string | null | undefined;
  schoolId?: string | null | undefined;
  teacherProfileId?: string | null | undefined;
};

type ScopeConfiguration = {
  orgDefaultsByOrgId: Map<string, Set<string>>;
  schoolsById: Map<
    string,
    {
      organizationId: string;
      assignmentTypesCustomized: boolean;
      assignmentTypeIds: Set<string>;
    }
  >;
  teachersById: Map<
    string,
    {
      organizationId: string;
      assignmentTypesCustomized: boolean;
      assignmentTypeIds: Set<string>;
    }
  >;
};

function distinctStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value)))
  );
}

function normalizeScopes(scopes: AssignmentTypeAccessScope[]) {
  return scopes.filter((scope) => Boolean(scope.organizationId));
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

async function loadScopeConfiguration(
  scopes: AssignmentTypeAccessScope[]
): Promise<ScopeConfiguration> {
  const normalizedScopes = normalizeScopes(scopes);
  const { organizationIds, schoolIds, teacherProfileIds } =
    buildTargetIds(normalizedScopes);

  const [orgAssignments, schools, teachers] = await Promise.all([
    organizationIds.length > 0
      ? prisma.organizationAssignmentType.findMany({
          where: { organizationId: { in: organizationIds } },
          select: { organizationId: true, assignmentTypeId: true },
        })
      : [],
    schoolIds.length > 0
      ? prisma.school.findMany({
          where: { id: { in: schoolIds } },
          select: {
            id: true,
            organizationId: true,
            assignmentTypesCustomized: true,
            assignmentTypeAssignments: {
              select: { assignmentTypeId: true },
            },
          },
        })
      : [],
    teacherProfileIds.length > 0
      ? prisma.orgMembership.findMany({
          where: { id: { in: teacherProfileIds } },
          select: {
            id: true,
            organizationId: true,
            assignmentTypesCustomized: true,
            assignmentTypeAssignments: {
              select: { assignmentTypeId: true },
            },
          },
        })
      : [],
  ]);

  const orgDefaultsByOrgId = new Map<string, Set<string>>();
  for (const assignment of orgAssignments) {
    const existing =
      orgDefaultsByOrgId.get(assignment.organizationId) ?? new Set<string>();
    existing.add(assignment.assignmentTypeId);
    orgDefaultsByOrgId.set(assignment.organizationId, existing);
  }

  const schoolsById = new Map(
    schools.map((school) => [
      school.id,
      {
        organizationId: school.organizationId,
        assignmentTypesCustomized: school.assignmentTypesCustomized,
        assignmentTypeIds: new Set(
          school.assignmentTypeAssignments.map(
            (assignment) => assignment.assignmentTypeId
          )
        ),
      },
    ])
  );

  const teachersById = new Map(
    teachers.map((teacher) => [
      teacher.id,
      {
        organizationId: teacher.organizationId,
        assignmentTypesCustomized: teacher.assignmentTypesCustomized,
        assignmentTypeIds: new Set(
          teacher.assignmentTypeAssignments.map(
            (assignment) => assignment.assignmentTypeId
          )
        ),
      },
    ])
  );

  return { orgDefaultsByOrgId, schoolsById, teachersById };
}

function getEffectiveAssignmentTypeIds({
  scope,
  configuration,
}: {
  scope: AssignmentTypeAccessScope;
  configuration: ScopeConfiguration;
}): Set<string> {
  const organizationId = scope.organizationId;
  if (!organizationId) return new Set();

  const teacher = scope.teacherProfileId
    ? configuration.teachersById.get(scope.teacherProfileId)
    : undefined;
  if (teacher?.assignmentTypesCustomized) {
    return new Set(teacher.assignmentTypeIds);
  }

  const school = scope.schoolId
    ? configuration.schoolsById.get(scope.schoolId)
    : undefined;
  if (school?.assignmentTypesCustomized) {
    return new Set(school.assignmentTypeIds);
  }

  return new Set(
    configuration.orgDefaultsByOrgId.get(organizationId) ?? []
  );
}

function isAssignmentTypeVisibleForScope({
  assignmentTypeId,
  scope,
  configuration,
}: {
  assignmentTypeId: string;
  scope: AssignmentTypeAccessScope;
  configuration: ScopeConfiguration;
}) {
  return getEffectiveAssignmentTypeIds({ scope, configuration }).has(
    assignmentTypeId
  );
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

  const configuration = await loadScopeConfiguration(normalizedScopes);
  const effectiveTypeIds = distinctStrings(
    normalizedScopes.flatMap((scope) =>
      Array.from(
        getEffectiveAssignmentTypeIds({ scope, configuration })
      )
    )
  );

  if (effectiveTypeIds.length === 0) return [];

  const candidates = await prisma.assignmentType.findMany({
    where: {
      archivedAt: null,
      id: { in: effectiveTypeIds },
      ...RETIRED_ASSIGNMENT_TYPE_WHERE,
    },
    select: {
      ...select,
      id: true,
    },
    orderBy,
  } as never);

  return (candidates as unknown as Array<{ id: string } & Record<string, unknown>>)
    .filter((assignmentType) =>
      normalizedScopes.some((scope) =>
        isAssignmentTypeVisibleForScope({
          assignmentTypeId: assignmentType.id,
          scope,
          configuration,
        })
      )
    )
    .map((assignmentType) => assignmentType) as TResult[];
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

  const [assignmentType, configuration] = await Promise.all([
    prisma.assignmentType.findFirst({
      where: {
        id: assignmentTypeId,
        archivedAt: null,
        ...RETIRED_ASSIGNMENT_TYPE_WHERE,
      },
      select: { id: true },
    }),
    loadScopeConfiguration(normalizedScopes),
  ]);

  if (!assignmentType) return false;

  return normalizedScopes.every((scope) =>
    isAssignmentTypeVisibleForScope({
      assignmentTypeId,
      scope,
      configuration,
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

  const [assignmentType, configuration] = await Promise.all([
    prisma.assignmentType.findFirst({
      where: {
        id: assignmentTypeId,
        archivedAt: null,
        ...RETIRED_ASSIGNMENT_TYPE_WHERE,
      },
      select: { id: true },
    }),
    loadScopeConfiguration(normalizedScopes),
  ]);

  if (!assignmentType) return false;

  return normalizedScopes.some((scope) =>
    isAssignmentTypeVisibleForScope({
      assignmentTypeId,
      scope,
      configuration,
    })
  );
}
