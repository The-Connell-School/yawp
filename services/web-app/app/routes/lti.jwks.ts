import type { LoaderFunctionArgs } from 'react-router';
import { getToolJwks } from '~/utils/lti/keys.server.ts';

export async function loader(_args: LoaderFunctionArgs) {
  const jwks = await getToolJwks();
  return new Response(JSON.stringify(jwks), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

