import type { LoaderFunctionArgs } from 'react-router';
import { googleCallback } from '~/domain/unified-signon/google.server';
export async function loader({ request }: LoaderFunctionArgs) {
  return googleCallback(request);
}
export function headers() {
  return { 'Cache-Control': 'private, no-store' };
}
