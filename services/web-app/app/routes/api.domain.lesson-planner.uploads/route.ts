/**
 * A teacher's own documents for a lesson (Oct 21): upload one, or take one
 * back out. Only the text read out of the file is kept. Scoped to the
 * teacher's own lessons, behind lesson_planner_uploads.
 *
 * With lesson_planner_upload_pictures (Nov 1), a PowerPoint is kept whole,
 * with the pictures a browser can show, and the teacher can say what they
 * want from it (`intent=mode`): teach with these slides, or refresh them into
 * a Yawp! deck, each behind its own flag. Removing it deletes all of it.
 *
 * On a lesson with no messages yet, the document waits for the first one:
 * that message attaches it (and counts as the new lesson, as always).
 */
import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { prisma } from '~/utils/db.server';
import { requireMutableRequest } from '~/utils/auth.server';
import { requireLessonPlannerAccess } from '~/utils/lesson-planner/lesson-planner-access.server';
import { getLessonPlannerReviewFlags } from '~/domain/feature-flags/feature-flags.server';
import {
  MAX_SOURCE_BYTES,
  MAX_SOURCES_PER_LESSON,
  readSourceDocument,
  SourceDocumentError,
} from '~/domain/lesson-planner/source-documents.server';
import { PENDING_UPLOAD_MS, isDeckMode } from '~/domain/lesson-planner/lesson-uploads';
import { readBoundedBytes } from '~/utils/bounded-body.server';
import {
  safeDomainErrorTextForClientResponse,
  safeErrorTextForClientResponse,
} from '~/utils/server-error-request-context.server';

/** File plus multipart framing; matches other upload routes' headroom. */
const MAX_UPLOAD_BODY_BYTES = MAX_SOURCE_BYTES + 1024 * 1024;

function bad(message: string, status = 400) {
  return dataResponse({ error: message }, { status });
}

type UploadCapResult =
  | { ok: true; request: Request }
  | { ok: false; response: ReturnType<typeof bad> };

async function requestWithinUploadCap(request: Request): Promise<UploadCapResult> {
  const header = request.headers.get('content-length');
  const declared = header === null || header.trim() === '' ? NaN : Number(header);
  if (Number.isFinite(declared)) {
    if (declared > MAX_UPLOAD_BODY_BYTES) {
      return { ok: false, response: bad('That file is over 10 MB.', 413) };
    }
    return { ok: true, request };
  }
  const body = await readBoundedBytes(request, MAX_UPLOAD_BODY_BYTES);
  if (body === null) {
    return { ok: false, response: bad('That file is over 10 MB.', 413) };
  }
  return {
    ok: true,
    request: new Request(request.url, {
      method: request.method,
      headers: request.headers,
      body: body as unknown as BodyInit,
    }),
  };
}

export async function action({ request }: ActionFunctionArgs) {
  await requireMutableRequest(request);
  const access = await requireLessonPlannerAccess(request);
  const flags = await getLessonPlannerReviewFlags(access.membership.organization.id);
  if (!flags.uploads) return bad('Not found.', 404);

  const capped = await requestWithinUploadCap(request);
  if (!capped.ok) return capped.response;

  const form = await capped.request.formData();
  const intent = form.get('intent');
  const conversationId = form.get('conversationId')?.toString() || null;

  if (intent === 'remove') {
    const uploadId = form.get('uploadId')?.toString();
    if (!uploadId) return bad('Which document?');
    const removed = await prisma.lessonPlanUpload.deleteMany({
      where: { id: uploadId, membershipId: access.membership.id },
    });
    return removed.count ? dataResponse({ ok: true }) : bad('Not found.', 404);
  }

  if (intent === 'mode') {
    if (!flags.uploadPictures) return bad('Not found.', 404);
    const uploadId = form.get('uploadId')?.toString();
    if (!uploadId) return bad('Which document?');
    const raw = form.get('mode')?.toString() ?? '';
    const mode = raw === '' ? null : isDeckMode(raw) ? raw : undefined;
    if (mode === undefined) return bad('Teach it or refresh it?');
    if ((mode === 'teach' && !flags.teachMySlides) || (mode === 'refresh' && !flags.refreshMyDeck)) {
      return bad('Not found.', 404);
    }
    const updated = await prisma.lessonPlanUpload.updateMany({
      // Only a deck that was kept whole has slides to teach or pictures to keep.
      where: { id: uploadId, membershipId: access.membership.id, keptDeck: true },
      data: { mode },
    });
    return updated.count ? dataResponse({ ok: true, mode }) : bad('Not found.', 404);
  }

  if (intent !== 'upload') return bad('Unknown request.');
  const file = form.get('file');
  if (!(file instanceof File)) return bad('Choose a file to add.');

  const conversation = conversationId
    ? await prisma.lessonPlanConversation.findFirst({
        where: { id: conversationId, membershipId: access.membership.id, deletedAt: null },
        select: { id: true },
      })
    : null;
  if (conversationId && !conversation) return bad('Lesson not found.', 404);
  const held = await prisma.lessonPlanUpload.count({
    where: conversation
      ? { conversationId: conversation.id }
      : // Waiting for a first message: this teacher's from the last day.
        { membershipId: access.membership.id, conversationId: null, createdAt: { gt: new Date(Date.now() - PENDING_UPLOAD_MS) } },
  });
  if (held >= MAX_SOURCES_PER_LESSON) {
    return bad(`A lesson can hold ${MAX_SOURCES_PER_LESSON} documents. Remove one to add another.`);
  }

  let read;
  try {
    read = await readSourceDocument(file, { keepDeck: Boolean(flags.uploadPictures) });
  } catch (error) {
    if (error instanceof SourceDocumentError) {
      return bad(
        safeDomainErrorTextForClientResponse(
          error,
          'Could not read that document. Try another file.',
        ),
        422,
      );
    }
    return bad(
      safeErrorTextForClientResponse(
        error,
        'Could not read that document. Try another file.',
      ),
      422,
    );
  }

  const deck = flags.uploadPictures ? read.deck : null;
  const upload = await prisma.lessonPlanUpload.create({
    data: {
      conversationId: conversation?.id ?? null,
      membershipId: access.membership.id,
      name: file.name.trim().slice(0, 200) || 'Document',
      contentType: read.contentType,
      byteSize: file.size,
      text: read.text,
      truncated: read.truncated,
      ...(deck
        ? {
            file: new Uint8Array(deck.file),
            keptDeck: true,
            pictures: {
              create: deck.pictures.flatMap((picture) =>
                picture.bytes && picture.contentType
                  ? [
                      {
                        membershipId: access.membership.id,
                        position: picture.position,
                        slideNumbers: picture.slideNumbers,
                        altText: picture.altText,
                        contentType: picture.contentType,
                        byteSize: picture.bytes.byteLength,
                        width: picture.width,
                        height: picture.height,
                        blob: new Uint8Array(picture.bytes),
                      },
                    ]
                  : []
              ),
            },
          }
        : {}),
    },
    select: {
      id: true,
      name: true,
      truncated: true,
      text: true,
      ...(deck ? { mode: true, _count: { select: { pictures: true } } } : {}),
    },
  });
  const kept = upload as typeof upload & { mode?: string | null; _count?: { pictures: number } };
  return dataResponse({
    ok: true,
    conversationId: conversation?.id ?? null,
    upload: {
      id: upload.id,
      name: upload.name,
      truncated: upload.truncated,
      characters: upload.text.length,
      ...(deck ? { deck: { pictures: kept._count?.pictures ?? 0, mode: kept.mode ?? null } } : {}),
    },
  });
}
