import { type ActionFunctionArgs, data as dataResponse } from 'react-router';
import { prisma } from '~/utils/db.server';

export async function action({ request }: ActionFunctionArgs) {
  const json = await request.json();
  const { teacherCourseModuleId, teacherProfileId } = json;

  if (!teacherCourseModuleId || !teacherProfileId) {
    throw new Response('Invalid data', { status: 400 });
  }

  // Find existing session or create new one
  const existingSession = await prisma.teacherCourseModuleSession.findUnique({
    where: {
      teacherCourseModuleId_teacherProfileId: {
        teacherCourseModuleId,
        teacherProfileId,
      },
    },
  });

  if (existingSession) {
    return dataResponse({ session: existingSession });
  }

  const session = await prisma.teacherCourseModuleSession.create({
    data: {
      teacherCourseModuleId,
      teacherProfileId,
      videoTimestamp: 0,
    },
  });

  return dataResponse({ session });
}
