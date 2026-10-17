import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { z } from 'zod';
import { isBelowHsGrade } from '~/domain/free-tier/grade-gate';
import { isPublicOnboardingV2Enabled, isSupportedSignupGrade } from '~/domain/free-tier/public-onboarding.server';
import { RATE_LIMITS } from '~/config/rate-limits';
import { checkTokenValidity, hashToken, normalizeEmail, redeemInputSchema, redeemToken } from '~/domain/free-tier/service.server';
import { readScanDedupeCookie } from '~/domain/free-tier/acquisition-token-scan.server';
import { readBoundedText } from '~/utils/bounded-body.server';
import { enforceUnauthByIpAndTarget } from '~/utils/rate-limit.server';

const baseHeaders = { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: baseHeaders });

async function throttle(request: Request, route: string, targetKey: string, perTargetPerHour: number = RATE_LIMITS.unauth.freeTierToken.perEmailPerHour) {
  const cfg = RATE_LIMITS.unauth.freeTierToken;
  const gate = await enforceUnauthByIpAndTarget({
    request,
    route,
    targetKey,
    perIpPerMinute: cfg.perIpPerMinute,
    perIpPerHour: cfg.perIpPerHour,
    perTargetPerHour,
  });
  if (gate.allowed) return null;
  return new Response(null, { status: 429, headers: { ...baseHeaders, 'retry-after': String(gate.retryAfterSeconds) } });
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const token = url.searchParams.get('token') || '';
  if (!token || token.length > 500) return json({ valid: false, reason: 'invalid' }, 400);
  // The per-target budget is per token, so one hot QR code is not throttled
  // by a handful of scans; the per-IP budgets carry the abuse protection.
  const limited = await throttle(request, '/api/free-tier/token:get', `token:${hashToken(token)}`.slice(0, 80), 5000);
  if (limited) return limited;
  const result = await checkTokenValidity(token);
  return json(result, result.valid ? 200 : 404);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'Invalid content type' }, 400);
  const text = await readBoundedText(request, 4096);
  if (text === null) return json({ error: 'Payload too large' }, 413);
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    return json({ error: 'Malformed JSON' }, 400);
  }
  const email = input && typeof input === 'object' ? (input as Record<string, unknown>).email : undefined;
  const limited = await throttle(request, '/api/free-tier/token:post', typeof email === 'string' ? normalizeEmail(email).slice(0, 320) : 'none');
  if (limited) return limited;
  const onboardingV2 = await isPublicOnboardingV2Enabled();
  const trapped = input && typeof input === 'object' && 'middleName' in input && typeof input.middleName === 'string' && input.middleName.trim();
  if (onboardingV2 && trapped) return json({ ok: true });
  const schema = onboardingV2 ? redeemInputSchema.extend({ middleName: z.string().max(200).optional() }) : redeemInputSchema;
  const parsed = schema.safeParse(input);
  if (!parsed.success) return json({ error: 'Invalid input' }, 400);
  const { middleName: _middleName, ...applicant } = parsed.data as typeof parsed.data & { middleName?: string };
  if (onboardingV2 && !isSupportedSignupGrade(applicant.gradeLevel)) return json({ error: 'Invalid grade' }, 400);
  if (onboardingV2 && isBelowHsGrade(applicant.gradeLevel)) return (await import('~/domain/free-tier/grade-gate.server')).recordBelowHsDecline(applicant);
  const cookie = await readScanDedupeCookie(request);
  const result = await redeemToken(applicant, { scanDedupeCookie: cookie, ...(onboardingV2 ? { onboardingV2: true } : {}) });
  if (!result.ok) {
    const map = { invalid: 404, exhausted: 409, expired: 410, disabled: 410, budget_exceeded: 402, cap_reached: 409 } as const;
    return json({ ok: false, reason: result.reason }, map[result.reason] ?? 400);
  }
  // Nothing about the application (id, status, whether the email already
  // existed) is returned: that would let anyone holding a QR token probe emails.
  return json({ ok: true, bypassWaitlist: result.bypassWaitlist }, 200);
};
