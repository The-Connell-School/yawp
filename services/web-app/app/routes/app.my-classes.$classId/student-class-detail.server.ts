import { prisma } from '~/utils/db.server.js';
import { getAvailableAssignmentTypesForScopes } from '~/utils/assignment-type-access.server';
import { buildStudentClassDocumentsScope } from '~/utils/class-assignment-scope.server';

/**
 * Read model for the student view of a single class.
 *
 * Everything here is scoped to one student in one class: the class lookup only
 * matches when the student is enrolled, and the documents query only ever
 * returns that student's own work. Nothing on this surface exposes the roster,
 * other students' documents, grading controls, or paste alerts — the teacher
 * view (`route.tsx`) owns those.
 */
export type StudentClassDetail = NonNullable<
  Awaited<ReturnType<typeof loadStudentClassDetail>>
>;

const STUDENT_DOCUMENT_INCLUDE = {
  assignmentModuleSessions: {
    include: {
      assignmentModule: {
        include: { instructions: { select: { id: true } } },
      },
    },
    orderBy: { assignmentModule: { position: 'desc' } },
  },
  submissions: {
    where: { archivedAt: null, unsubmittedAt: null },
    orderBy: { submittedAt: 'desc' },
    select: {
      id: true,
      title: true,
      releasedAt: true,
      submittedAt: true,
    },
  },
} as const;

/**
 * Loads one class for one student, or `null` when that student is not enrolled
 * in it. Enrollment is enforced in the query itself, so a student enrolled in a
 * different class gets the same answer as a student enrolled in nothing.
 */
export async function loadStudentClassDetail({
  membershipId,
  classId,
}: {
  membershipId: string;
  classId: string;
}) {
  const klass = await prisma.class.findFirst({
    where: {
      id: classId,
      isArchived: false,
      students: { some: { id: membershipId } },
    },
    select: {
      id: true,
      grade: true,
      period: true,
      title: true,
      classArtIndex: true,
      classArtKey: true,
      school: { select: { id: true, name: true, organizationId: true } },
      teachers: { select: { id: true, user: { select: { name: true } } } },
    },
  });

  if (!klass) return null;

  const organizationId = klass.school?.organizationId ?? null;
  const schoolId = klass.school?.id ?? null;
  const teacherScopes = klass.teachers.map((teacher) => ({
    organizationId,
    schoolId,
    teacherProfileId: teacher.id,
  }));

  const [assignments, assignmentTypes, documents] = await Promise.all([
    prisma.classAssignment.findMany({
      where: {
        classId: klass.id,
        OR: [{ postAt: null }, { postAt: { lte: new Date() } }],
      },
      select: {
        id: true,
        postAt: true,
        dueAt: true,
        assignment: {
          select: {
            id: true,
            title: true,
            prompt: true,
            assignmentType: { select: { id: true, title: true } },
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
    }),
    getAvailableAssignmentTypesForScopes<{ id: string; title: string }>({
      // A class with no teacher on it still falls back to the school/org
      // defaults rather than showing nothing.
      scopes:
        teacherScopes.length > 0
          ? teacherScopes
          : [{ organizationId, schoolId }],
      select: { id: true, title: true },
      orderBy: { position: 'asc' },
    }),
    prisma.document.findMany({
      where: {
        deletedAt: null,
        archivedAt: null,
        ...buildStudentClassDocumentsScope({ classId: klass.id, membershipId }),
      },
      include: STUDENT_DOCUMENT_INCLUDE,
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return {
    klass: {
      id: klass.id,
      grade: klass.grade,
      period: klass.period,
      title: klass.title,
      classArtKey: klass.classArtKey,
      legacyClassArtIndex: klass.classArtIndex,
      school: klass.school
        ? { id: klass.school.id, name: klass.school.name }
        : null,
      teacherNames: klass.teachers
        .map((teacher) => teacher.user.name)
        .filter((name): name is string => Boolean(name)),
    },
    assignments,
    assignmentTypes: assignmentTypes.map(({ id, title }) => ({ id, title })),
    documents,
  };
}
