import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { checkTokenValidity, redeemInputSchema, redeemToken } from '~/domain/free-tier/service.server';

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const token = url.searchParams.get('token') || '';
  if (!token || token.length > 500) return json({ valid: false, reason: 'invalid' }, 400);
  const result = await checkTokenValidity(token);
  return json(result, result.valid ? 200 : 404);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'Invalid content type' }, 400);
  const text = await request.text();
  if (text.length > 4096) return json({ error: 'Payload too large' }, 413);
  let input: unknown;
  try { input = JSON.parse(text); } catch { return json({ error: 'Malformed JSON' }, 400); }
  const parsed = redeemInputSchema.safeParse(input);
  if (!parsed.success) return json({ error: 'Invalid input' }, 400);
  const result = await redeemToken(parsed.data);
  if (!result.ok) {
    const map = { invalid: 404, exhausted: 409, expired: 410 } as const;
    return json({ ok: false, reason: result.reason }, map[result.reason] ?? 400);
  }
  return json(result, 200);
};

