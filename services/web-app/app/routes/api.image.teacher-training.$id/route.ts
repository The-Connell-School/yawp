import { invariantResponse } from '@epic-web/invariant';
import { type LoaderFunctionArgs } from 'react-router';
import { prisma } from '~/utils/db.server';
import { requireUserId } from '~/utils/auth.server';

export async function loader({ request, params }: LoaderFunctionArgs) {
  invariantResponse(params.id, 'id is required', { status: 400 });
  // Only the authenticated teacher-training pages and the admin course pages render
  // these. TeacherTraining has no organization column, so there is nothing narrower
  // than "logged in" to scope the cover image to.
  await requireUserId(request);

  const image = await prisma.teacherTrainingImage.findUnique({
    where: { id: params.id },
    select: { contentType: true, blob: true },
  });

  invariantResponse(image, 'Not found', { status: 404 });

  return new Response(image.blob as unknown as Blob, {
    headers: {
      'Content-Type': image.contentType,
      'Content-Length': Buffer.byteLength(image.blob).toString(),
      'Content-Disposition': `inline; filename="${params.id}"`,
      // private, not public: the response now depends on a session cookie.
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  });
}
