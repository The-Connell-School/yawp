import type { ActionFunctionArgs } from 'react-router';

/** Guided tours were removed; legacy clients receive 404. */
export async function action(_args: ActionFunctionArgs) {
  return Response.json({ error: 'Not found' }, { status: 404 });
}
