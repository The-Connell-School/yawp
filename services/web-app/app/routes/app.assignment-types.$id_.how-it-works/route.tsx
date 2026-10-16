/**
 * "See how it works" for an assignment type, opened from the type's page.
 * Three types have a guide: The Thesis-Driven Essay, the AP History Essay,
 * and Daily Pages. The
 * guides themselves are in components/how-it-works; free classroom teachers
 * see the same guides as teasers at /app/assignment-type-previews/<slug>.
 */
import { redirect, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { ApHistoryGuide } from '~/components/how-it-works/ap-history-guide';
import { DailyPagesGuide } from '~/components/how-it-works/daily-pages-guide';
import { ThesisEssayGuide } from '~/components/how-it-works/thesis-essay-guide';
import { AP_HISTORY_ASSIGNMENT_TYPE_KEY } from '~/domain/ap-history/schema';
import { DAILY_PAGES_ASSIGNMENT_TYPE_KIND } from '~/domain/assignment-types/daily-pages-rubric';
import { isThesisDrivenEssayTitle } from '~/domain/assignment-types/thesis-driven-essay';
import { isAssignmentTypeAvailableForAnyScope } from '~/utils/assignment-type-access.server';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';

const THESIS_COURSE_TITLE = 'The Thesis-Driven Essay';

/** Which guide an assignment type has, or null for types without one. */
function guideFor(type: {
  title: string;
  systemKey: string | null;
  kind: string | null;
}) {
  if (type.systemKey === AP_HISTORY_ASSIGNMENT_TYPE_KEY) return 'ap-history';
  if (type.kind === DAILY_PAGES_ASSIGNMENT_TYPE_KIND) return 'daily-pages';
  if (isThesisDrivenEssayTitle(type.title)) return 'thesis-essay';
  return null;
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  if (profile.role !== 'TEACHER') throw redirect('/app');

  const assignmentTypeId = params.id ?? '';
  const pagePath = `/app/assignment-types/${assignmentTypeId}`;

  // The same access check as the assignment type page: the type has to be
  // switched on for one of this teacher's schools.
  const teacherClasses = await prisma.class.findMany({
    where: { teachers: { some: { id: profile.id } }, isArchived: false },
    select: { school: { select: { id: true, organizationId: true } } },
  });
  const scopes =
    teacherClasses.length === 0
      ? [
          {
            organizationId: profile.organization.id,
            teacherProfileId: profile.id,
          },
        ]
      : teacherClasses.map((klass) => ({
          organizationId: klass.school.organizationId,
          schoolId: klass.school.id,
          teacherProfileId: profile.id,
        }));
  const available = await isAssignmentTypeAvailableForAnyScope({
    assignmentTypeId,
    scopes,
  });
  if (!available) throw redirect('/app');

  const assignmentType = await prisma.assignmentType.findFirst({
    where: { id: assignmentTypeId, archivedAt: null },
    select: { id: true, title: true, systemKey: true, kind: true },
  });
  const guide = assignmentType ? guideFor(assignmentType) : null;
  if (!assignmentType || !guide) throw redirect(pagePath);
  if (guide !== 'thesis-essay') return { pagePath, guide, coursePath: null };

  // The course that teaches teachers the process. It is linked only when this
  // teacher can open it, by the same rule as the Teacher Training page.
  const assigned = await prisma.orgMembership.findUnique({
    where: { id: profile.id, role: 'TEACHER' },
    select: { _count: { select: { assignedTeacherTrainings: true } } },
  });
  const course = await prisma.teacherTraining.findFirst({
    where: {
      title: { equals: THESIS_COURSE_TITLE, mode: 'insensitive' },
      ...((assigned?._count.assignedTeacherTrainings ?? 0) > 0
        ? { assignedTeachers: { some: { id: profile.id } } }
        : {}),
    },
    select: { id: true },
  });

  return {
    pagePath,
    guide,
    coursePath: course ? `/app/teacher-trainings/${course.id}` : null,
  };
}

export default function AssignmentTypeHowItWorksRoute() {
  const { pagePath, guide, coursePath } = useLoaderData<typeof loader>();
  if (guide === 'daily-pages') {
    return (
      <DailyPagesGuide
        backTo={pagePath}
        backLabel="Back to Daily Pages"
        startTo={pagePath}
        startLabel="Create an assignment"
      />
    );
  }
  if (guide === 'ap-history') {
    return (
      <ApHistoryGuide
        backTo={pagePath}
        backLabel="Back to AP History Essay"
        startTo={pagePath}
        startLabel="Create an assignment"
      />
    );
  }
  return (
    <ThesisEssayGuide
      backTo={pagePath}
      backLabel="Back to The Thesis-Driven Essay"
      startTo={pagePath}
      startLabel="Create an assignment"
      coursePath={coursePath}
    />
  );
}
