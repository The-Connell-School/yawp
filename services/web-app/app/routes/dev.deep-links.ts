import type { LoaderFunctionArgs } from 'react-router';

export async function loader({ request }: LoaderFunctionArgs) {
  // Convenience alias: old docs referenced /dev/deep-links directly.
  const url = new URL(request.url);
  url.pathname = '/dev/blackboard-lti-mock/dev/deep-links';
  return new Response(null, { status: 302, headers: { location: url.toString() } });
}

