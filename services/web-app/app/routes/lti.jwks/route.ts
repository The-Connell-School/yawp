import type { LoaderFunctionArgs } from 'react-router';
import { getLtiToolJwks } from '~/domain/lms/lti-tool-keyset.server';

export function loader(_args: LoaderFunctionArgs) {
  try {
    return Response.json(getLtiToolJwks(), {
      headers: {
        'cache-control': 'public, max-age=300, stale-while-revalidate=300',
        'content-type': 'application/jwk-set+json',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch {
    return Response.json(
      { error: 'LTI tool keys are unavailable.' },
      {
        status: 503,
        headers: {
          'cache-control': 'no-store',
          'content-type': 'application/json',
          'x-content-type-options': 'nosniff',
        },
      }
    );
  }
}
