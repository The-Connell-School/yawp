import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  isSiteLicenseLockedCourseAssetPath,
  SITE_LICENSE_HOW_TO_TEACH_LOCK_MESSAGE,
} from '~/domain/free-tier/site-license-how-to-teach';
import { shouldBlockSiteLicenseCourseAsset } from '~/domain/free-tier/site-license-how-to-teach.server';

function requestFromNode(
  req: IncomingMessage,
  protocol: string,
  host: string
): Request {
  const url = `${protocol}://${host}${req.url ?? '/'}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const part of value) headers.append(key, part);
    } else {
      headers.set(key, value);
    }
  }
  return new Request(url, { method: req.method ?? 'GET', headers });
}

/**
 * Vite dev middleware: mirror production express gate for public/courses assets.
 */
export async function handleSiteLicenseCourseAssetDevGate(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void
) {
  const path = new URL(req.url ?? '/', 'http://vite.local').pathname;
  if (
    !isSiteLicenseLockedCourseAssetPath(path) ||
    (req.method !== 'GET' && req.method !== 'HEAD')
  ) {
    next();
    return;
  }
  const host = req.headers.host ?? '127.0.0.1:5173';
  try {
    const blocked = await shouldBlockSiteLicenseCourseAsset(
      requestFromNode(req, 'http', host)
    );
    if (blocked) {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end(SITE_LICENSE_HOW_TO_TEACH_LOCK_MESSAGE);
      return;
    }
  } catch {
    res.statusCode = 403;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end(SITE_LICENSE_HOW_TO_TEACH_LOCK_MESSAGE);
    return;
  }
  next();
}