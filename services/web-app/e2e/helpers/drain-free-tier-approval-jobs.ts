const DEFAULT_E2E_ORIGIN = 'http://127.0.0.1:5173';

/** E2E dev disables the background worker; drain queued v2 deliveries via the app server. */
export async function drainFreeTierApprovalJobs(
  baseURL = DEFAULT_E2E_ORIGIN
) {
  const response = await fetch(
    new URL('/api/e2e/free-tier/drain-approval-jobs', baseURL),
    { method: 'POST' }
  );
  if (response.status !== 204) {
    throw new Error(
      `Failed to drain free-tier approval jobs (${response.status})`
    );
  }
}
