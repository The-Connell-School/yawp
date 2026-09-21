import { useEffect, useState, type ReactNode } from 'react';
import { CircleCheck, TriangleAlert } from 'lucide-react';
import {
  measurePasteProvenance,
  getPasteEventRanges,
  type PasteMeasurement,
} from './provenance';
import { PasteHighlightOverlay } from './highlight-overlay';
import { cn } from '~/utils/misc';

type PasteEvent = { id: string; createdAt: string; textLength: number };
type Report = { events: PasteEvent[]; nextCursor: string | null };
type Props = {
  documentId?: string;
  submissionId?: string;
  contentRoot: HTMLElement | null;
  children: ReactNode;
  onSelectEvent?: () => void;
};

/** An additive teacher-only side panel. Existing comments stay mounted so an
 * in-progress reply is preserved while switching views. Authorization is checked
 * by the endpoint independently from the parent route's ordinary read scope.
 */
export function TeacherPasteReport({
  enabled,
  ...props
}: Props & { enabled: boolean }) {
  return enabled ? (
    <AuthorizedTeacherPasteReport {...props} />
  ) : (
    <>{props.children}</>
  );
}

function AuthorizedTeacherPasteReport({
  documentId,
  submissionId,
  contentRoot,
  children,
  onSelectEvent,
}: Props) {
  const [report, setReport] = useState<Report | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [measurement, setMeasurement] = useState<PasteMeasurement | null>(null);
  const hasPastedText = (measurement?.pastedCharacters ?? 0) > 0;
  const query = submissionId
    ? `submissionId=${encodeURIComponent(submissionId)}`
    : `documentId=${encodeURIComponent(documentId ?? '')}`;

  useEffect(() => {
    const controller = new AbortController();
    setReport(null);
    setOpen(false);
    setError(false);
    setForbidden(false);
    setSelectedId(null);
    setLoading(true);
    fetch(`/api/teacher-paste-report?${query}`, { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 404) {
          setForbidden(true);
          return;
        }
        if (!response.ok) throw new Error('report unavailable');
        const data = (await response.json()) as Report;
        if (!controller.signal.aborted) setReport(data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query]);

  useEffect(() => {
    if (!contentRoot) {
      setMeasurement(null);
      return;
    }
    const update = () => setMeasurement(measurePasteProvenance(contentRoot));
    update();
    const observer = new MutationObserver(update);
    observer.observe(contentRoot, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    return () => observer.disconnect();
  }, [contentRoot]);

  async function load(cursor?: string) {
    setLoading(true);
    setError(false);
    try {
      const response = await fetch(
        `/api/teacher-paste-report?${query}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
      );
      if (!response.ok) throw new Error('report unavailable');
      const data = (await response.json()) as Report;
      setReport((previous) =>
        cursor && previous
          ? {
              ...data,
              events: [
                ...previous.events,
                ...data.events.filter(
                  (event) =>
                    !previous.events.some(
                      (existing) => existing.id === event.id
                    )
                ),
              ],
            }
          : data
      );
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  function select(id: string) {
    setSelectedId(id);
    if (!contentRoot) return;
    onSelectEvent?.();
    requestAnimationFrame(() => {
      const node = getPasteEventRanges(contentRoot, id)[0]?.startContainer;
      node?.parentElement?.scrollIntoView({
        block: 'center',
        behavior: 'smooth',
      });
    });
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <PasteHighlightOverlay
        contentRoot={contentRoot}
        eventId={open && !forbidden ? selectedId : null}
      />
      {!forbidden ? (
        <div
          className="flex shrink-0 border-b bg-white"
          aria-label="Teacher document panels"
        >
          <button
            type="button"
            aria-pressed={!open}
            className={`flex-1 px-2 py-3 text-xs font-semibold ${!open ? 'border-b-2 border-blue-600' : 'text-muted-foreground'}`}
            onClick={() => {
              setOpen(false);
              setSelectedId(null);
            }}
          >
            Comments
          </button>
          <button
            type="button"
            aria-label="Pasted text report"
            aria-pressed={open}
            className={`flex flex-1 items-center justify-center gap-1.5 px-2 py-3 text-xs font-semibold ${open ? 'border-b-2 border-blue-600' : 'text-muted-foreground'}`}
            onClick={() => setOpen(true)}
          >
            {hasPastedText ? (
              <TriangleAlert
                className="h-4 w-4 shrink-0 text-red-600"
                data-testid="paste-report-warning-icon"
                aria-hidden="true"
              />
            ) : (
              <CircleCheck
                className="h-4 w-4 shrink-0 text-muted-foreground"
                data-testid="paste-report-empty-icon"
                aria-hidden="true"
              />
            )}{' '}
            Pasted text
          </button>
        </div>
      ) : null}
      <div className="min-h-0 flex-1" hidden={open && !forbidden}>
        {children}
      </div>
      {open && !forbidden ? (
        <section
          className="min-h-0 flex-1 overflow-y-auto p-3 text-sm"
          data-testid="paste-report"
          aria-label="Pasted text report"
        >
          {measurement && measurement.pastedCharacters === 0 ? (
            <div
              className="flex min-h-40 flex-col items-center justify-center rounded-md border border-dashed bg-muted/20 p-6 text-center"
              data-testid="paste-report-empty"
            >
              <CircleCheck
                className="h-8 w-8 text-muted-foreground"
                aria-hidden="true"
              />
              <p className="mt-3 text-sm font-medium">No pasted text found</p>
              <p className="mt-1 max-w-64 text-sm text-muted-foreground">
                Nothing to report for this {submissionId ? 'snapshot' : 'draft'}.
              </p>
            </div>
          ) : measurement ? (
            <div className="@container rounded-md border bg-muted/25 p-3">
              <div className="grid grid-cols-1 divide-y divide-border/70 @sm:grid-cols-3 @sm:divide-x @sm:divide-y-0">
                <div className="pb-3 @sm:pb-0 @sm:pr-3">
                  <p className="text-sm font-medium text-muted-foreground">
                    Recorded pasted
                  </p>
                  <p
                    className="mt-1 text-xl font-semibold tabular-nums"
                    data-testid="paste-report-percentage"
                  >
                    {measurement.characters === 0
                      ? 'No text to measure'
                      : measurement.pastedCharacters === 0
                        ? 'Copied percentage unknown'
                        : `At least ${measurement.percentage}%`}
                  </p>
                </div>
                <div className="py-3 @sm:px-3 @sm:py-0">
                  <p className="text-sm font-medium text-muted-foreground">
                    Marked text
                  </p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">
                    {measurement.pastedCharacters.toLocaleString()} /{' '}
                    {measurement.characters.toLocaleString()}
                  </p>
                </div>
                <div className="pt-3 @sm:pl-3 @sm:pt-0">
                  <p className="text-sm font-medium text-muted-foreground">
                    Events
                  </p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">
                    {report?.events.length ?? 0}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                Lower-bound signal from external pastes of 200+ characters in
                this {submissionId ? 'snapshot' : 'draft'}; permitted quoted
                material can appear here too.
              </p>
              <details className="mt-2 text-sm text-muted-foreground">
                <summary className="cursor-pointer font-medium text-foreground">
                  How this is counted
                </summary>
                <p className="mt-1">
                  Only surviving marked text counts. Typed replacements are
                  excluded. Whitespace counts; markup, images, and paragraph
                  separators do not. This report does not determine authorship
                  or misconduct.
                </p>
              </details>
              {measurement.unlinkedCharacters > 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  {measurement.unlinkedCharacters} marked characters predate
                  event links.
                </p>
              ) : null}
            </div>
          ) : (
            <p className="my-3 text-sm">
              Open the document text to measure this version.
            </p>
          )}
          {hasPastedText ? (
            <>
              <div className="mb-2 mt-4 flex items-center justify-between gap-2">
                <h3 className="font-medium">Recorded events</h3>
                <button
                  type="button"
                  className="text-sm text-muted-foreground underline hover:text-foreground"
                  disabled={loading}
                  onClick={() => void load()}
                >
                  Refresh
                </button>
              </div>
              {error ? (
                <p role="status" className="my-2 text-sm">
                  The event list could not be loaded. Try Refresh.
                </p>
              ) : null}
              {loading ? (
                <p role="status" className="my-2 text-sm">
                  Loading events…
                </p>
              ) : null}
              <ol className="space-y-2" role="list">
                {report?.events.map((event) => {
                  const surviving = measurement?.byEvent[event.id] ?? 0;
                  const linked = event.id.startsWith('paste_');
                  return (
                    <li key={event.id}>
                      <button
                        type="button"
                        data-testid={`paste-event-${event.id}`}
                        aria-pressed={selectedId === event.id}
                        disabled={!surviving}
                        onClick={() => select(event.id)}
                        className={cn(
                          'w-full rounded-md border p-3 text-left text-sm transition disabled:cursor-default',
                          selectedId === event.id
                            ? 'border-amber-500 bg-amber-50'
                            : 'border-border bg-background hover:bg-muted/40',
                          !surviving && 'opacity-80'
                        )}
                      >
                        <span className="flex items-start justify-between gap-3">
                          <span className="font-medium">
                            {new Date(event.createdAt).toLocaleString()}
                          </span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">
                            {event.textLength.toLocaleString()} chars
                          </span>
                        </span>
                        <span className="mt-1 block text-muted-foreground">
                          {surviving
                            ? `${surviving.toLocaleString()} characters remain — show in document`
                            : !measurement
                              ? 'Open the document text to locate this event'
                              : linked
                                ? 'No linked text remains in this version (removed or tracking unavailable)'
                                : 'Earlier event; position unavailable'}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
              {report?.nextCursor ? (
                <button
                  type="button"
                  className="mt-3 text-sm underline"
                  disabled={loading}
                  onClick={() => void load(report.nextCursor!)}
                >
                  Load earlier events
                </button>
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
