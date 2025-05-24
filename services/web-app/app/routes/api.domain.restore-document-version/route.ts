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

  const version = await prisma.documentVersion.findUnique({
    where: { id: data.versionId, document: { userId } },
    include: { document: true },
  });

  if (!version) {
    return redirectWithToast('/app', {
      description: 'Document version not found.',
      type: 'error',
    });
  }

  if (version.document.html && version.document.text) {
    await prisma.documentVersion.create({
      data: {
        documentId: version.documentId,
        html: version.document.html,
        text: version.document.text,
      },
    });
  }

  const doc = await prisma.document.update({
    where: { id: version.documentId },
    data: { html: version.html, text: version.text },
  });
  return dataResponse({ doc });
}
