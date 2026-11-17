import type { MiddlewareFunction } from 'react-router';
import { isSiteLicenseLockedCourseAssetPath } from '~/domain/free-tier/site-license-how-to-teach';
import { shouldBlockSiteLicenseCourseAsset } from '~/domain/free-tier/site-license-how-to-teach.server';

/**
 * Refuse thesis-essay course downloads and media for free-classroom orgs before
 * static files are served.
 */
export const siteLicenseCourseAssetMiddleware: MiddlewareFunction = async (
  { request },
  next
) => {
  const { pathname } = new URL(request.url);
  if (
    !isSiteLicenseLockedCourseAssetPath(pathname) ||
    (request.method !== 'GET' && request.method !== 'HEAD')
  ) {
    return next();
  }
  if (await shouldBlockSiteLicenseCourseAsset(request)) {
    return new Response('Comes with a school site license.', {
      status: 403,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
  return next();
};