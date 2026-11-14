import { type LoaderFunctionArgs } from 'react-router';

/** Retired with AP History; keep the route returning 404 for stable URLs. */
export async function loader(_args: LoaderFunctionArgs) {
  throw new Response(null, { status: 404 });
}