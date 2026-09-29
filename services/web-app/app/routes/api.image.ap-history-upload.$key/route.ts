import { invariantResponse } from '@epic-web/invariant';
import { type LoaderFunctionArgs } from 'react-router';
import { prisma } from '~/utils/db.server.ts';

/**
 * Serves teacher-uploaded DBQ source images for custom AP History assignments
 * from our own origin, keyed by the upload key stored in the assignment
 * snapshot's imageUrl.
 */
export async function loader({ params }: LoaderFunctionArgs) {
  invariantResponse(params.key, 'key is required', { status: 400 });

  const image = await prisma.apHistoryCustomSourceImage.findUnique({
    where: { key: params.key },
    select: { contentType: true, blob: true },
  });

  invariantResponse(image, 'Not found', { status: 404 });

  return new Response(image.blob as unknown as Blob, {
    headers: {
      'Content-Type': image.contentType,
      'Content-Length': Buffer.byteLength(image.blob).toString(),
      'Content-Disposition': `inline; filename="${params.key}"`,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
