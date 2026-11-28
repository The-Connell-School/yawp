import { createHash, timingSafeEqual } from 'node:crypto';
import type { ActionFunctionArgs } from 'react-router';
import {
  approvalDeliveryEnabled,
  drainApprovalDelivery,
} from '~/domain/free-tier/approval-delivery-runtime.server';

/**
 * EventBridge API destinations give up after 5 seconds, so the request waits
 * for the drain a little less than that. A slower drain keeps running in the
 * process; the next scheduled call joins it instead of starting another.
 */
const WAIT_FOR_DRAIN_MS = 4000;

function tokenMatches(request: Request) {
  const expected = process.env.INTERNAL_COMMAND_TOKEN;
  const given = request.headers.get('x-internal-token');
  if (!expected || !given) return false;
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

/**
 * Sends due free-tier approval email (the one-hour teacher denial, admin
 * reminders, follow-ups). Called every minute by EventBridge (see
 * infra/main.tf), so delivery does not depend on App Runner giving an idle
 * instance CPU. Header token only, never the query string.
 */
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: { Allow: 'POST' },
    });
  }
  if (!tokenMatches(request)) {
    return new Response('Unauthorized', { status: 401 });
  }
  if (!approvalDeliveryEnabled()) {
    return Response.json({ status: 'skipped' });
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const outcome = await Promise.race([
    drainApprovalDelivery(),
    new Promise<'running'>((resolve) => {
      timer = setTimeout(() => resolve('running'), WAIT_FOR_DRAIN_MS);
    }),
  ]);
  clearTimeout(timer);
  if (outcome === 'failed') {
    return Response.json({ status: 'failed' }, { status: 500 });
  }
  return Response.json({ status: outcome === 'ok' ? 'done' : 'running' });
}

export function loader() {
  return new Response('Method Not Allowed', {
    status: 405,
    headers: { Allow: 'POST' },
  });
}
