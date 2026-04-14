import { invariantResponse } from '@epic-web/invariant';
import { type ActionFunctionArgs, data as dataResponse } from 'react-router';
import { prisma } from '~/utils/db.server';

export async function action({ request, params }: ActionFunctionArgs) {
  invariantResponse(params.id, 'id is required', { status: 400 });

  const json = await request.json();
  const { videoTimestamp } = json;

  if (typeof videoTimestamp !== 'number') {
    throw new Response('Invalid data', { status: 400 });
  }

  const session = await prisma.teacherTrainingModuleSession.update({
    where: { id: params.id },
    data: {
      videoTimestamp,
      updatedAt: new Date(),
    },
  });

  return dataResponse({ success: true, session });
}
