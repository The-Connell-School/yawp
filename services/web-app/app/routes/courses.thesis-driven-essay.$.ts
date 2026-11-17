import type { LoaderFunctionArgs } from 'react-router';
import {
  resolveThesisCourseAssetAbsolutePath,
  thesisCourseAssetMimeType,
} from '~/utils/thesis-course-asset.server';

/**
 * Serves thesis-essay course files from `public/` after root middleware applies
 * the site-license gate (static client output for these paths is stripped at build).
 */
export async function loader({ request, params }: LoaderFunctionArgs) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const absolute = resolveThesisCourseAssetAbsolutePath(params['*'] ?? '');
  if (!absolute) {
    throw new Response('Not found', { status: 404 });
  }

  const headers = new Headers({
    'Content-Type': thesisCourseAssetMimeType(absolute),
    'Cache-Control': 'public, max-age=3600',
  });

  if (request.method === 'HEAD') {
    return new Response(null, { status: 200, headers });
  }

  const file = Bun.file(absolute);
  return new Response(file, { status: 200, headers });
}