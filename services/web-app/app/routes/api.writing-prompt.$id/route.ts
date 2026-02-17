import { invariantResponse } from '@epic-web/invariant';
import { type LoaderFunctionArgs } from 'react-router';
import { prisma } from '~/utils/db.server.ts';

export async function loader({ params }: LoaderFunctionArgs) {
  invariantResponse(params.id, 'id is required', { status: 400 });
  const prompt = await prisma.studentCourseWritingPrompt.findUnique({
    where: { id: params.id },
    select: { contentType: true, blob: true, fileName: true },
  });

  invariantResponse(prompt, 'Not found', { status: 404 });

  return new Response(prompt.blob as unknown as Blob, {
    headers: {
      'Content-Type': prompt.contentType,
      'Content-Length': Buffer.byteLength(prompt.blob).toString(),
      'Content-Disposition': `inline; filename="${prompt.fileName || params.id}.pdf"`,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
