import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { redirectWithToast } from '~/utils/toast.server';

const POST = z.object({ versionId: z.string() });

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const { error, data } = await parseFormData(request, POST);
  if (error) return validationError(error);

  // Try version first, then snapshot by id
  const version = await prisma.documentVersion.findFirst({
    where: { id: data.versionId, document: { profile: { userId } } },
    include: { document: true },
  });
  const snapshot = version
    ? null
    : await prisma.documentSnapshot.findFirst({
        where: { id: data.versionId, document: { profile: { userId } } },
        include: { document: true },
      });

  if (!version && !snapshot) {
    return redirectWithToast('/app', {
      description: 'Document version not found.',
      type: 'error',
    });
  }

  if (
    (version || snapshot) &&
    (version?.document.html || snapshot?.document.html) &&
    (version?.document.text || snapshot?.document.text)
  ) {
    await prisma.documentVersion.create({
      data: {
        documentId: (version ?? snapshot)!.documentId,
        html: (version ?? snapshot)!.document.html!,
        text: (version ?? snapshot)!.document.text!,
      },
    });
  }

  const doc = await prisma.document.update({
    where: { id: (version ?? snapshot)!.documentId },
    data: {
      html: (version ?? snapshot)!.html,
      text: (version ?? snapshot)!.text,
    },
  });
  return dataResponse({ doc });
}
