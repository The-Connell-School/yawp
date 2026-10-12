/**
 * "See how it works" for The Thesis-Driven Essay, opened from the type's page.
 * The guide itself is in components/how-it-works/thesis-essay-guide.tsx; free
 * classroom teachers see the same guide as a teaser at
 * /app/assignment-type-previews/thesis-driven-essay.
 */
import { redirect, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { ThesisEssayGuide } from '~/components/how-it-works/thesis-essay-guide';
import { isThesisDrivenEssayTitle } from '~/domain/assignment-types/thesis-driven-essay';
import { isAssignmentTypeAvailableForAnyScope } from '~/utils/assignment-type-access.server';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';

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
    select: { id: true, title: true },
  });
  // Only The Thesis-Driven Essay has a guide so far.
  if (!assignmentType || !isThesisDrivenEssayTitle(assignmentType.title)) {
    throw redirect(pagePath);
  }

  return { pagePath };
}

export default function ThesisEssayHowItWorksRoute() {
  const { pagePath } = useLoaderData<typeof loader>();
  return (
    <ThesisEssayGuide
      backTo={pagePath}
      backLabel="Back to The Thesis-Driven Essay"
      startTo={pagePath}
      startLabel="Create an assignment"
    />
  );
}
