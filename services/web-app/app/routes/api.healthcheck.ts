import { type LoaderFunctionArgs } from 'react-router';
import { settleWithin } from '~/domain/free-tier/approval-delivery-deadline';
import { kickApprovalDelivery } from '~/domain/free-tier/approval-delivery-runtime.server';
import { isDatabaseReady } from '~/utils/db-readiness.server';

/** App Runner, ALB, and preview deploy scripts probe this path for stack health (includes DB). */
export async function loader(_args: LoaderFunctionArgs) {
  const ok = await isDatabaseReady();
  if (ok) {
    // Temporary fallback: the scheduled POST /api/jobs/approval-delivery job
    // (infra/main.tf) is the real sender. Remove this drain once that job is
    // live so the probe stays a plain database check.
    await settleWithin(kickApprovalDelivery(), 1500);
  }
  return new Response(ok ? 'OK' : 'UNAVAILABLE', { status: ok ? 200 : 503 });
}
