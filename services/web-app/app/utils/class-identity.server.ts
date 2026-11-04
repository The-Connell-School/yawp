import type { Prisma, PrismaClient } from '@app/prisma';

type ClassIdentityClient = Pick<PrismaClient, 'class'> | Prisma.TransactionClient;

export function normalizeClassIdentityField(
  value: string | null | undefined
): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export type ClassIdentityFields = {
  schoolId: string;
  schoolYear: string;
  grade: string | null;
  period: string | null;
  title: string | null;
};

/** Whether two classes share the same schedule identity for rollover purposes. */
export function classIdentityMatches(
  a: ClassIdentityFields,
  b: ClassIdentityFields
): boolean {
  return (
    a.schoolId === b.schoolId &&
    a.schoolYear === b.schoolYear &&
    normalizeClassIdentityField(a.grade) === normalizeClassIdentityField(b.grade) &&
    normalizeClassIdentityField(a.period) === normalizeClassIdentityField(b.period) &&
    normalizeClassIdentityField(a.title) === normalizeClassIdentityField(b.title)
  );
}

export const TEACHER_CLASS_IDENTITY_CONFLICT_MESSAGE =
  'You already have a class with the same title, period, and grade for this school year. Edit that class or change these fields.';

/**
 * Returns an existing non-archived class taught by one of `teacherMembershipIds`
 * with the same school-year identity, if any.
 */
export async function findTeacherClassIdentityConflict(
  client: ClassIdentityClient,
  args: ClassIdentityFields & {
    teacherMembershipIds: string[];
    excludeClassId?: string;
  }
) {
  const teacherMembershipIds = [...new Set(args.teacherMembershipIds)].filter(Boolean);
  if (!teacherMembershipIds.length) return null;

  const identity = {
    schoolId: args.schoolId,
    schoolYear: args.schoolYear,
    grade: normalizeClassIdentityField(args.grade),
    period: normalizeClassIdentityField(args.period),
    title: normalizeClassIdentityField(args.title),
  };

  const candidates = await client.class.findMany({
    where: {
      isArchived: false,
      schoolId: identity.schoolId,
      schoolYear: identity.schoolYear,
      teachers: { some: { id: { in: teacherMembershipIds } } },
      ...(args.excludeClassId ? { id: { not: args.excludeClassId } } : {}),
    },
    select: {
      id: true,
      grade: true,
      period: true,
      title: true,
    },
  });

  return (
    candidates.find((klass) =>
      classIdentityMatches(identity, {
        schoolId: identity.schoolId,
        schoolYear: identity.schoolYear,
        grade: klass.grade,
        period: klass.period,
        title: klass.title,
      })
    ) ?? null
  );
}

/** Legacy DB indexes that omitted school year or blocked intentional duplicates. */
export const LEGACY_CLASS_PERIOD_UNIQUE_INDEXES = [
  'Class_schoolId_period_grade_key',
  'Class_schoolId_schoolYear_period_grade_key',
] as const;

export function isLegacyClassPeriodUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const prismaError = error as {
    code?: unknown;
    meta?: {
      target?: unknown;
      driverAdapterError?: {
        cause?: { constraint?: { fields?: unknown; index?: unknown } };
      };
    };
  };
  if (prismaError.code !== 'P2002') return false;

  const haystacks = [
    prismaError.meta?.target,
    prismaError.meta?.driverAdapterError?.cause?.constraint?.fields,
    prismaError.meta?.driverAdapterError?.cause?.constraint?.index,
  ];

  for (const value of haystacks) {
    if (typeof value === 'string') {
      if (
        LEGACY_CLASS_PERIOD_UNIQUE_INDEXES.some((name) => value.includes(name))
      ) {
        return true;
      }
      if (value.includes('schoolId') && value.includes('period')) {
        return true;
      }
    }
    if (Array.isArray(value)) {
      const fields = value.filter((item): item is string => typeof item === 'string');
      if (
        fields.includes('schoolId') &&
        fields.includes('period') &&
        fields.includes('grade') &&
        !fields.includes('code')
      ) {
        return true;
      }
    }
  }

  return false;
}
