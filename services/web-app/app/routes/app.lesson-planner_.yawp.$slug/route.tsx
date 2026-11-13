/**
 * Open a Yawp! lesson in the teacher's own Lesson Planner (How to Teach It →
 * lesson plans, Kevin, Nov 5): `/app/lesson-planner/yawp/<slug>`.
 *
 * A plain link, so the landing pages' course rows and a module's pasted
 * lesson link (#905) can both point here. It finds the teacher's copy of the
 * lesson, or makes it the first time, and sends them to its stack page, the
 * run of show. A repeated or prefetched request finds the copy it made, so
 * nothing piles up.
 */
import { data, redirect, type LoaderFunctionArgs } from 'react-router';
import { getLessonPlannerAccess } from '~/utils/lesson-planner/lesson-planner-access.server';
import { isFeatureFlagEnabled } from '~/domain/feature-flags/feature-flags.server';
import { ASSIGNMENT_TYPE_LESSON_PLANS_FLAG } from '~/domain/feature-flags/feature-flags';
import { yawpLesson } from '~/domain/lesson-planner/yawp-lessons';
import { openYawpLesson } from '~/domain/lesson-planner/yawp-lessons.server';
import { lessonPlaceHref } from '~/domain/lesson-planner/lesson-return';

const NOT_FOUND = { error: 'That lesson is not available.' };

export async function loader({ request, params }: LoaderFunctionArgs) {
  const access = await getLessonPlannerAccess(request);
  // Off, the route is not there: the landing page shows the PDF instead.
  if (!(await isFeatureFlagEnabled(ASSIGNMENT_TYPE_LESSON_PLANS_FLAG, access.membership.organization.id))) {
    throw data(NOT_FOUND, { status: 404 });
  }
  // A student, or a school without the planner, has nowhere for the copy to go.
  if (!access.allowed) throw redirect('/app');
  const lesson = yawpLesson(params.slug);
  if (!lesson) throw data(NOT_FOUND, { status: 404 });

  const { conversationId } = await openYawpLesson(
    { membershipId: access.membership.id, organizationId: access.membership.organization.id },
    lesson
  );
  throw redirect(lessonPlaceHref(conversationId, 'stack'));
}

/** Never rendered: the loader always redirects or throws. Kept so a 404 shows the app's error page. */
export default function OpenYawpLessonRoute() {
  return null;
}
