import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { prisma } from '~/utils/db.server';
import { requireMutableRequest } from '~/utils/auth.server';

export async function action({ request }: ActionFunctionArgs) {
  await requireMutableRequest(request);

  const json = await request.json();
  const { teacherTrainingModuleId, membershipId } = json;

  if (!teacherTrainingModuleId || !membershipId) {
    throw new Response('Invalid data', { status: 400 });
  }

  const existingSession = await prisma.teacherTrainingModuleSession.findUnique({
    where: {
      teacherTrainingModuleId_membershipId: {
        teacherTrainingModuleId,
        membershipId,
      },
    },
  });

  if (existingSession) {
    return dataResponse({ session: existingSession });
  }

  const session = await prisma.teacherTrainingModuleSession.create({
    data: {
      teacherTrainingModuleId,
      membershipId,
      videoTimestamp: 0,
    },
  });

  return dataResponse({ session });
}
