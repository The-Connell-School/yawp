import { isDemoDeployment } from '~/domain/feature-flags/feature-flags.deployment';
import { startEndDelivery } from '~/utils/internal-impersonation-delivery.server';
import { pollSuppressedAdminApprovals } from './admin-approval-undeliverable.server';
import {
  deliverQueuedApprovalJobs,
  runApprovalJobs,
} from './approval-v2.server';

const state = globalThis as typeof globalThis & {
  yawpApprovalDeliveryStop?: () => void;
  yawpApprovalDeliveryKick?: Promise<'ok' | 'failed'> | null;
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
 * One bounded drain of the approval outbox, shared by every caller in this
 * process. Overlapping callers join the drain already running instead of
 * starting another. Never rejects: resolves 'failed' after logging.
 */
export function drainApprovalDelivery(
  steps: Array<() => Promise<unknown>> = [
    () => deliverQueuedApprovalJobs(),
    () => runApprovalJobs(),
    () => pollSuppressedAdminApprovals(),
  ]
): Promise<'ok' | 'failed'> {
  if (state.yawpApprovalDeliveryKick) return state.yawpApprovalDeliveryKick;
  const drain: Promise<'ok' | 'failed'> = (async () => {
    for (const step of steps) await step();
    return 'ok' as const;
  })()
    .catch(() => {
      console.error({ event: 'free_tier_approval_delivery_failed' });
      return 'failed' as const;
    })
    .finally(() => {
      if (state.yawpApprovalDeliveryKick === drain) {
        state.yawpApprovalDeliveryKick = null;
      }
    });
  state.yawpApprovalDeliveryKick = drain;
  return drain;
}

/**
 * Drain due mail during an ordinary request, at most once per 30 seconds.
 * App Runner throttles CPU between requests, so the background timer alone
 * does not send a denial once the hour is up. The scheduled job at
 * POST /api/jobs/approval-delivery is the real driver; this is the fallback.
 */
export function kickApprovalDelivery(): Promise<void> {
  if (!approvalDeliveryEnabled()) return Promise.resolve();
  if (state.yawpApprovalDeliveryKick) {
    return state.yawpApprovalDeliveryKick.then(() => undefined);
  }
  const now = Date.now();
  if (now - (state.yawpApprovalDeliveryKickAt ?? 0) < 30_000) {
    return Promise.resolve();
  }
  state.yawpApprovalDeliveryKickAt = now;
  return drainApprovalDelivery().then(() => undefined);
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
