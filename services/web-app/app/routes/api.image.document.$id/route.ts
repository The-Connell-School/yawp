import { invariantResponse } from '@epic-web/invariant';
import { type LoaderFunctionArgs } from 'react-router';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { hasEffectivePlatformAdmin } from '~/utils/preview-access.server';

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
      ...(hasEffectivePlatformAdmin(user.isAdmin)
        ? {}
        : {
            document: {
              OR: [
                { membershipId: profile.id },
                {
                  membership: {
                    classesAsStudent: {
                      some: { teachers: { some: { id: profile.id } } },
                    },
                  },
                },
              ],
            },
          }),
    },
    select: { contentType: true, blob: true, altText: true },
  });

  invariantResponse(image, 'Not found', { status: 404 });

  return new Response(image.blob as unknown as Blob, {
    headers: {
      'Content-Type': image.contentType,
      'Content-Length': Buffer.byteLength(image.blob).toString(),
      'Content-Disposition': `inline; filename="${params.id}"`,
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  });
}
