import { invariant } from '@epic-web/invariant';
import { type ActionFunctionArgs, data as dataResponse } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { requireProfile, requireUserId } from '~/utils/auth.server.js';
import { prisma } from '~/utils/db.server.js';
import {
  documentOperationManager,
  generateOperations,
} from '~/utils/document-operations.server.js';

const PUT = z.object({
  text: z.string().optional(),
  html: z.string().optional(),
  title: z.string().optional(),
});

export async function action({ request, params }: ActionFunctionArgs) {
  invariant(params.id, 'No id provided');
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);

  if (request.method === 'DELETE') {
    const updated = await prisma.document.update({
      where: { id: params.id, profileId: profile.id },
      data: { deletedAt: new Date() },
    });

    if (!updated) {
      return new Response(null, { status: 404 });
    } else {
      return new Response(null, { status: 204 });
    }
  }

  const { error, data } = await parseFormData(request, PUT);
  if (error) return validationError(error);

  const [user, document] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { isAdmin: true },
    }),
    prisma.document.findUniqueOrThrow({
      where: { id: params.id },
    }),
  ]);

  // Generate operations if text content has changed
  if (data.text && document.text !== data.text) {
    const operations = generateOperations(document.text ?? '', data.text);

    // Add operations to the batched system
    for (const operation of operations) {
      await documentOperationManager.addOperation(params.id, operation);
    }
    // Ensure batch is flushed so version is consistent with update below
    await documentOperationManager.flushNow(params.id);
  }

  // Legacy DocumentVersion creation removed in favor of operational transform + snapshots

  const update = await prisma.document.update({
    where: {
      id: document.id,
      ...(user.isAdmin
        ? {}
        : {
            OR: [
              { profileId: profile.id },
              {
                profile: {
                  studentProfile: {
                    class: { teachers: { some: { profileId: profile.id } } },
                  },
                },
              },
            ],
          }),
    },
    data,
  });

  if (!update) {
    return new Response(null, { status: 404 });
  } else {
    return new Response(null, { status: 204 });
  }
}
