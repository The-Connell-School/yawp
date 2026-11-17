import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webAppRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);

const THESIS_COURSE_PUBLIC_ROOT = path.join(
  webAppRoot,
  'public/courses/thesis-driven-essay'
);

const MIME_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.pptx':
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.mp4': 'video/mp4',
  '.vtt': 'text/vtt; charset=utf-8',
  '.jpg': 'image/jpeg',
};

export function thesisCourseAssetMimeType(filePath: string) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

/**
 * Resolve a splat segment under `/courses/thesis-driven-essay/*` to an on-disk file
 * in `public/courses/thesis-driven-essay`. Returns null when the path escapes
 * that directory or the file is missing.
 */
export function resolveThesisCourseAssetAbsolutePath(relativeSplat: string) {
  const normalized = path.posix
    .normalize(relativeSplat.replace(/^\/+/, ''))
    .replace(/^\.\.(\/|$)/, '');
  if (!normalized || normalized === '.' || normalized.includes('..')) {
    return null;
  }
  const absolute = path.resolve(THESIS_COURSE_PUBLIC_ROOT, normalized);
  const relativeToRoot = path.relative(THESIS_COURSE_PUBLIC_ROOT, absolute);
  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
    return null;
  }
  if (!fs.existsSync(absolute)) return null;
  const stat = fs.statSync(absolute);
  if (!stat.isFile()) return null;
  return absolute;
}