import { type LoaderFunctionArgs } from 'react-router';
import { settleWithin } from '~/domain/free-tier/approval-delivery-deadline';
import { kickApprovalDelivery } from '~/domain/free-tier/approval-delivery-runtime.server';
import { isDatabaseReady } from '~/utils/db-readiness.server';

/** App Runner, ALB, and preview deploy scripts probe this path for stack health (includes DB). */
export async function loader(_args: LoaderFunctionArgs) {
  const ok = await isDatabaseReady();
  if (ok) {
    // Give a throttled App Runner instance a slice of CPU to send due mail,
    // without letting a slow drain fail the health check.
    await settleWithin(kickApprovalDelivery(), 1500);
  }
  return new Response(ok ? 'OK' : 'UNAVAILABLE', { status: ok ? 200 : 503 });
}
