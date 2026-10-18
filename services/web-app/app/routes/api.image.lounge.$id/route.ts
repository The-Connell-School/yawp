import { invariantResponse } from '@epic-web/invariant';
import { type LoaderFunctionArgs } from 'react-router';
import { requireLoungeAccess } from '~/domain/lounge/access.server';
import { getVisibleLoungeImage } from '~/domain/lounge/lounge.server';

/**
 * Serve one screenshot or photo from a Faculty Lounge post, to people who can
 * read the post. Not gated on lounge_post_images: turning uploads off must not
 * break images already posted. Same cache posture as the document images:
 * private, since the answer depends on who is asking.
 */
export async function loader({ request, params }: LoaderFunctionArgs) {
  invariantResponse(params.id, 'id is required', { status: 400 });
  const { viewer } = await requireLoungeAccess(request);
  const image = await getVisibleLoungeImage(viewer, params.id);
  invariantResponse(image, 'Not found', { status: 404 });
  return new Response(image.blob as unknown as Blob, {
    headers: {
      'Content-Type': image.contentType,
      'Content-Length': String(image.byteSize),
      'Content-Disposition': `inline; filename="${params.id}"`,
      // A teacher uploaded these bytes; the upload checked they are a real
      // PNG, JPEG, or WebP, and the browser must not sniff them as anything else.
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  });
}
