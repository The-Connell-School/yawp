import { invariant } from '@epic-web/invariant';
import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { hasEffectivePlatformAdmin } from '~/utils/preview-access.server';

function teacherDocumentAccessWhere(membershipId: string) {
  return {
    OR: [
      {
        classAssignment: {
          class: { teachers: { some: { id: membershipId } } },
        },
      },
      {
        membership: {
          classesAsStudent: {
            some: { teachers: { some: { id: membershipId } } },
          },
        },
      },
    ],
  };
}

export async function action({ request, params }: ActionFunctionArgs) {
  invariant(params.id, 'No id provided');
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  });
  const isAdmin = hasEffectivePlatformAdmin(user?.isAdmin);

  const comment = await prisma.submissionComment.findFirst({
    where: {
      id: params.id,
      submission: {
        is: {
          document: {
            is: {
              deletedAt: null,
              membershipId: { not: profile.id },
              ...(isAdmin ? {} : teacherDocumentAccessWhere(profile.id)),
            },
          },
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

  if (request.method === 'DELETE') {
    await prisma.submissionComment.delete({ where: { id: params.id } });
    return dataResponse({ success: true, commentId: params.id }, { status: 200 });
  }

  const formData = await request.formData();
  const content = formData.get('content')?.toString()?.trim();
  if (!content) {
    return dataResponse(
      { success: false, message: 'Content is required.' },
      { status: 400 }
    );
  }

  await prisma.submissionComment.update({
    where: { id: params.id },
    data: { content },
  });

  return dataResponse({ success: true }, { status: 200 });
}
