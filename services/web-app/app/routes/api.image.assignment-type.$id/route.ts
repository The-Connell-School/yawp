import { invariantResponse } from '@epic-web/invariant';
import { type LoaderFunctionArgs } from 'react-router';
import { prisma } from '~/utils/db.server.ts';
import { requireUserId } from '~/utils/auth.server';

export async function loader({ request, params }: LoaderFunctionArgs) {
  invariantResponse(params.id, 'id is required', { status: 400 });
  // Every caller is an authenticated page: the assignment-type thumbnails, the admin
  // catalog, and the assignments-at-a-glance card. Nothing unauthenticated -- no login
  // screen, no email -- links a course image, so requiring a session breaks no surface.
  // <img src> is same-origin, so the browser sends the cookie without any change here.
  await requireUserId(request);

  const image = await prisma.assignmentTypeImage.findUnique({
    where: { id: params.id },
    select: { contentType: true, blob: true },
  });

  invariantResponse(image, 'Not found', { status: 404 });

  return new Response(image.blob as unknown as Blob, {
    headers: {
      'Content-Type': image.contentType,
      'Content-Length': Buffer.byteLength(image.blob).toString(),
      'Content-Disposition': `inline; filename="${params.id}"`,
      // private, not public: a response that now depends on a session cookie must not
      // be stored by a shared proxy and re-served to the next caller.
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  });
}
