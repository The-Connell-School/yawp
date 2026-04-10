import { invariant } from '@epic-web/invariant';
import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { requireProfile, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';

export async function action({ request, params }: ActionFunctionArgs) {
  invariant(params.id, 'No id provided');
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  });
  const isAdmin = !!user?.isAdmin;

  const comment = await prisma.submissionComment.findFirst({
    where: {
      id: params.id,
      submission: {
        document: {
          deletedAt: null,
          ...(isAdmin
            ? {}
            : {
                class: {
                  teachers: { some: { profileId: profile.id } },
                },
              }),
        },
      },
    },
    select: { id: true },
  });

  if (!comment) {
    return dataResponse(
      { success: false, message: 'Comment not found.' },
      { status: 404 }
    );
  }

  await prisma.submissionComment.delete({ where: { id: params.id } });
  return dataResponse({ success: true }, { status: 200 });
}
