import { type ActionFunctionArgs } from 'react-router';

/** Retired with AP History; keep the route returning 404 for stable URLs. */
export async function action(_args: ActionFunctionArgs) {
  throw new Response(null, { status: 404 });
}