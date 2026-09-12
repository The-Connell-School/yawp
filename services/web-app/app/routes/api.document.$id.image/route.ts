import { invariantResponse } from '@epic-web/invariant';
import { type ActionFunctionArgs } from 'react-router';
import {
  DOCUMENT_IMAGE_KILL_SWITCH_ENV,
  DOCUMENT_IMAGE_MAX_BYTES,
  DOCUMENT_IMAGE_MAX_PER_DOCUMENT,
  buildDocumentImageSrc,
  isDocumentImageUploadEnabled,
  sniffImageContentType,
  validateDocumentImageUpload,
} from '~/domain/document-images/document-images';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Upload one figure into a student's own document.
 *
 * Authorization is deliberately narrower than the document *save* route: a
 * teacher can open and comment on a student's document, but only the author
 * adds figures to their own report, so this scopes to the caller's own
 * membership rather than also matching their teachers' documents.
 */
export async function action({ request, params }: ActionFunctionArgs) {
  invariantResponse(params.id, 'id is required', { status: 400 });

  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);

  const document = await prisma.document.findFirst({
    where: { id: params.id, membershipId: profile.id, deletedAt: null },
    select: {
      id: true,
      assignmentType: {
        select: { allowsImageUploads: true, rubric: { select: { name: true } } },
      },
    },
  });

  if (!document) return json({ ok: false, reason: 'forbidden' }, 403);

  const enabled = isDocumentImageUploadEnabled({
    rubricName: document.assignmentType?.rubric?.name ?? null,
    allowsImageUploads: document.assignmentType?.allowsImageUploads ?? false,
    killSwitch: process.env[DOCUMENT_IMAGE_KILL_SWITCH_ENV],
  });
  if (!enabled) return json({ ok: false, reason: 'not-enabled' }, 403);

  // Before parsing: request.formData() materializes the whole body in memory,
  // so a cap checked afterwards bounds what we store but not what we buffer.
  // The multipart envelope costs a little over the file itself; one extra MB
  // of headroom keeps an honest 8 MB upload from being rejected on framing.
  const declaredLength = Number(request.headers.get('Content-Length') ?? '');
  if (Number.isFinite(declaredLength) && declaredLength > DOCUMENT_IMAGE_MAX_BYTES + 1024 * 1024) {
    return json(
      { ok: false, reason: 'too-large', message: 'That image is too large.' },
      413
    );
  }

  const figureCount = await prisma.documentImage.count({
    where: { documentId: document.id, deletedAt: null },
  });
  if (figureCount >= DOCUMENT_IMAGE_MAX_PER_DOCUMENT) {
    return json(
      {
        ok: false,
        reason: 'too-many',
        message: `This report already has ${DOCUMENT_IMAGE_MAX_PER_DOCUMENT} images. Remove one before adding another.`,
      },
      400
    );
  }

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return json({ ok: false, reason: 'missing-file', message: 'No image was sent.' }, 400);
  }

  const validation = validateDocumentImageUpload({
    contentType: file.type,
    byteSize: file.size,
    altText: form.get('altText')?.toString() ?? '',
  });

  if (!validation.ok) {
    return json({ ok: false, reason: validation.reason, message: validation.message }, 400);
  }

  // file.size is already checked above; read only after that so an oversized
  // upload never gets buffered into memory in full.
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.byteLength > DOCUMENT_IMAGE_MAX_BYTES) {
    return json({ ok: false, reason: 'too-large', message: 'That image is too large.' }, 400);
  }

  // `file.type` is a claim the caller typed into a multipart header, and these
  // bytes are served back inline from our own origin. Store the format the
  // bytes actually are, so nothing but a real raster image can ever be handed
  // to a browser from this table.
  const sniffed = sniffImageContentType(bytes);
  if (!sniffed) {
    return json(
      {
        ok: false,
        reason: 'unsupported-type',
        message: 'That file is not a PNG, JPEG, GIF, or WebP image.',
      },
      400
    );
  }

  const image = await prisma.documentImage.create({
    data: {
      documentId: document.id,
      altText: validation.altText,
      contentType: sniffed,
      byteSize: bytes.byteLength,
      blob: bytes,
    },
    select: { id: true, altText: true },
  });

  return json(
    {
      ok: true,
      id: image.id,
      src: buildDocumentImageSrc(image.id),
      altText: image.altText,
    },
    200
  );
}
