import type { ActionFunctionArgs } from 'react-router';
import { runApprovalJobs } from '~/domain/free-tier/approval-v2.server';

/** E2E-only: inline drain when the background approval worker is disabled. */
function e2eDrainAllowed() {
  return (
    process.env.E2E === 'true' &&
    process.env.YAWP_ENVIRONMENT !== 'production' &&
    process.env.YAWP_ENVIRONMENT !== 'demo'
  );
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST' || !e2eDrainAllowed()) {
    throw new Response(null, { status: 404 });
  }
  await runApprovalJobs(new Date());
  return new Response(null, { status: 204 });
}

export async function loader() {
  throw new Response(null, { status: 404 });
}
