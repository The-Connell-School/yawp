import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { validationError, parseFormData } from '@rvf/react-router';
import { z } from 'zod';
import { requireMembership, requireUserId } from '~/utils/auth.server.js';
import { prisma } from '~/utils/db.server.js';
import {
  documentReadWhere,
  getIsPlatformAdmin,
} from '~/utils/document-access.server';

const validator = z.object({
  id: z.string(),
  documentId: z.string(),
  content: z.string(),
});

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);

  if (!profile) {
    return dataResponse({ error: 'Profile not found.' }, { status: 404 });
  }

  const { error, data } = await parseFormData(request, validator);
  if (error) return validationError(error);

  // Stamping membershipId proves who wrote the comment, not that they may touch this
  // document. Resolve the target under the caller's read scope -- the owning student or
  // a teacher of a class that student is in, since teachers comment on student work.
  const document = await prisma.document.findFirst({
    where: {
      id: data.documentId,
      ...documentReadWhere({
        profileId: profile.id,
        isAdmin: await getIsPlatformAdmin(userId),
      }),
    },
    select: { id: true },
  });

  if (!document) {
    return dataResponse({ error: 'Document not found.' }, { status: 404 });
  }

  // `id` stays caller-supplied: the editor mints it so the ProseMirror comment mark and
  // this row agree. A replayed id is a conflict, not an unhandled 500.
  const creation = await prisma.documentComment
    .create({
      data: { ...data, documentId: document.id, membershipId: profile.id },
      include: {
        membership: { include: { user: { select: { name: true } } } },
        responses: {
          include: {
            membership: { include: { user: { select: { name: true } } } },
          },
        },
      },
    })
    .catch((cause: unknown) => {
      if ((cause as { code?: string })?.code === 'P2002') return null;
      throw cause;
    });

  if (!creation) {
    return dataResponse(
      { error: 'A comment with that id already exists.' },
      { status: 409 }
    );
  }

  return dataResponse(creation, { status: 201 });
}
