import { resolveFreeTierRuntimeEnvironment } from './usage-budget.server';

/**
 * Yawp Internal's decision queue is /free-trial/waitlist (its default "Needs
 * decision" filter lists MANUAL_REVIEW). The old /free-tier/approvals path
 * never existed there, so the link landed on Internal's "Page not found".
 * `env` is explicit because Internal otherwise falls back to the operator's
 * remembered environment (often demo); `q` opens the held teacher directly.
 */
export function internalFreeTierReviewQueueUrl(teacherEmail?: string): string | null {
  const origin = process.env.INTERNAL_PLATFORM_ORIGIN?.trim().replace(/\/$/, '');
  if (!origin) return null;
  const runtime = resolveFreeTierRuntimeEnvironment();
  const params = new URLSearchParams({ env: runtime === 'demo' ? 'demo' : 'production' });
  if (teacherEmail?.trim()) params.set('q', teacherEmail.trim());
  return `${origin}/free-trial/waitlist?${params.toString()}`;
}
