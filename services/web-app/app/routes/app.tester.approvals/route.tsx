import {
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  data,
  useLoaderData,
  useFetcher,
  Link,
} from 'react-router';
import { requireMockAdmin } from '~/utils/mock-admin.server';
import { prisma } from '~/utils/db.server';
import {
  decideApplication,
  reopenApplication,
} from '~/utils/internal-free-tier-http.server';

export async function loader({ request }: LoaderFunctionArgs) {
  await requireMockAdmin(request);
  const applications = await prisma.freeTierApplication.findMany({
    where: {
      status: { in: ['ADMIN_SUBMITTED', 'MANUAL_REVIEW', 'SENT', 'REJECTED'] },
    },
    orderBy: { updatedAt: 'desc' },
    take: 100,
    select: { id: true, name: true, email: true, status: true },
  });
  return { applications };
}

export async function action({ request }: ActionFunctionArgs) {
  const actor = await requireMockAdmin(request);
  const form = await request.formData();
  const id = String(form.get('applicationId') ?? '').trim();
  const intent = form.get('intent');
  const reason = String(form.get('reason') ?? '').trim();
  if (
    !id ||
    id.length > 200 ||
    !['approve', 'reject', 'reopen'].includes(String(intent)) ||
    (intent === 'reject' && (!reason || reason.length > 1000))
  )
    return new Response('Invalid input', { status: 400 });
  const audit = { ...actor, action: `approval.${intent}` };
  const result =
    intent === 'reopen'
      ? await reopenApplication({ id, decidedByEmail: actor.actorEmail, audit })
      : await decideApplication({
          id,
          decision: intent === 'approve' ? 'APPROVED' : 'REJECTED',
          decidedByEmail: actor.actorEmail,
          reason,
          audit,
        });
  return data(result.payload, { status: result.status });
}

export default function TesterApprovals() {
  const { applications } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  return (
    <main className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Tester approvals</h1>
      <Link to="/app/tester/waitlist">Waitlist</Link>
      {fetcher.data && (
        <p role="status">
          {String(
            fetcher.data.error ??
              (fetcher.data.idempotent
                ? 'Already completed.'
                : 'Decision saved.')
          )}
        </p>
      )}
      {applications.length === 0 && <p>No pending applications.</p>}
      {applications.map((app) => (
        <fetcher.Form
          key={app.id}
          method="post"
          className="border rounded p-3 space-y-3"
        >
          <p>
            {app.name} — {app.email} ({app.status})
          </p>
          <input type="hidden" name="applicationId" value={app.id} />
          {app.status === 'REJECTED' ? (
            <button
              name="intent"
              value="reopen"
              disabled={fetcher.state !== 'idle'}
              className="yawp-entry-button yawp-entry-button-secondary"
            >
              Reopen
            </button>
          ) : (
            <div className="flex gap-3">
              <button
                name="intent"
                value="approve"
                disabled={fetcher.state !== 'idle'}
                className="yawp-entry-button yawp-entry-button-primary"
              >
                Approve
              </button>
              <input
                name="reason"
                placeholder="Rejection reason"
                aria-label="Rejection reason"
                maxLength={1000}
                className="border rounded px-2"
              />
              <button
                name="intent"
                value="reject"
                disabled={fetcher.state !== 'idle'}
                className="yawp-entry-button yawp-entry-button-secondary"
              >
                Reject
              </button>
            </div>
          )}
        </fetcher.Form>
      ))}
    </main>
  );
}
