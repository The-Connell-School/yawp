import { invariant } from '@epic-web/invariant';
import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { requireProfile, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';

const POST = z.object({
  content: z.string().min(1),
});

export async function action({ request, params }: ActionFunctionArgs) {
  invariant(params.id, 'No id provided');
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  });
  const isAdmin = !!user?.isAdmin;

  const comment = await prisma.gradeComment.findFirst({
    where: {
      id: params.id,
      grade: {
        snapshot: {
          document: {
            deletedAt: null,
            ...(isAdmin
              ? {}
              : { class: { teachers: { some: { profileId: profile.id } } } }),
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
    await prisma.gradeComment.delete({ where: { id: params.id } });
    return dataResponse({ success: true }, { status: 200 });
  }

  const { error, data } = await parseFormData(request, POST);
  if (error) return validationError(error);

  const updated = await prisma.gradeComment.update({
    where: { id: params.id },
    data: { content: data.content, updatedAt: new Date() },
  });

  return dataResponse({ success: true, comment: updated }, { status: 200 });
}
