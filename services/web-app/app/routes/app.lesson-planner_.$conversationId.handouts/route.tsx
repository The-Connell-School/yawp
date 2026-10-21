/**
 * Student handouts for any step (Brian's run 3, item 8). Every step is
 * listed; the ones students hold are in by default; a step written for the
 * teacher is rewritten for students before it prints. Each step can also be
 * downloaded on its own.
 */
import { useEffect, useState } from 'react';
import { Link, useFetcher, useLoaderData, useRevalidator, type LoaderFunctionArgs } from 'react-router';
import { ChevronLeft, Download, Loader2, Printer } from 'lucide-react';
import { loadStepHandouts } from '~/domain/lesson-planner/load-step-handouts.server';
import { TypeChip, WritingBadge } from '../app.lesson-planner_.$conversationId.packet/v3/run-of-show';
import { HEADING_FONT, STACK_FONTS_HREF, STACK_THEME } from '../app.lesson-planner_.$conversationId.packet/v3/theme';

export async function loader({ request, params }: LoaderFunctionArgs) {
  return loadStepHandouts({ request, conversationId: params.conversationId });
}

const STACK_API = '/api/domain/lesson-planner/stack';

export default function StepHandoutsRoute() {
  const { conversationId, title, steps } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const toggle = useFetcher();
  const writer = useFetcher<{ ok?: boolean; materialId?: string; error?: string }>();
  const [included, setIncluded] = useState(() => new Set(steps.filter((step) => step.included).map((step) => step.id)));
  const [writing, setWriting] = useState<string | null>(null);
  // A step whose student version did not come back is not retried in a loop.
  const [failed, setFailed] = useState<Set<string>>(() => new Set());

  // A teacher step that is in but not yet written for students gets written,
  // one at a time.
  const nextToWrite = steps.find(
    (step) => included.has(step.id) && !step.ready && step.needsVersion && !failed.has(step.id)
  );
  useEffect(() => {
    if (writer.state !== 'idle' || !nextToWrite || writing === nextToWrite.id) return;
    setWriting(nextToWrite.id);
    writer.submit(
      { intent: 'student-version', conversationId, materialId: nextToWrite.id },
      { method: 'post', action: STACK_API }
    );
  }, [nextToWrite, writer, writing, conversationId]);
  useEffect(() => {
    if (writer.state === 'idle' && writer.data) {
      if (writer.data.error && writing) setFailed((current) => new Set(current).add(writing));
      setWriting(null);
      revalidator.revalidate();
    }
    // Once per answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [writer.state, writer.data]);

  const chosen = steps.filter((step) => included.has(step.id) && step.ready).map((step) => step.id);
  const pdfHref = (ids: string[], inline = false) =>
    `/app/lesson-planner/${conversationId}/handouts.pdf?ids=${ids.join(',')}${inline ? '&inline=1' : ''}`;
  const waiting = steps.some((step) => included.has(step.id) && !step.ready && !failed.has(step.id));

  return (
    // The app shell is a fixed-height frame: the page owns its scrolling.
    <div data-testid="step-handouts" className="h-full w-full overflow-y-auto" style={STACK_THEME}>
      <link rel="stylesheet" href={STACK_FONTS_HREF} />
      <div className="mx-auto w-full max-w-3xl px-4 pb-20 pt-5 sm:px-6">
        <Link
          to={`/app/lesson-planner/${conversationId}/packet`}
          className="inline-flex items-center gap-1 rounded-full border border-[var(--sv-line)] bg-[var(--sv-card)] px-3 py-1.5 text-sm font-semibold"
        >
          <ChevronLeft size={15} /> Back to your lesson
        </Link>
        <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--sv-primary)]">Student handouts</p>
        <h1 className="text-3xl font-extrabold" style={HEADING_FONT}>
          {title}
        </h1>
        <p className="mt-1 text-sm text-[var(--sv-muted)]">
          Written for students, not for you: directions and questions, never your moves. Writing steps
          get lines sized to the task.
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          <a
            href={pdfHref(chosen, true)}
            target="_blank"
            rel="noreferrer"
            aria-disabled={waiting || !chosen.length}
            data-testid="handout-print"
            className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--sv-ink)] px-4 py-2.5 text-sm font-semibold text-white aria-disabled:pointer-events-none aria-disabled:opacity-50"
          >
            <Printer size={15} /> Print
          </a>
          <a
            href={pdfHref(chosen)}
            download
            aria-disabled={waiting || !chosen.length}
            data-testid="handout-pdf"
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--sv-line)] bg-[var(--sv-card)] px-4 py-2.5 text-sm font-semibold aria-disabled:pointer-events-none aria-disabled:opacity-50"
          >
            <Download size={15} /> PDF
          </a>
        </div>

        <h2 className="mt-8 text-lg font-bold" style={HEADING_FONT}>
          What goes in this handout
        </h2>
        <ul className="mt-2 flex flex-col gap-2">
          {steps.map((step) => {
            const isIn = included.has(step.id);
            return (
              <li
                key={step.id}
                data-testid="handout-step"
                className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--sv-line)] bg-[var(--sv-card)] px-4 py-3"
              >
                <label className="flex min-w-0 flex-1 items-center gap-3">
                  <input
                    type="checkbox"
                    checked={isIn}
                    onChange={() => {
                      const next = new Set(included);
                      if (isIn) next.delete(step.id);
                      else next.add(step.id);
                      setIncluded(next);
                      toggle.submit(
                        { intent: 'set-handout', conversationId, materialId: step.id, hasHandout: String(!isIn) },
                        { method: 'post', action: STACK_API }
                      );
                    }}
                    className="h-4 w-4 accent-[var(--sv-primary)]"
                  />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <TypeChip step={step} />
                      {step.isWriting ? <WritingBadge /> : null}
                    </span>
                    <span className="mt-1 block text-sm font-semibold">{step.title}</span>
                  </span>
                </label>
                <span className="text-xs text-[var(--sv-muted)]" data-testid="handout-step-status">
                  {writing === step.id ? (
                    <span className="inline-flex items-center gap-1">
                      <Loader2 size={12} className="animate-spin" /> Writing it for students…
                    </span>
                  ) : step.ready ? (
                    step.needsVersion ? 'Written for students' : 'Ready'
                  ) : isIn ? (
                    'Waiting to be written for students'
                  ) : (
                    'Not in this handout'
                  )}
                </span>
                {step.ready ? (
                  <a
                    href={pdfHref([step.id])}
                    download
                    data-testid="handout-step-alone"
                    className="text-xs font-semibold text-[var(--sv-primary)] underline underline-offset-2"
                  >
                    Download alone
                  </a>
                ) : null}
              </li>
            );
          })}
        </ul>
        {writer.data?.error ? <p className="mt-3 text-sm text-red-700">{writer.data.error}</p> : null}
      </div>
    </div>
  );
}
