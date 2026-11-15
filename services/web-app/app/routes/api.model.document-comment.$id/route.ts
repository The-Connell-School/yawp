import { invariant } from '@epic-web/invariant';
import { type Prisma } from '@app/prisma';
import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { validationError, parseFormData } from '@rvf/react-router';
import { z } from 'zod';
import { requireMembership, requireUserId } from '~/utils/auth.server.js';
import { prisma } from '~/utils/db.server.js';
import {
  documentReadWhere,
  getIsPlatformAdmin,
} from '~/utils/document-access.server';

const POST = z.object({
  documentId: z.string(),
  content: z.string(),
});

const PATCH = z.object({
  intent: z.enum(['resolve', 'reopen', 'edit']),
  content: z.string().optional(),
});

export async function action({ request, params }: ActionFunctionArgs) {
  invariant(params.id, 'No id provided');
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);

  if (!profile) {
    return dataResponse({ error: 'Profile not found.' }, { status: 404 });
  }

  const isAdmin = await getIsPlatformAdmin(userId);

  if (request.method === 'DELETE') {
    const where: Prisma.DocumentCommentWhereUniqueInput = {
      id: params.id,
      membershipId: profile.id,
    };
    const deleted = await prisma.documentComment
      .delete({ where })
      .catch(() => null);
    if (!deleted) {
      return dataResponse({ error: 'Comment not found.' }, { status: 404 });
    }
    return new Response(null, { status: 204 });
  }

  if (request.method === 'PATCH') {
    const { error, data } = await parseFormData(request, PATCH);
    if (error) return validationError(error);

    const comment = await prisma.documentComment.findFirst({
      where: {
        id: params.id,
        ...(data.intent === 'resolve'
          ? { archivedAt: null }
          : data.intent === 'reopen'
            ? { archivedAt: { not: null } }
            : { archivedAt: null }),
        document: {
          is: documentReadWhere({ profileId: profile.id, isAdmin }),
        },
      },
      select: {
        id: true,
        membershipId: true,
        archivedAt: true,
        documentId: true,
      },
    });

    if (!comment) {
      return dataResponse({ error: 'Comment not found.' }, { status: 404 });
    }

    const isAuthor = comment.membershipId === profile.id;
    const canModerate =
      isAuthor || profile.role === 'TEACHER' || Boolean(isAdmin);

    if (!canModerate) {
      return dataResponse({ error: 'Not allowed.' }, { status: 403 });
    }

    if (data.intent === 'edit') {
      if (!isAuthor) {
        return dataResponse({ error: 'Not allowed.' }, { status: 403 });
      }
      const content = data.content?.trim();
      if (!content) {
        return dataResponse({ error: 'Write something first.' }, { status: 400 });
      }
      const updated = await prisma.documentComment.update({
        where: { id: comment.id },
        data: { content },
      });
      return dataResponse(updated, { status: 200 });
    }

    if (data.intent === 'resolve') {
      if (comment.archivedAt) {
        return dataResponse(comment, { status: 200 });
      }
      const updated = await prisma.documentComment.update({
        where: { id: comment.id },
        data: { archivedAt: new Date() },
      });
      return dataResponse(updated, { status: 200 });
    }

    const updated = await prisma.documentComment.update({
      where: { id: comment.id },
      data: { archivedAt: null },
    });
    return dataResponse(updated, { status: 200 });
  }

  const where: Prisma.DocumentCommentWhereUniqueInput = {
    id: params.id,
    membershipId: profile.id,
  };

  const { error, data } = await parseFormData(request, POST);
  if (error) return validationError(error);

  const updated = await prisma.documentComment.update({ where, data });

  if (!updated) {
    return new Response(null, { status: 404 });
  }
  return dataResponse(updated, { status: 201 });
}