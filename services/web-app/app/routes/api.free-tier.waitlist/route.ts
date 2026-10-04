import type { ActionFunctionArgs } from 'react-router';
import { waitlistInputSchema, submitWaitlist } from '~/domain/free-tier/service.server';
import { rateLimitCheck, rateLimitRecordFailure } from '~/utils/ip-rate-limit.server';

const ok = () => Response.json({ ok: true }, { headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
const bad = (status: number, message: string) => Response.json({ error: message }, { status, headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== 'POST') return bad(405, 'Method not allowed');
  const gate = rateLimitCheck(request);
  if (!gate.allowed) return new Response(null, { status: 429, headers: { 'retry-after': String(gate.retryAfter), 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    rateLimitRecordFailure(request);
    return bad(400, 'Invalid content type');
  }
  const text = await request.text();
  if (text.length > 4096) {
    rateLimitRecordFailure(request);
    return bad(413, 'Payload too large');
  }
  let input: unknown;
  try { input = JSON.parse(text); }
  catch {
    rateLimitRecordFailure(request);
    return bad(400, 'Malformed JSON');
  }
  try {
    const parsed = waitlistInputSchema.parse(input);
    // Honeypot short-circuit: treated as success but ignored
    if (parsed.middleName) return ok();
    await submitWaitlist(parsed);
    return ok();
  } catch {
    rateLimitRecordFailure(request);
    return bad(400, 'Invalid input');
  }
};

