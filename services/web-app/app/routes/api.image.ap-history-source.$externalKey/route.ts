import { invariantResponse } from '@epic-web/invariant';
import { type LoaderFunctionArgs } from 'react-router';
import { prisma } from '~/utils/db.server.ts';

/**
 * Serves curated AP History DBQ source images from our own origin so they
 * render reliably even where external image hosts are blocked (e.g. preview
 * environments with no open web egress). Keyed by the source's stable
 * externalKey, which the assignment snapshot carries for every source.
 */
export async function loader({ params }: LoaderFunctionArgs) {
  invariantResponse(params.externalKey, 'externalKey is required', {
    status: 400,
  });

  const source = await prisma.apHistoryPromptLibrarySource.findUnique({
    where: { externalKey: params.externalKey },
    select: { imageContentType: true, imageBlob: true },
  });

  invariantResponse(source?.imageBlob && source.imageContentType, 'Not found', {
    status: 404,
  });

  return new Response(source.imageBlob as unknown as Blob, {
    headers: {
      'Content-Type': source.imageContentType,
      'Content-Length': Buffer.byteLength(source.imageBlob).toString(),
      'Content-Disposition': `inline; filename="${params.externalKey}"`,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
