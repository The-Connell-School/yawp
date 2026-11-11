/**
 * One picture from a teacher's own deck (Nov 1), for the slides that show it.
 *
 * Private to the teacher who uploaded it: a shared lesson's viewer gets a 404
 * and the slide draws its placeholder instead. Not gated on the refresh flag,
 * so a deck already made keeps its pictures if the flag goes off. The bytes
 * were proved to be a raster image on upload; nosniff holds the browser to
 * the stored type.
 */
import { data, type LoaderFunctionArgs } from 'react-router';
import { prisma } from '~/utils/db.server';
import { requireLessonPlannerAccess } from '~/utils/lesson-planner/lesson-planner-access.server';

export async function loader({ request, params }: LoaderFunctionArgs) {
  const access = await requireLessonPlannerAccess(request);
  const picture = params.id
    ? await prisma.lessonPlanUploadPicture.findFirst({
        where: { id: params.id, membershipId: access.membership.id },
        select: { contentType: true, blob: true },
      })
    : null;
  if (!picture) throw data('Not found', { status: 404 });

  return new Response(picture.blob as unknown as BodyInit, {
    headers: {
      'Content-Type': picture.contentType,
      'Content-Length': String(picture.blob.byteLength),
      'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  });
}
