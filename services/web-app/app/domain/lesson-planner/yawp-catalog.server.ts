/**
 * Database-backed half of the Yawp teaching catalog: the Teacher's Lounge
 * material a teacher can reach, and the assignment types they can actually
 * assign. Both are scoped exactly the way the corresponding pages scope them,
 * so the planner never offers a teacher something they cannot open.
 */
import { prisma } from '~/utils/db.server';
import { getAvailableAssignmentTypesForScopes } from '~/utils/assignment-type-access.server';
import {
  isDailyPagesTitle,
  summarizeLoungeMaterials,
  type LoungeTrainingSummary,
} from './yawp-catalog';

export type CatalogContext = {
  membershipId: string;
  organizationId: string;
};

export type AssignableType = { id: string; title: string };

/**
 * Teaching material in the Teacher's Lounge — module decks, handouts, and the
 * course links that go with them.
 *
 * Scoping mirrors the Lounge index: once a teacher has assigned courses they
 * see only those, and otherwise the whole library is open to them.
 */
export async function listLoungeMaterials(
  ctx: CatalogContext
): Promise<LoungeTrainingSummary[]> {
  const assignmentCounts = await prisma.orgMembership.findUnique({
    where: { id: ctx.membershipId, role: 'TEACHER' },
    select: { _count: { select: { assignedTeacherTrainings: true } } },
  });
  const hasAssignedCourses =
    (assignmentCounts?._count.assignedTeacherTrainings ?? 0) > 0;

  const trainings = await prisma.teacherTraining.findMany({
    where: hasAssignedCourses
      ? { assignedTeachers: { some: { id: ctx.membershipId } } }
      : undefined,
    select: {
      id: true,
      title: true,
      description: true,
      teacherTrainingModules: {
        where: { deletedAt: null },
        orderBy: { position: 'asc' },
        select: {
          id: true,
          title: true,
          description: true,
          position: true,
          resources: { select: { id: true, name: true, contentType: true } },
        },
      },
      resources: {
        select: { id: true, title: true, description: true, url: true },
      },
    },
    orderBy: { position: 'asc' },
  });

  return summarizeLoungeMaterials(trainings);
}

/**
 * The assignment types this teacher can put in front of a class — Daily Pages,
 * the course essays their org or school has enabled — resolved through the same
 * org/school/teacher inheritance the dashboard uses.
 */
export async function listAssignableTypes(
  ctx: CatalogContext
): Promise<AssignableType[]> {
  const classes = await prisma.class.findMany({
    where: {
      teachers: { some: { id: ctx.membershipId } },
      isArchived: false,
    },
    select: {
      id: true,
      school: { select: { id: true, organizationId: true } },
    },
  });
  if (classes.length === 0) return [];

  const scopes = classes.map((klass) => ({
    organizationId: klass.school?.organizationId ?? ctx.organizationId,
    schoolId: klass.school?.id ?? null,
    teacherProfileId: ctx.membershipId,
  }));

  const types = await getAvailableAssignmentTypesForScopes<{
    id: string;
    title: string;
    systemKey: string | null;
  }>({
    scopes,
    select: { id: true, title: true, systemKey: true },
    orderBy: { position: 'asc' },
  });

  return types.map((type) => ({ id: type.id, title: type.title }));
}

/**
 * The teacher's own Daily Pages assignment type, if their org has it enabled.
 *
 * The planner needs the id to offer "create this Daily Pages exercise" on a
 * warm-up it wrote. A teacher whose org does not have Daily Pages gets no
 * button rather than a link into a page they cannot open.
 */
export async function findDailyPagesTypeId(
  ctx: CatalogContext
): Promise<string | null> {
  const types = await listAssignableTypes(ctx);
  return types.find((type) => isDailyPagesTitle(type.title))?.id ?? null;
}
