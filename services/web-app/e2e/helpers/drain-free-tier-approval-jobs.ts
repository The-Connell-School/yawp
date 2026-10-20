import { runApprovalJobs } from '~/domain/free-tier/approval-v2.server';

/** E2E dev disables the background worker; drain queued v2 deliveries inline. */
export async function drainFreeTierApprovalJobs() {
  await runApprovalJobs(new Date());
}
