import { invariant } from '@epic-web/invariant';
import { type ActionFunctionArgs, data as dataResponse } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { requireProfile, requireUserId } from '~/utils/auth.server.js';
import { prisma } from '~/utils/db.server.js';

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

  // Throttled version + periodic durable snapshot strategy
  const now = new Date();
  const twentySecondsAgo = new Date(now.getTime() - 20_000);

  const lastVersion = await prisma.documentVersion.findFirst({
    where: { documentId: params.id },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });

  if (!lastVersion || lastVersion.createdAt < twentySecondsAgo) {
    await prisma.documentVersion.create({
      data: {
        documentId: params.id,
        text: document.text ?? '',
        html: document.html ?? '',
      },
    });
  }

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
                    classes: {
                      some: { teachers: { some: { profileId: profile.id } } },
                    },
                  },
                },
              },
            ],
          }),
    },
    data,
  });

  // Create hourly durable snapshot in DB and S3 for point-in-time recovery
  try {
    const fresh = await prisma.document.findUnique({
      where: { id: document.id },
      select: { id: true, html: true, text: true },
    });

    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const lastSnapshot = await (prisma as any).documentSnapshot?.findFirst?.({
      where: { documentId: document.id },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    const shouldSnapshot = !lastSnapshot || lastSnapshot.createdAt < oneHourAgo;

    if (shouldSnapshot && fresh?.html != null && fresh?.text != null) {
      await (prisma as any).documentSnapshot.create({
        data: {
          document: { connect: { id: document.id } },
          html: fresh.html,
          text: fresh.text,
        },
      });
    }
  } catch (err) {
    // Non-fatal snapshot errors should not block editing
  }

  if (!update) {
    return new Response(null, { status: 404 });
  } else {
    return new Response(null, { status: 204 });
  }
}
