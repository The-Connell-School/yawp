/**
 * "See how it works" for The Thesis-Driven Essay: the access check and the
 * two paths the page needs. The page itself is thesis-essay-guide.tsx.
 */
import { redirect, type LoaderFunctionArgs } from 'react-router';
import { useLoaderData } from 'react-router';
import { isThesisDrivenEssayTitle } from '~/domain/assignment-types/thesis-driven-essay';
import { userHasPendingFreeTierTeachingLock } from '~/domain/free-tier/locked-preview.server';
import { isAssignmentTypeAvailableForAnyScope } from '~/utils/assignment-type-access.server';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { findThesisEssayCourse } from '~/domain/teacher-trainings/thesis-essay-course.server';
import { ThesisEssayGuide } from './thesis-essay-guide';

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
    select: { id: true, title: true, kind: true },
  });
  const lockedPreviewThesisStatementGuide =
    assignmentType?.kind === 'thesis_statement' &&
    (await userHasPendingFreeTierTeachingLock(userId));
  // Only The Thesis-Driven Essay has a guide so far, plus Thesis Statement in locked preview.
  if (
    !assignmentType ||
    (!isThesisDrivenEssayTitle(assignmentType.title) &&
      !lockedPreviewThesisStatementGuide)
  ) {
    throw redirect(pagePath);
  }

  // The course that teaches teachers the process, linked only when this
  // teacher can open it, by the same rule as the Teacher Training page.
  const course = await findThesisEssayCourse(profile.id);

  return {
    pagePath,
    coursePath: course?.coursePath ?? null,
  };
}

export default function ThesisEssayHowItWorksRoute() {
  const { pagePath, coursePath } = useLoaderData<typeof loader>();
  return <ThesisEssayGuide pagePath={pagePath} coursePath={coursePath} />;
}
