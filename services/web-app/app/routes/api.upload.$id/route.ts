import { invariantResponse } from '@epic-web/invariant';
import { type LoaderFunctionArgs } from 'react-router';
import { prisma } from '~/utils/db.server';

export async function loader({ params }: LoaderFunctionArgs) {
  invariantResponse(params.id, 'id is required', { status: 400 });

  const upload = await prisma.upload.findUnique({
    where: { id: params.id },
    select: { name: true, contentType: true, blob: true },
  });

  invariantResponse(upload, 'Not found', { status: 404 });

  return new Response(upload.blob as unknown as Blob, {
    headers: {
      'Content-Type': upload.contentType,
      'Content-Length': Buffer.byteLength(upload.blob).toString(),
      'Content-Disposition': `inline; filename="${upload.name}"`,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
