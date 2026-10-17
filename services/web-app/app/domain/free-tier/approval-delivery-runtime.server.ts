import { startEndDelivery } from '~/utils/internal-impersonation-delivery.server';
import { runApprovalJobs } from './approval-v2.server';
const state = globalThis as typeof globalThis & {
  yawpApprovalDeliveryStop?: () => void;
};
export function startApprovalDelivery() {
  if (
    process.env.FREE_TIER_APPROVAL_WORKER_ENABLED === 'false' ||
    (process.env.NODE_ENV !== 'production' &&
      process.env.FREE_TIER_APPROVAL_WORKER_ENABLED !== 'true') ||
    state.yawpApprovalDeliveryStop
  )
    return;
  // The existing bounded loop pattern, one timer per process; database jobs own
  // cadence and claims. Every drain and dispatch rechecks the rollout.
  state.yawpApprovalDeliveryStop = startEndDelivery(() => runApprovalJobs(), {
    reportFailure: () =>
      console.error({ event: 'free_tier_approval_delivery_failed' }),
  });
}
