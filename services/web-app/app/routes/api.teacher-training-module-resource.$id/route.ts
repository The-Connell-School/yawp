import { invariantResponse } from '@epic-web/invariant';
import { type LoaderFunctionArgs } from 'react-router';
import { prisma } from '~/utils/db.server';

export async function loader({ params }: LoaderFunctionArgs) {
  invariantResponse(params.id, 'id is required', { status: 400 });
  const resource = await prisma.teacherTrainingModuleResource.findUnique({
    where: { id: params.id },
    select: { name: true, contentType: true, blob: true },
  });

  invariantResponse(resource, 'Not found', { status: 404 });

  return new Response(resource.blob as unknown as Blob, {
    headers: {
      'Content-Type': resource.contentType,
      'Content-Length': Buffer.byteLength(resource.blob).toString(),
      'Content-Disposition': `attachment; filename="${resource.name}"`,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
