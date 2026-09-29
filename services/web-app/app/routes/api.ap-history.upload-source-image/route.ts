import { randomUUID } from 'node:crypto';
import { type ActionFunctionArgs, data as dataResponse } from 'react-router';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
]);

/**
 * Stores a teacher-uploaded DBQ source image and returns a stable, self-hosted
 * URL for it. Used by the custom AP History assignment builder so uploaded
 * documents render reliably from our own origin.
 */
export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);

  if (profile.role !== 'TEACHER') {
    return dataResponse(
      { success: false, message: 'Only teachers can upload source images.' },
      { status: 403 }
    );
  }

  const formData = await request.formData();
  const file = formData.get('file');
  const altText = formData.get('altText')?.toString().trim() || null;

  if (!(file instanceof File) || file.size <= 0) {
    return dataResponse(
      { success: false, message: 'An image file is required.' },
      { status: 400 }
    );
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return dataResponse(
      { success: false, message: 'Image is too large. Maximum size is 5 MB.' },
      { status: 400 }
    );
  }

  if (!ALLOWED_CONTENT_TYPES.has(file.type)) {
    return dataResponse(
      {
        success: false,
        message: 'Unsupported image type. Use PNG, JPEG, WEBP, GIF, or SVG.',
      },
      { status: 400 }
    );
  }

  const key = `upload-${randomUUID()}`;
  const blob = Buffer.from(await file.arrayBuffer());

  await prisma.apHistoryCustomSourceImage.create({
    data: {
      key,
      contentType: file.type,
      blob,
      altText,
      createdById: profile.id,
    },
    select: { id: true },
  });

  return dataResponse({
    success: true,
    key,
    url: `/api/image/ap-history-upload/${key}`,
    contentType: file.type,
  });
}
