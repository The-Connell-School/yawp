import type { LoaderFunctionArgs } from 'react-router';

export const loader = ({ request }: LoaderFunctionArgs) => {
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: {
        allow: 'GET',
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      },
    });
  }

  return new Response(
    JSON.stringify({
      error:
        'Tester feedback review has moved to Yawp Internal. This platform API no longer lists or exports feedback.',
    }),
    {
      status: 410,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      },
    }
  );
};
