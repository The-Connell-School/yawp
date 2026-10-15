import { useState } from 'react';
import { data, Link, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { Button } from '~/components/ui/button';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { requireFreeTierEnabled } from '~/utils/free-tier/free-tier-feature-gate.server';
import { enforceFreeTierTeacherGate } from '~/domain/free-tier/free-tier-gate.server';
import { getClassroomActivityReport } from '~/utils/classroom-report.server';
import { CLASSROOM_REPORT_METRICS, CLASSROOM_REPORT_RULES, CLASSROOM_REPORT_SCOPE, classroomReportSummary } from '~/utils/classroom-report';
import './report.css';

export function headers() {
  return { 'Cache-Control': 'private, no-store' };
}

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const membership = await requireMembership(request, userId);
  if (!membership.isActive || membership.role !== 'TEACHER' || membership.organization.plan !== 'FREE_CLASSROOM') {
    throw data({ error: 'This report is available to free classroom teachers.' }, { status: 403 });
  }
  await requireFreeTierEnabled();
  // Loaders can be requested independently of the app layout via single-fetch.
  // Repeat the existing approval gate here before touching aggregate data.
  await enforceFreeTierTeacherGate({ userId, pathname: '/app/classroom-report', organizationPlan: membership.organization.plan });
  const report = await getClassroomActivityReport({ membershipId: membership.id, organizationId: membership.organization.id });
  return data(report, { headers: { 'Cache-Control': 'private, no-store' } });
}

export default function ClassroomReportRoute() {
  const report = useLoaderData<typeof loader>();
  const summary = classroomReportSummary(report);
  const [copyFeedback, setCopyFeedback] = useState('');
  async function copySummary() {
    try {
      await navigator.clipboard.writeText(summary);
      setCopyFeedback('Summary copied.');
    } catch {
      setCopyFeedback('Could not copy. Select the plain-text summary below and copy it manually.');
    }
  }
  return (
    <section className="h-full w-full overflow-y-auto">
      <main id="classroom-report" data-testid="classroom-report" className="mx-auto w-full max-w-screen-lg space-y-6 p-4 pb-24 sm:p-6">
        <div data-report-controls>
          <Button variant="outline" size="sm" asChild><Link to="/app/my-classes">Back to My Classes</Link></Button>
        </div>
        <header className="space-y-3">
          <h1 className="text-2xl font-semibold">Classroom activity report</h1>
          <p><span className="font-medium">Scope: </span>{CLASSROOM_REPORT_SCOPE}</p>
          <p className="text-sm text-muted-foreground">Generated at: <time dateTime={report.generatedAt}>{report.generatedAt} (UTC)</time></p>
        </header>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {CLASSROOM_REPORT_METRICS.map(([key, label]) => (
            <div key={key} className="rounded-lg border bg-card p-4">
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd data-testid={key} className="mt-2 text-3xl font-semibold tabular-nums">{report[key]}</dd>
            </div>
          ))}
        </dl>
        {report.submittedWriting === 0 ? <p>No submitted writing in this scope yet.</p> : null}
        <section aria-labelledby="report-counting-rules" className="space-y-3">
          <h2 id="report-counting-rules" className="text-lg font-semibold">How counts work</h2>
          <ul className="list-disc space-y-2 pl-5 text-sm">
            {CLASSROOM_REPORT_RULES.map(rule => <li key={rule}>{rule}</li>)}
          </ul>
        </section>
        <section data-report-controls aria-labelledby="share-report" className="space-y-3 border-t pt-5">
          <h2 id="share-report" className="text-lg font-semibold">Share this report</h2>
          <p className="text-sm text-muted-foreground">Copy or print these aggregate counts. Recipients do not need a Yawp account. The summary contains no student names or writing.</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={copySummary}>Copy summary</Button>
            <Button variant="outline" onClick={() => window.print()}>Print report</Button>
          </div>
          <p role="status" aria-live="polite" className="text-sm">{copyFeedback}</p>
          <label htmlFor="report-summary" className="block text-sm font-medium">Plain-text summary</label>
          <textarea id="report-summary" readOnly value={summary} rows={8} className="w-full rounded-md border bg-background p-3 text-sm" />
        </section>
      </main>
    </section>
  );
}
