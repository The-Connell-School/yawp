import { isDemoDeployment } from '~/domain/feature-flags/feature-flags.deployment';
import { startEndDelivery } from '~/utils/internal-impersonation-delivery.server';
import { pollSuppressedAdminApprovals } from './admin-approval-undeliverable.server';
import {
  deliverQueuedApprovalJobs,
  runApprovalJobs,
} from './approval-v2.server';

const state = globalThis as typeof globalThis & {
  yawpApprovalDeliveryStop?: () => void;
  yawpApprovalDeliveryKick?: Promise<void> | null;
  yawpApprovalDeliveryKickAt?: number;
};

/** Production App Runner and the demo host should drain the approval outbox. */
export function approvalDeliveryEnabled(
  env: Record<string, string | undefined> = process.env
) {
  if (env.FREE_TIER_APPROVAL_WORKER_ENABLED === 'false') return false;
  if (env.FREE_TIER_APPROVAL_WORKER_ENABLED === 'true') return true;
  return env.NODE_ENV === 'production' || isDemoDeployment(env);
}

/**
 * Drain due mail during a request. App Runner throttles CPU between requests,
 * so the background timer alone does not send a denial once the hour is up.
 */
export function kickApprovalDelivery(): Promise<void> {
  if (!approvalDeliveryEnabled()) return Promise.resolve();
  if (state.yawpApprovalDeliveryKick) return state.yawpApprovalDeliveryKick;
  const now = Date.now();
  if (now - (state.yawpApprovalDeliveryKickAt ?? 0) < 30_000) {
    return Promise.resolve();
  }
  state.yawpApprovalDeliveryKickAt = now;
  const kick = (async () => {
    await deliverQueuedApprovalJobs();
    await runApprovalJobs();
    await pollSuppressedAdminApprovals();
  })()
    .catch(() => {
      console.error({ event: 'free_tier_approval_delivery_failed' });
    })
    .finally(() => {
      if (state.yawpApprovalDeliveryKick === kick) {
        state.yawpApprovalDeliveryKick = null;
      }
    });
  state.yawpApprovalDeliveryKick = kick;
  return kick;
}

export function startApprovalDelivery() {
  if (!approvalDeliveryEnabled() || state.yawpApprovalDeliveryStop) return;
  // The existing bounded loop pattern, one timer per process; database jobs own
  // cadence and claims. Every drain and dispatch rechecks the rollout.
  // Health checks also call kickApprovalDelivery so a throttled instance still
  // sends once it is asked to serve.
  state.yawpApprovalDeliveryStop = startEndDelivery(() => runApprovalJobs(), {
    reportFailure: () =>
      console.error({ event: 'free_tier_approval_delivery_failed' }),
  });
}
