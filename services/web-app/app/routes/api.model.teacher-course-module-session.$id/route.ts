import { invariantResponse } from '@epic-web/invariant';
import { type ActionFunctionArgs, data as dataResponse } from 'react-router';
import { prisma } from '~/utils/db.server';

export async function action({ request, params }: ActionFunctionArgs) {
  invariantResponse(params.id, 'id is required', { status: 400 });

  const json = await request.json();
  const { videoTimestamp, videoProgress } = json;

  if (typeof videoTimestamp !== 'number' || typeof videoProgress !== 'number') {
    throw new Response('Invalid data', { status: 400 });
  }

  const session = await prisma.teacherCourseModuleSession.update({
    where: { id: params.id },
    data: {
      videoTimestamp,
      videoProgress,
      updatedAt: new Date(),
    },
  });

  return dataResponse({ success: true, session });
}
