import { type ActionFunctionArgs, type LoaderFunctionArgs, data } from 'react-router';
import { requireLoungeAccess } from '~/domain/lounge/access.server';
import { isOwnLoungeVideoKey, LOUNGE_VIDEO_MAX_BYTES } from '~/domain/lounge/video';
import {
  loungeVideoStoreKind,
  readLocalLoungeVideo,
  writeLocalLoungeVideo,
} from '~/domain/lounge/video-storage.server';

/**
 * On-disk stand-in for S3, used only where loungeVideoStoreKind() is "local"
 * (end-to-end tests, opted-in local dev, PR previews). 404 everywhere else.
 */
function notFound() {
  return new Response('Not found', { status: 404 });
}

const TYPES: Record<string, string> = { mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime' };

export async function loader({ request }: LoaderFunctionArgs) {
  if (loungeVideoStoreKind() !== 'local') return notFound();
  await requireLoungeAccess(request);
  const key = new URL(request.url).searchParams.get('key') ?? '';
  const bytes = await readLocalLoungeVideo(key);
  if (!bytes) return notFound();
  const ext = key.split('.').pop() ?? '';
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Response(body, {
    headers: {
      'Content-Type': TYPES[ext] ?? 'application/octet-stream',
      'Content-Length': String(bytes.byteLength),
      'Cache-Control': 'private, max-age=3600',
    },
  });
}

export async function action({ request }: ActionFunctionArgs) {
  if (loungeVideoStoreKind() !== 'local') return notFound();
  if (request.method !== 'PUT') return data({ error: 'Method not allowed' }, { status: 405 });
  const { viewer } = await requireLoungeAccess(request);
  const key = new URL(request.url).searchParams.get('key') ?? '';
  if (!viewer.isStaff || !isOwnLoungeVideoKey(key, viewer.userId)) return notFound();
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > LOUNGE_VIDEO_MAX_BYTES) return data({ error: 'Too large' }, { status: 413 });
  const body = new Uint8Array(await request.arrayBuffer());
  if (body.byteLength === 0 || body.byteLength > LOUNGE_VIDEO_MAX_BYTES) {
    return data({ error: 'Empty or too large' }, { status: 400 });
  }
  await writeLocalLoungeVideo(key, body);
  return new Response(null, { status: 200 });
}
