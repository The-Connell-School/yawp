import type { NextFunction, Request as ExpressRequest, Response as ExpressResponse } from 'express';
import {
  isSiteLicenseLockedCourseAssetPath,
  SITE_LICENSE_HOW_TO_TEACH_LOCK_MESSAGE,
} from '~/domain/free-tier/site-license-how-to-teach';
import { shouldBlockSiteLicenseCourseAsset } from '~/domain/free-tier/site-license-how-to-teach.server';

export function expressRequestToWebRequest(req: ExpressRequest): Request {
  const protocol = req.protocol;
  const host = req.get('host') ?? 'localhost';
  const url = `${protocol}://${host}${req.originalUrl}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const part of value) headers.append(key, part);
    } else {
      headers.set(key, String(value));
    }
  }
  return new Request(url, { method: req.method, headers });
}

/**
 * Runs before `express.static('public')` so thesis-essay course files honor the
 * same free-tier gate as React Router root middleware.
 */
export function siteLicenseCourseAssetExpressMiddleware(
  req: ExpressRequest,
  res: ExpressResponse,
  next: NextFunction
) {
  const path = req.path || '/';
  if (
    !isSiteLicenseLockedCourseAssetPath(path) ||
    (req.method !== 'GET' && req.method !== 'HEAD')
  ) {
    next();
    return;
  }
  void (async () => {
    try {
      const blocked = await shouldBlockSiteLicenseCourseAsset(
        expressRequestToWebRequest(req)
      );
      if (blocked) {
        res
          .status(403)
          .type('text/plain; charset=utf-8')
          .send(SITE_LICENSE_HOW_TO_TEACH_LOCK_MESSAGE);
        return;
      }
    } catch {
      res
        .status(403)
        .type('text/plain; charset=utf-8')
        .send(SITE_LICENSE_HOW_TO_TEACH_LOCK_MESSAGE);
      return;
    }
    next();
  })();
}