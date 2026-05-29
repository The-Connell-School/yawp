import { type ActionFunctionArgs, data as dataResponse } from 'react-router';
import { prisma } from '~/utils/db.server';
import { requireMutableRequest } from '~/utils/auth.server';

export async function action({ request }: ActionFunctionArgs) {
  await requireMutableRequest(request);

  const json = await request.json();
  const { teacherTrainingModuleId, teacherProfileId } = json;

  if (!teacherTrainingModuleId || !teacherProfileId) {
    throw new Response('Invalid data', { status: 400 });
  }

  // Find existing session or create new one
  const existingSession = await prisma.teacherTrainingModuleSession.findUnique({
    where: {
      teacherTrainingModuleId_teacherProfileId: {
        teacherTrainingModuleId,
        teacherProfileId,
      },
    },
  });

  if (existingSession) {
    return dataResponse({ session: existingSession });
  }

  const session = await prisma.teacherTrainingModuleSession.create({
    data: {
      teacherTrainingModuleId,
      teacherProfileId,
      videoTimestamp: 0,
    },
  });

  return dataResponse({ session });
}
