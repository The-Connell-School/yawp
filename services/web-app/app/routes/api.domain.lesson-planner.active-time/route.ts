/**
 * The planner pages report how long the teacher was working on a lesson
 * (Nov 3), so "Planned in" is working time rather than the clock time since
 * the lesson was started. The teacher's own lessons only, only until a lesson
 * is set, and never more per report than the time since the last one (see
 * active-time.ts). Behind lesson_planner_active_time.
 */
import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { prisma } from '~/utils/db.server';
import { requireMutableRequest } from '~/utils/auth.server';
import { requireLessonPlannerAccess } from '~/utils/lesson-planner/lesson-planner-access.server';
import { getLessonPlannerReviewFlags } from '~/domain/feature-flags/feature-flags.server';
import { clampPing } from '~/domain/lesson-planner/active-time';

export async function action({ request }: ActionFunctionArgs) {
  await requireMutableRequest(request);
  const access = await requireLessonPlannerAccess(request);
  const flags = await getLessonPlannerReviewFlags(access.membership.organization.id);
  if (!flags.activeTime) return dataResponse({ error: 'Not found.' }, { status: 404 });

  const form = await request.formData();
  const conversationId = form.get('conversationId')?.toString();
  if (!conversationId) return dataResponse({ error: 'Which lesson?' }, { status: 400 });
  const reported = Number(form.get('seconds')?.toString());

  const open = { id: conversationId, membershipId: access.membership.id, deletedAt: null, setAt: null };
  const lesson =
    Number.isFinite(reported) && reported > 0
      ? await prisma.lessonPlanConversation.findFirst({
          where: open,
          select: { activeSince: true, activeReportedAt: true },
        })
      : null;
  const now = new Date();
  const credited = lesson ? clampPing(reported, lesson.activeReportedAt, now.getTime()) : 0;
  if (!lesson || credited <= 0) return dataResponse({ ok: true, credited: 0 });

  // Only if no other report landed since this one was read: two tabs cannot
  // both credit the same stretch of time.
  const updated = await prisma.lessonPlanConversation.updateMany({
    where: { ...open, activeReportedAt: lesson.activeReportedAt },
    data: {
      activeSeconds: { increment: credited },
      activeReportedAt: now,
      ...(lesson.activeSince ? {} : { activeSince: new Date(now.getTime() - credited * 1000) }),
    },
  });
  return dataResponse({ ok: true, credited: updated.count ? credited : 0 });
}
