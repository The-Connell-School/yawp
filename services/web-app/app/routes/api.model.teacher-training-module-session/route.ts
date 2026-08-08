import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { prisma } from '~/utils/db.server';
import { requireMembership, requireUserId } from '~/utils/auth.server';

export async function action({ request }: ActionFunctionArgs) {
  // requireMutableRequest, which used to be the only guard here, returns normally when
  // there is no session cookie at all -- it rejects read-only impersonation, not
  // anonymous callers. requireUserId is the authentication, and it calls
  // requireMutableRequest itself.
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);

  const json = await request.json();
  const { teacherTrainingModuleId } = json;

  if (!teacherTrainingModuleId) {
    throw new Response('Invalid data', { status: 400 });
  }

  // The membership is taken from the session and the body's `membershipId`, if any, is
  // ignored: a client has no legitimate reason to name a membership other than its own,
  // and honouring it let an anonymous caller read and seed any teacher's progress.
  const existingSession = await prisma.teacherTrainingModuleSession.findUnique({
    where: {
      teacherTrainingModuleId_membershipId: {
        teacherTrainingModuleId,
        membershipId: profile.id,
      },
    },
  });

  if (existingSession) {
    return dataResponse({ session: existingSession });
  }

  const session = await prisma.teacherTrainingModuleSession.create({
    data: {
      teacherTrainingModuleId,
      membershipId: profile.id,
      videoTimestamp: 0,
    },
  });

  return dataResponse({ session });
}
