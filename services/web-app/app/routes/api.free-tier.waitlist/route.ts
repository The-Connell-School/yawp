import type { ActionFunctionArgs } from 'react-router';
import { RATE_LIMITS } from '~/config/rate-limits';
import { normalizeEmail, submitWaitlist, waitlistInputSchema } from '~/domain/free-tier/service.server';
import { readBoundedText } from '~/utils/bounded-body.server';
import { enforceUnauthByIpAndTarget } from '~/utils/rate-limit.server';

const headers = { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' };
// Every accepted request, including honeypot hits and duplicates, gets this exact response.
const ok = () => Response.json({ ok: true }, { headers });
const bad = (status: number, message: string) => Response.json({ error: message }, { status, headers });

const MAX_BODY_BYTES = 4096;

export const action = async ({ request }: ActionFunctionArgs) => {
  const { isFreeTierEnabled } = await import('~/domain/feature-flags/feature-flags.server');
  if (!(await isFreeTierEnabled())) return bad(404, 'Not found');
  if (request.method !== 'POST') return bad(405, 'Method not allowed');
  if (!request.headers.get('content-type')?.startsWith('application/json')) return bad(400, 'Invalid content type');
  const text = await readBoundedText(request, MAX_BODY_BYTES);
  if (text === null) return bad(413, 'Payload too large');
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    return bad(400, 'Malformed JSON');
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return bad(400, 'Invalid input');

  // Honeypot first: a bot that fills the hidden field gets the normal success
  // response and nothing is stored (and it never learns the field is a trap).
  const honeypot = (input as Record<string, unknown>).middleName;
  const trapped = typeof honeypot === 'string' && honeypot.trim().length > 0;

  const email = (input as Record<string, unknown>).email;
  const cfg = RATE_LIMITS.unauth.freeTierWaitlist;
  const gate = await enforceUnauthByIpAndTarget({
    request,
    route: '/api/free-tier/waitlist',
    targetKey: typeof email === 'string' ? normalizeEmail(email).slice(0, 320) : 'none',
    perIpPerMinute: cfg.perIpPerMinute,
    perIpPerHour: cfg.perIpPerHour,
    perTargetPerHour: cfg.perEmailPerHour,
  });
  if (!gate.allowed) {
    return new Response(null, {
      status: 429,
      headers: { ...headers, 'retry-after': String(gate.retryAfterSeconds) },
    });
  }
  if (trapped) return ok();

  const parsed = waitlistInputSchema.safeParse({ ...(input as object), middleName: undefined });
  if (!parsed.success) return bad(400, 'Invalid input');
  await submitWaitlist(parsed.data);
  return ok();
};
