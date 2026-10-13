import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  data as dataResponse,
  useFetcher,
  useLoaderData,
} from 'react-router';
import { Form } from 'react-router';
import { requireSuperAdmin } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import {
  createAcquisitionTokens,
  getFreeTierReleaseCap,
  releaseBatch,
} from '~/domain/free-tier/service.server';
import { sendReleaseEmailsForApplicationIds } from '~/domain/free-tier/approval-flow.server';
import { decideApplication } from '~/utils/internal-free-tier-http.server';
import { requireFreeTierEnabled } from '~/utils/free-tier/free-tier-feature-gate.server';
import { FreeTierBudgetExceededError } from '~/domain/free-tier/usage-budget.server';

function budgetExceededPayload(error: FreeTierBudgetExceededError) {
  const usage = error.summary;
  return {
    ok: false,
    error: 'Free-tier budget reached',
    operatorMessage: `Free-tier ${usage.environment} budget reached: $${usage.spendUsd.toFixed(2)} of $${usage.budgetUsd.toFixed(2)} used.`,
    usage,
  };
}

function getOperatorMessage(value: unknown) {
  return value && typeof value === 'object' && 'operatorMessage' in value
    ? String((value as { operatorMessage: unknown }).operatorMessage)
    : null;
}

export async function loader({ request }: LoaderFunctionArgs) {
  await requireFreeTierEnabled();
  await requireSuperAdmin(request);
  const url = new URL(request.url);
  const view = url.searchParams.get('view') ?? 'waitlist';
  const cap = getFreeTierReleaseCap();
  if (view === 'queue') {
    const apps = await prisma.freeTierApplication.findMany({
      where: { status: { in: ['ADMIN_SUBMITTED', 'MANUAL_REVIEW', 'SENT'] } },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      include: {
        approvalDecisions: { orderBy: { createdAt: 'desc' }, take: 5 },
        adminApprovals: { orderBy: { createdAt: 'desc' }, take: 5 },
        emailLogs: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });
    return dataResponse({ view, cap, queue: apps });
  }
  const waitlist = await prisma.freeTierApplication.findMany({
    where: { status: 'LEAD' },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });
  return dataResponse({ view, cap, waitlist });
}

export async function action({ request }: ActionFunctionArgs) {
  await requireFreeTierEnabled();
  const user = await requireSuperAdmin(request);
  const operator = await prisma.user.findUnique({ where: { id: user.id }, select: { email: true } });
  const formData = await request.formData();
  const intent = String(formData.get('intent'));
  if (intent === 'release') {
    const ids = formData.getAll('applicationId').map(String);
    let result: Awaited<ReturnType<typeof releaseBatch>>;
    try {
      result = await releaseBatch({ applicationIds: ids });
    } catch (error) {
      if (error instanceof FreeTierBudgetExceededError) {
        return Response.json(budgetExceededPayload(error), { status: 402 });
      }
      throw error;
    }
    const invited = await prisma.freeTierApplication.findMany({
      where: { id: { in: ids }, status: 'INVITED' },
      select: { id: true },
    });
    const emailResults = await sendReleaseEmailsForApplicationIds(invited.map((i) => i.id));
    const emailFailures = emailResults.filter((r) => !r.ok);
    return {
      ok: true,
      result,
      emailFailures,
      releasedCount: invited.length,
      emailFailureCount: emailFailures.length,
    };
  }
  if (intent === 'token') {
    const tokens = await createAcquisitionTokens({
      label: String(formData.get('label') ?? 'manual'),
      bypassWaitlist: formData.get('bypass') === 'on',
      count: 1,
      createdBy: operator?.email ?? undefined,
    });
    return { ok: true, tokens };
  }
  const id = String(formData.get('applicationId') ?? '');
  const decidedByEmail = operator?.email ?? 'admin@yawp.local';
  if (intent === 'approve') {
    const result = await decideApplication({
      id,
      decision: 'APPROVED',
      decidedByEmail,
    });
    return Response.json(result.payload, { status: result.status });
  }
  if (intent === 'reject') {
    const reason = String(formData.get('reason') ?? 'Rejected');
    const result = await decideApplication({
      id,
      decision: 'REJECTED',
      decidedByEmail,
      reason,
    });
    return Response.json(result.payload, { status: result.status });
  }
  return { ok: false };
}

export default function AdminFreeTierRoute() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const releaseFetcher = useFetcher<typeof action>();
  const releaseOperatorMessage = getOperatorMessage(releaseFetcher.data);
  const actionOperatorMessage = getOperatorMessage(fetcher.data);
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap gap-3 items-center">
        <a
          href="?view=waitlist"
          className={`yawp-entry-button yawp-entry-button-secondary text-sm ${data.view === 'waitlist' ? 'ring-2 ring-primary' : ''}`}
        >
          Waitlist
        </a>
        <a
          href="?view=queue"
          className={`yawp-entry-button yawp-entry-button-secondary text-sm ${data.view === 'queue' ? 'ring-2 ring-primary' : ''}`}
        >
          Review queue
        </a>
        <span className="text-muted-foreground text-sm">Release cap: {data.cap}</span>
      </div>
      {releaseFetcher.data && 'emailFailureCount' in (releaseFetcher.data as object) ? (
        <p className="text-sm rounded-md border p-3 bg-muted" role="status">
          Released {(releaseFetcher.data as { releasedCount: number }).releasedCount} application(s).
          {(releaseFetcher.data as { emailFailureCount: number }).emailFailureCount > 0
            ? ` ${(releaseFetcher.data as { emailFailureCount: number }).emailFailureCount} release email(s) failed — check email logs and retry from support tools.`
            : ' Release emails sent.'}
        </p>
      ) : null}
      {releaseOperatorMessage ? (
        <p className="text-sm rounded-md border border-destructive/40 bg-destructive/10 p-3" role="alert">
          {releaseOperatorMessage}
        </p>
      ) : null}
      {actionOperatorMessage ? (
        <p className="text-sm rounded-md border border-destructive/40 bg-destructive/10 p-3" role="alert">
          {actionOperatorMessage}
        </p>
      ) : null}
      {data.view === 'waitlist' && 'waitlist' in data ? (
        <releaseFetcher.Form method="post">
          <input type="hidden" name="intent" value="release" />
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                <th />
                <th>Name</th>
                <th>Email</th>
                <th>School</th>
              </tr>
            </thead>
            <tbody>
              {data.waitlist.map((row: (typeof data.waitlist)[number]) => (
                <tr key={row.id} className="border-t">
                  <td><input type="checkbox" name="applicationId" value={row.id} /></td>
                  <td>{row.name}</td>
                  <td>{row.email}</td>
                  <td>{row.schoolName}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="submit" className="mt-3 yawp-entry-button yawp-entry-button-primary">
            Release selected
          </button>
        </releaseFetcher.Form>
      ) : 'queue' in data ? (
        <div className="space-y-4">
          {data.queue.map((app: (typeof data.queue)[number]) => (
            <div key={app.id} className="border rounded-lg p-4 text-sm space-y-3 bg-card">
              <div className="font-medium">{app.name} — {app.schoolName} ({app.status})</div>
              <div className="flex gap-2 flex-wrap items-end">
                <fetcher.Form method="post">
                  <input type="hidden" name="intent" value="approve" />
                  <input type="hidden" name="applicationId" value={app.id} />
                  <button type="submit" className="yawp-entry-button yawp-entry-button-primary text-sm">
                    Approve
                  </button>
                </fetcher.Form>
                <fetcher.Form method="post" className="flex gap-2 flex-wrap items-end">
                  <input type="hidden" name="intent" value="reject" />
                  <input type="hidden" name="applicationId" value={app.id} />
                  <input
                    name="reason"
                    placeholder="Reason"
                    required
                    className="rounded-md border px-3 py-2 text-sm min-w-[12rem]"
                  />
                  <button type="submit" className="yawp-entry-button yawp-entry-button-secondary text-sm">
                    Reject
                  </button>
                </fetcher.Form>
              </div>
              <pre className="text-xs overflow-auto rounded-md border bg-muted p-2 max-h-48">
                {JSON.stringify({ decisions: app.approvalDecisions, admins: app.adminApprovals, emails: app.emailLogs }, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      ) : null}
      <Form method="post" className="flex gap-2 items-end border-t pt-4">
        <input type="hidden" name="intent" value="token" />
        <label className="text-sm">
          Token label
          <input name="label" className="block border rounded px-2 py-1" />
        </label>
        <label className="text-sm flex gap-1 items-center">
          <input type="checkbox" name="bypass" /> Bypass waitlist
        </label>
        <button type="submit" className="yawp-entry-button yawp-entry-button-secondary text-sm">Create token</button>
      </Form>
      {fetcher.data && 'tokens' in (fetcher.data as object) ? (
        <p className="text-sm text-green-700">Token (shown once): {(fetcher.data as { tokens: { token: string }[] }).tokens[0]?.token}</p>
      ) : null}
    </div>
  );
}
