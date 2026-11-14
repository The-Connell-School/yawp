/**
 * Where Lounge videos live. Real environments upload straight from the
 * browser to S3 with a presigned PUT and play back from presigned GETs.
 * End-to-end tests (and local development that opts in with
 * LOUNGE_VIDEO_LOCAL_STORE=true) keep files on disk behind
 * /api/lounge/video-local instead, because they have no AWS credentials.
 * So do PR previews, which have no AWS access. Production and demo never
 * use the local store.
 */
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loungeVideoKey, type LoungeVideoContentType } from './video';

type Env = Record<string, string | undefined>;

export function loungeVideoStoreKind(env: Env = process.env): 'local' | 's3' {
  // PR previews have no AWS access at all; their videos live and die with
  // the preview container. Demo and production always use S3.
  if (env.YAWP_ENVIRONMENT === 'preview' && /^pr-\d+$/.test(env.PREVIEW_SLUG ?? '')) return 'local';
  if (env.NODE_ENV === 'production') return 's3';
  return env.E2E === 'true' || env.LOUNGE_VIDEO_LOCAL_STORE === 'true' ? 'local' : 's3';
}

function localStoreDir(env: Env = process.env): string {
  return env.LOUNGE_VIDEO_LOCAL_DIR || path.join(os.tmpdir(), 'yawp-lounge-videos');
}

const LOCAL_KEY = /^lounge\/videos\/([A-Za-z0-9_-]{1,64})\/([a-z0-9]{16,64}\.(?:mp4|webm|mov))$/;

export function localLoungeVideoPath(dir: string, key: string): string | null {
  const match = LOCAL_KEY.exec(key);
  return match ? path.join(dir, match[1], match[2]) : null;
}

function localUrl(key: string): string {
  return `/api/lounge/video-local?key=${encodeURIComponent(key)}`;
}

export async function createLoungeVideoUpload(params: {
  userId: string;
  contentType: LoungeVideoContentType;
}): Promise<{ key: string; uploadUrl: string }> {
  const key = loungeVideoKey(params.userId, params.contentType, randomBytes(12).toString('hex'));
  if (loungeVideoStoreKind() === 'local') return { key, uploadUrl: localUrl(key) };
  const { getSignedPutUrl } = await import('~/services/s3.server');
  return { key, uploadUrl: await getSignedPutUrl(key, params.contentType) };
}

/** A URL the browser can play, or null if signing fails (shown as "unavailable"). */
export async function loungeVideoPlaybackUrl(key: string): Promise<string | null> {
  if (loungeVideoStoreKind() === 'local') return localUrl(key);
  try {
    const { getSignedGetUrl } = await import('~/services/s3.server');
    return await getSignedGetUrl(key, 6 * 3600);
  } catch (error) {
    console.warn('lounge_video_sign_failed', error instanceof Error ? error.message : error);
    return null;
  }
}

export async function writeLocalLoungeVideo(key: string, body: Uint8Array): Promise<boolean> {
  const file = localLoungeVideoPath(localStoreDir(), key);
  if (!file) return false;
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body);
  return true;
}

export async function readLocalLoungeVideo(key: string): Promise<Uint8Array | null> {
  const file = localLoungeVideoPath(localStoreDir(), key);
  if (!file) return null;
  try {
    return await readFile(file);
  } catch {
    return null;
  }
}
