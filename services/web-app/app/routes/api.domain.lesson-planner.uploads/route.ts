/**
 * A teacher's own documents for a lesson (Oct 21): upload one, or take one
 * back out. Only the text read out of the file is kept. Scoped to the
 * teacher's own lessons, behind lesson_planner_uploads.
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
import { PENDING_UPLOAD_MS } from '~/domain/lesson-planner/lesson-uploads';

function bad(message: string, status = 400) {
  return dataResponse({ error: message }, { status });
}

export async function action({ request }: ActionFunctionArgs) {
  await requireMutableRequest(request);
  const access = await requireLessonPlannerAccess(request);
  const flags = await getLessonPlannerReviewFlags(access.membership.organization.id);
  if (!flags.uploads) return bad('Not found.', 404);

  // Refused before the body is read: a request far over the limit never
  // reaches memory.
  const length = Number(request.headers.get('content-length'));
  if (Number.isFinite(length) && length > MAX_SOURCE_BYTES + 1024 * 1024) return bad('That file is over 10 MB.', 413);

  const form = await request.formData();
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
    read = await readSourceDocument(file);
  } catch (error) {
    if (error instanceof SourceDocumentError) return bad(error.message, 422);
    throw error;
  }

  const upload = await prisma.lessonPlanUpload.create({
    data: {
      conversationId: conversation?.id ?? null,
      membershipId: access.membership.id,
      name: file.name.trim().slice(0, 200) || 'Document',
      contentType: read.contentType,
      byteSize: file.size,
      text: read.text,
      truncated: read.truncated,
    },
    select: { id: true, name: true, truncated: true, text: true },
  });
  return dataResponse({
    ok: true,
    conversationId: conversation?.id ?? null,
    upload: { id: upload.id, name: upload.name, truncated: upload.truncated, characters: upload.text.length },
  });
}
