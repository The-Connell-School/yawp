import { invariantResponse } from '@epic-web/invariant';
import { type LoaderFunctionArgs } from 'react-router';
import { prisma } from '~/utils/db.server';
import { requireUserId } from '~/utils/auth.server';

export async function loader({ request, params }: LoaderFunctionArgs) {
  invariantResponse(params.id, 'id is required', { status: 400 });
  // Module handouts, transcripts and WebVTT caption files -- firm curriculum, served to
  // anyone who asked. Three delivery paths reach this loader and all three are
  // same-origin, so the session cookie rides along unchanged: the download link is a
  // same-origin navigation, the resource links are plain anchors, and the caption
  // <track> sits inside a <video> that carries no crossOrigin attribute, which keeps
  // its fetch in credentialed same-origin mode.
  await requireUserId(request);

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
      // private, not public: the response now depends on a session cookie.
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  });
}
