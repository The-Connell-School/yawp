import { invariantResponse } from '@epic-web/invariant';
import { type LoaderFunctionArgs } from 'react-router';
import { prisma } from '~/utils/db.server';

export async function loader({ params }: LoaderFunctionArgs) {
  invariantResponse(params.id, 'id is required', { status: 400 });
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
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
