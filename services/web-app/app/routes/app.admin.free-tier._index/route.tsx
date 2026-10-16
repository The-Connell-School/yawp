import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  data as dataResponse,
  Link,
} from 'react-router';
import { requireSuperAdmin } from '~/utils/auth.server';
import { requireFreeTierEnabled } from '~/utils/free-tier/free-tier-feature-gate.server';

export async function loader({ request }: LoaderFunctionArgs) {
  await requireFreeTierEnabled();
  await requireSuperAdmin(request);
  return dataResponse({ moved: true });
}

export async function action({ request }: ActionFunctionArgs) {
  await requireFreeTierEnabled();
  await requireSuperAdmin(request);
  return dataResponse(
    {
      ok: false,
      error:
        'Free tier admin controls have moved to Yawp Internal. Use the signed internal Free Trial operator pages for this environment.',
    },
    { status: 410 },
  );
}

export default function AdminFreeTierRoute() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
      <div className="rounded-lg border bg-card p-5 shadow-sm">
        <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Moved to Yawp Internal
        </p>
        <h2 className="text-2xl font-semibold">Free tier controls are no longer operated here.</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          Token creation, waitlist release, review queue decisions, approvals, rejections, manual review,
          reopen, and CSV export now run from Yawp Internal through signed platform APIs with operator
          attribution and audit coverage.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          Public Free Trial signup and approval flows still run on this platform environment.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link to="/app/admin" className="yawp-entry-button yawp-entry-button-secondary text-sm">
            Back to admin
          </Link>
        </div>
      </div>
    </div>
  );
}
