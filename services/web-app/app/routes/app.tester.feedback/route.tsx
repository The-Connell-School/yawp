import {
  Form,
  redirect,
  Link,
  useLoaderData,
  useLocation,
  type LoaderFunctionArgs,
} from 'react-router';
import { requireAdmin } from '~/utils/auth.server';
import {
  readTesterFeedback,
  type FeedbackEntry,
} from '~/utils/tester-feedback.server';
import { testerFeedbackDependencies } from '~/utils/tester-feedback-runtime.server';
import { Button } from '~/components/ui/button';

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);
  const url = new URL(request.url);
  if (url.searchParams.get('format') === 'csv')
    return redirect('/api/admin/tester-feedback' + url.search);
  const response = await readTesterFeedback(
    request,
    testerFeedbackDependencies,
    'admin'
  );
  if (!response.ok) throw response;
  return response;
}

type FeedbackPage = {
  entries: (Omit<FeedbackEntry, 'createdAt'> & { createdAt: string })[];
  nextCursor: string | null;
};
export default function TesterFeedbackPage() {
  const { entries, nextCursor } = useLoaderData<FeedbackPage>();
  const location = useLocation();
  const filters = new URLSearchParams(location.search);
  const csv = new URLSearchParams(filters);
  csv.delete('cursor');
  csv.set('format', 'csv');
  const next = new URLSearchParams(filters);
  if (nextCursor) next.set('cursor', nextCursor);
  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Tester feedback</h1>
        <Button asChild variant="outline">
          <a href={`/api/admin/tester-feedback?${csv}`} download>
            Download CSV
          </a>
        </Button>
      </div>
      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        Tester feedback review has moved to Yawp Internal. This platform page is
        kept temporarily for old links.
      </div>
      <Form method="get" className="flex flex-wrap items-end gap-3">
        {(['environment', 'userId', 'since', 'until'] as const).map((name) => (
          <label key={name} className="grid gap-1 text-sm">
            {
              {
                environment: 'Environment',
                userId: 'User ID',
                since: 'Since (ISO timestamp)',
                until: 'Until (ISO timestamp)',
              }[name]
            }
            <input
              name={name}
              defaultValue={filters.get(name) ?? ''}
              placeholder={
                name === 'since' || name === 'until'
                  ? '2026-10-12T00:00:00Z'
                  : undefined
              }
              className="min-h-11 rounded-md border bg-background px-3"
            />
          </label>
        ))}
        <label className="grid gap-1 text-sm">
          Severity
          <select
            name="severity"
            defaultValue={filters.get('severity') ?? ''}
            className="min-h-11 rounded-md border bg-background px-3"
          >
            <option value="">All</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>
        <Button type="submit">Filter</Button>
        <Link to="/app/tester/feedback" className="underline">
          Reset
        </Link>
      </Form>
      <p className="text-sm text-muted-foreground">
        Newest first. CSV includes all matching entries, up to 10,000; narrow
        filters for larger exports.
      </p>
      {entries.length === 0 ? (
        <p>No feedback found.</p>
      ) : (
        entries.map((entry) => (
          <article key={entry.id} className="space-y-3 rounded-lg border p-4">
            <div className="break-words text-sm text-muted-foreground">
              {entry.createdAt} · {entry.environment} ·{' '}
              {entry.severity ?? 'No severity'} · User {entry.userId}
            </div>
            <p className="break-all text-sm">{entry.url}</p>
            <dl className="grid gap-3 md:grid-cols-3">
              {(['whatIDid', 'whatHappened', 'whatIWish'] as const).map(
                (field) => (
                  <div key={field}>
                    <dt className="font-medium">
                      {
                        {
                          whatIDid: 'What I did',
                          whatHappened: 'What happened',
                          whatIWish: 'What I wish it did',
                        }[field]
                      }
                    </dt>
                    <dd className="whitespace-pre-wrap break-words">
                      {entry[field]}
                    </dd>
                  </div>
                )
              )}
            </dl>
          </article>
        ))
      )}
      {nextCursor ? (
        <Link to={`?${next}`} className="inline-block underline">
          Next page
        </Link>
      ) : null}
    </main>
  );
}
