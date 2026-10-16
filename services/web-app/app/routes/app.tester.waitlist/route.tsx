import {
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  useLoaderData,
  useFetcher,
  Link,
} from 'react-router';
import { requireMockAdmin } from '~/utils/mock-admin.server';
import { prisma } from '~/utils/db.server';
import { releaseBatch } from '~/domain/free-tier/service.server';
import { sendReleaseEmailsForApplicationIds } from '~/domain/free-tier/approval-flow.server';
import { FreeTierBudgetExceededError } from '~/domain/free-tier/usage-budget.server';
import { recordFreeTierCapDenialAudit } from '~/domain/free-tier/tester-audit.server';

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
  await requireMockAdmin(request);
  const applications = await prisma.freeTierApplication.findMany({
    where: { status: 'LEAD' },
    orderBy: { createdAt: 'asc' },
    take: 100,
    select: { id: true, name: true, email: true, status: true },
  });
  return { applications };
}

export async function action({ request }: ActionFunctionArgs) {
  const actor = await requireMockAdmin(request);
  const form = await request.formData();
  const id = String(form.get('applicationId') ?? '').trim();
  if (form.get('intent') !== 'release' || !id || id.length > 200)
    return new Response('Invalid input', { status: 400 });
  let result: Awaited<ReturnType<typeof releaseBatch>>;
  try {
    result = await releaseBatch(
      { applicationIds: [id] },
      { ...actor, action: 'waitlist.release' }
    );
  } catch (error) {
    if (error instanceof FreeTierBudgetExceededError) {
      await recordFreeTierCapDenialAudit(
        prisma,
        { ...actor, action: 'waitlist.release.denied' },
        id,
        { reason: 'budget_exceeded', budget: error.summary }
      );
      return Response.json(budgetExceededPayload(error), { status: 402 });
    }
    throw error;
  }
  const invited =
    result.released > 0
      ? await prisma.freeTierApplication.findMany({
          where: { id, status: 'INVITED' },
          select: { id: true },
        })
      : [];
  const emails = await sendReleaseEmailsForApplicationIds(
    invited.map((app) => app.id)
  );
  return {
    ...result,
    emailFailureCount: emails.filter((email) => !email.ok).length,
  };
}

export default function TesterWaitlist() {
  const { applications } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const operatorMessage = getOperatorMessage(fetcher.data);
  return (
    <main className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Tester waitlist</h1>
      <Link to="/app/tester/approvals">Approval queue</Link>
      {fetcher.data && (
        <p role="status">
          {operatorMessage
            ? operatorMessage
            : `Released ${fetcher.data.released}. Refused ${fetcher.data.refused}. Skipped ${fetcher.data.skipped}. Email failures: ${fetcher.data.emailFailureCount}.`}
        </p>
      )}
      {applications.length === 0 && <p>No pending applications.</p>}
      {applications.map((app) => (
        <fetcher.Form
          key={app.id}
          method="post"
          className="border rounded p-3 flex gap-3 items-center"
        >
          <span>
            {app.name} — {app.email}
          </span>
          <input type="hidden" name="applicationId" value={app.id} />
          <button
            name="intent"
            value="release"
            disabled={fetcher.state !== 'idle'}
            className="yawp-entry-button yawp-entry-button-primary"
          >
            Approve access
          </button>
        </fetcher.Form>
      ))}
    </main>
  );
}
