import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  data as dataResponse,
  isRouteErrorResponse,
  Link,
  useRouteError,
} from 'react-router';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { requireSuperAdmin } from '~/utils/auth.server';
import { requireFreeTierEnabled } from '~/utils/free-tier/free-tier-feature-gate.server';

export function isSuperAdminRequiredRouteError(
  error: unknown
): error is { status: 403; data: { requiredRole: 'isSuperAdmin' } } {
  return (
    isRouteErrorResponse(error) &&
    error.status === 403 &&
    typeof error.data === 'object' &&
    error.data !== null &&
    (error.data as { requiredRole?: string }).requiredRole === 'isSuperAdmin'
  );
}

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

export function ErrorBoundary() {
  const error = useRouteError();
  if (isSuperAdminRequiredRouteError(error)) {
    return (
      <div
        className="mx-auto flex max-w-screen-sm flex-col gap-4 p-20"
        data-testid="admin-free-tier-super-admin-required"
      >
        <h2 className="text-2xl font-semibold">You need super admin access</h2>
        <p className="text-lg text-muted-foreground">
          Free tier waitlist release and approval operations are limited to Yawp! super admins. Ask a
          super admin on the team if you need access.
        </p>
        <Link to="/app/admin" className="yawp-entry-button yawp-entry-button-secondary text-sm w-fit">
          Back to admin
        </Link>
      </div>
    );
  }
  return <GeneralErrorBoundary />;
}