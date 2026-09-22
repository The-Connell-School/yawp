import { prisma } from '~/utils/db.server.js';
import { schoolYearWhere } from '~/utils/school-year-scope.server';

export type StudentEnrolledClass = {
  id: string;
  grade: string | null;
  period: string | null;
  title: string | null;
  classArtKey: string | null;
  legacyClassArtIndex: number | null;
  school: { id: string; name: string } | null;
  teacherNames: string[];
};

/**
 * Classes a student membership is enrolled in, for the student-facing
 * "Classes" surfaces (dashboard + My Classes). Read-only: unlike the
 * teacher My Classes view, students never create/edit classes here.
 */
export async function getStudentEnrolledClasses(
  membershipId: string,
  /**
   * The school year to show. Students are never asked to pick one — the
   * caller resolves it to whichever year their work is actually in — but a
   * student who deliberately looks at another year gets it here.
   */
  schoolYearScope?: string
): Promise<StudentEnrolledClass[]> {
  const classes = await prisma.class.findMany({
    where: {
      students: { some: { id: membershipId } },
      isArchived: false,
      ...(schoolYearScope ? schoolYearWhere(schoolYearScope) : {}),
    },
    select: {
      id: true,
      grade: true,
      period: true,
      title: true,
      classArtIndex: true,
      classArtKey: true,
      school: { select: { id: true, name: true } },
      teachers: {
        select: { user: { select: { name: true } } },
      },
    },
    orderBy: [{ grade: 'asc' }, { period: 'asc' }],
  });

  return classes.map((klass) => ({
    id: klass.id,
    grade: klass.grade,
    period: klass.period,
    title: klass.title,
    classArtKey: klass.classArtKey,
    legacyClassArtIndex: klass.classArtIndex,
    school: klass.school,
    teacherNames: klass.teachers
      .map((teacher) => teacher.user.name)
      .filter((name): name is string => Boolean(name)),
  }));
}
