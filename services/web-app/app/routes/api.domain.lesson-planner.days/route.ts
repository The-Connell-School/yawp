/**
 * "Make each day its own lesson" (Brian's run 5, item 1): one multi-day
 * reply becomes a unit of day lessons, each with its own stack.
 */
import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { requireMutableRequest } from '~/utils/auth.server';
import { requireLessonPlannerAccess } from '~/utils/lesson-planner/lesson-planner-access.server';
import { getLessonPlannerReviewFlags } from '~/domain/feature-flags/feature-flags.server';
import { makeDayLessons } from '~/domain/lesson-planner/plan-days.server';

const POST = z.object({
  intent: z.literal('make-days'),
  conversationId: z.string().min(1),
  messageId: z.string().min(1),
});

export async function action({ request }: ActionFunctionArgs) {
  await requireMutableRequest(request);
  const access = await requireLessonPlannerAccess(request);
  const flags = await getLessonPlannerReviewFlags(access.membership.organization.id);
  if (!flags.stackV3) return dataResponse({ error: 'Not found.' }, { status: 404 });
  const { error, data } = await parseFormData(request, POST);
  if (error) return validationError(error);
  const made = await makeDayLessons({
    membershipId: access.membership.id,
    organizationId: access.membership.organization.id,
    conversationId: data.conversationId,
    messageId: data.messageId,
  });
  if (!made) return dataResponse({ error: 'That reply is not a plan of several days.' }, { status: 404 });
  return dataResponse({ ok: true, ...made });
}
