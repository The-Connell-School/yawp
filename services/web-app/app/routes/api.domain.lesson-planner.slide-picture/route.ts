/**
 * A picture a teacher adds to a slide in the deck editor (Brian, Nov 4):
 * replace one, or put one on a slide that had none, from their computer.
 *
 * Kept like a picture from an uploaded deck: proved by its bytes to be a
 * raster image a browser draws, capped in size, private to the teacher, and
 * served by the same route. It belongs to the lesson and goes with it.
 * Behind lesson_planner_upload_pictures, in the deck editor (deck v2).
 */
import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { prisma } from '~/utils/db.server';
import { requireMutableRequest } from '~/utils/auth.server';
import { requireLessonPlannerAccess } from '~/utils/lesson-planner/lesson-planner-access.server';
import { getLessonPlannerReviewFlags } from '~/domain/feature-flags/feature-flags.server';
import { imageDimensions, sniffPictureType } from '~/domain/office/image-dimensions';
import { cleanAltText, MAX_DECK_PICTURE_BYTES } from '~/domain/office/pptx-pictures';

function bad(message: string, status = 400) {
  return dataResponse({ error: message }, { status });
}

export async function action({ request }: ActionFunctionArgs) {
  await requireMutableRequest(request);
  const access = await requireLessonPlannerAccess(request);
  const flags = await getLessonPlannerReviewFlags(access.membership.organization.id);
  if (!flags.deckV2 || !flags.uploadPictures) return bad('Not found.', 404);

  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_DECK_PICTURE_BYTES + 64 * 1024) {
    return bad('That picture is over 8 MB.', 413);
  }
  const form = await request.formData();
  const conversationId = form.get('conversationId')?.toString();
  const file = form.get('file');
  if (!conversationId || !(file instanceof File)) return bad('Choose a picture to add.');
  if (file.size > MAX_DECK_PICTURE_BYTES) return bad('That picture is over 8 MB.', 413);

  const lesson = await prisma.lessonPlanConversation.findFirst({
    where: { id: conversationId, membershipId: access.membership.id, deletedAt: null },
    select: { id: true },
  });
  if (!lesson) return bad('Lesson not found.', 404);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const contentType = sniffPictureType(bytes);
  if (!contentType) return bad('Yawp! can show PNG, JPEG, GIF and WebP pictures.', 422);
  const size = imageDimensions(bytes);

  const picture = await prisma.lessonPlanUploadPicture.create({
    data: {
      conversationId: lesson.id,
      membershipId: access.membership.id,
      position: 0,
      slideNumbers: [],
      // Its file name is the best description there is, until the teacher writes one.
      altText: cleanAltText(file.name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ')),
      contentType,
      byteSize: bytes.byteLength,
      width: size?.width ?? null,
      height: size?.height ?? null,
      blob: bytes,
    },
    select: { id: true, altText: true, width: true, height: true },
  });
  return dataResponse({ ok: true, picture });
}
