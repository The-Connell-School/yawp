import type { LoaderFunctionArgs } from 'react-router';
import { rejectWithoutExplicitPreviewDevLoginAccess } from '~/utils/preview-access.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const accessBlock = await rejectWithoutExplicitPreviewDevLoginAccess(request);
  if (accessBlock) return accessBlock;

  // Convenience alias: old docs referenced /dev/deep-links directly.
  const url = new URL(request.url);
  url.pathname = '/dev/blackboard-lti-mock/dev/deep-links';
  return new Response(null, { status: 302, headers: { location: url.toString() } });
}

