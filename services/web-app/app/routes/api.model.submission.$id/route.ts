import { invariant } from '@epic-web/invariant';
import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { requireProfile, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';

const POST = z.object({
  action: z.enum(['archive', 'unarchive']),
});

export async function action({ request, params }: ActionFunctionArgs) {
  invariant(params.id, 'No submission id provided');
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);

  const { error, data } = await parseFormData(request, POST);
  if (error) return validationError(error);

  const snapshot = await prisma.documentSnapshot.findFirst({
    where: {
      id: params.id,
      submittedAt: { not: null },
      document: {
        deletedAt: null,
        class: {
          teachers: {
            some: {
              profileId: profile.id,
            },
          },
        },
      },
    },
    select: {
      id: true,
    },
  });

  if (!snapshot) {
    return dataResponse(
      { success: false, message: 'Submission not found.' },
      { status: 404 }
    );
  }

  const archivedAt = data.action === 'archive' ? new Date() : null;
  await prisma.documentSnapshot.update({
    where: { id: snapshot.id },
    data: { archivedAt },
  });

  return dataResponse({
    success: true,
    snapshotId: snapshot.id,
    archived: archivedAt !== null,
  });
}
