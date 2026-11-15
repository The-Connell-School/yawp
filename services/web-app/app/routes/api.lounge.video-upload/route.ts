import { type ActionFunctionArgs, data } from 'react-router';
import { requireLoungeAccess } from '~/domain/lounge/access.server';
import { baseVideoContentType, LOUNGE_VIDEO_MAX_BYTES } from '~/domain/lounge/video';
import { createLoungeVideoUpload } from '~/domain/lounge/video-storage.server';

/**
 * The Yawp team asks where to upload a Lounge video. Returns a storage key
 * and a URL the browser PUTs the file to directly; the reply form then sends
 * the key. Everyone else gets a 404.
 */
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') return data({ error: 'Method not allowed' }, { status: 405 });
  const { viewer } = await requireLoungeAccess(request);
  if (!viewer.isStaff) return data({ error: 'Not found' }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { contentType?: unknown; size?: unknown } | null;
  const contentType = baseVideoContentType(typeof body?.contentType === 'string' ? body.contentType : '');
  const size = typeof body?.size === 'number' ? body.size : Number.NaN;
  if (!contentType) {
    return data({ error: 'Use an MP4, WebM, or QuickTime video.' }, { status: 400 });
  }
  if (!Number.isFinite(size) || size <= 0 || size > LOUNGE_VIDEO_MAX_BYTES) {
    return data({ error: 'That video is too large. Keep it under 500 MB.' }, { status: 400 });
  }
  const upload = await createLoungeVideoUpload({ userId: viewer.userId, contentType });
  return data({ ...upload, contentType });
}
