import { invariantResponse } from '@epic-web/invariant';
import { type ActionFunctionArgs, data as dataResponse } from 'react-router';
import { prisma } from '~/utils/db.server';
import { requireMembership, requireUserId } from '~/utils/auth.server';

export async function action({ request, params }: ActionFunctionArgs) {
  invariantResponse(params.id, 'id is required', { status: 400 });
  // requireMutableRequest was the only guard and it is not authentication -- it returns
  // normally when there is no session cookie. requireUserId calls it in turn, so
  // read-only impersonation is still rejected.
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);

  const json = await request.json();
  const { videoTimestamp } = json;

  if (typeof videoTimestamp !== 'number') {
    throw new Response('Invalid data', { status: 400 });
  }

  // The owner rule lives in the where clause, so a session belonging to another teacher
  // is neither written nor loaded. updateMany rather than update: a zero count is a
  // clean 404 instead of a P2025 that has to be caught.
  const updated = await prisma.teacherTrainingModuleSession.updateMany({
    where: { id: params.id, membershipId: profile.id },
    data: { videoTimestamp, updatedAt: new Date() },
  });

  if (updated.count === 0) {
    return dataResponse({ error: 'Session not found.' }, { status: 404 });
  }

  const session = await prisma.teacherTrainingModuleSession.findFirst({
    where: { id: params.id, membershipId: profile.id },
  });

  return dataResponse({ success: true, session });
}
