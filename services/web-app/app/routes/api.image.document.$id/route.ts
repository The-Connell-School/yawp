import { invariantResponse } from '@epic-web/invariant';
import { type LoaderFunctionArgs } from 'react-router';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { documentReadWhere } from '~/utils/document-access.server';

/**
 * Serve one student-uploaded figure.
 *
 * A figure inherits its document's audience: the author, the teachers of the
 * class the document was assigned in, and platform admins. Same shape and
 * same cache posture as api.image.assignment-type.$id -- `private`, because a
 * response that depends on a session cookie must not be stored by a shared
 * proxy and re-served to the next caller.
 *
 * Not gated on the rollout allowlist: if the feature is switched off, figures
 * a student already placed must keep rendering rather than turning into
 * broken images in a report they are still being graded on.
 */
export async function loader({ request, params }: LoaderFunctionArgs) {
  invariantResponse(params.id, 'id is required', { status: 400 });

  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { isAdmin: true },
  });

  const image = await prisma.documentImage.findFirst({
    where: {
      id: params.id,
      deletedAt: null,
      // The one definition of who may read a document, rather than a second
      // copy of it here: a teacher reaching a submitted report through its
      // class assignment, or a co-author on a shared draft, must not get a
      // page that renders with every figure broken.
      document: {
        deletedAt: null,
        ...documentReadWhere({ profileId: profile.id, isAdmin: user.isAdmin }),
      },
    },
    select: { contentType: true, blob: true, altText: true },
  });

  invariantResponse(image, 'Not found', { status: 404 });

  return new Response(image.blob as unknown as Blob, {
    headers: {
      'Content-Type': image.contentType,
      'Content-Length': Buffer.byteLength(image.blob).toString(),
      'Content-Disposition': `inline; filename="${params.id}"`,
      // These bytes came from a student. The upload route proves they are a
      // real raster image before storing them, and this says the browser must
      // take that stored type at its word rather than sniffing its way to
      // something scriptable on our own origin.
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  });
}
