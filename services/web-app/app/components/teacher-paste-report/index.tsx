import { useEffect, useState, type ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
import {
  measurePasteProvenance,
  getPasteEventRanges,
  type PasteMeasurement,
} from './provenance';
import { PasteHighlightOverlay } from './highlight-overlay';

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
            <TriangleAlert
              className="h-4 w-4 shrink-0 text-red-600"
              aria-hidden="true"
            />{' '}
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
          <h2 className="font-semibold">Pasted text</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Teacher-only paste history. Quotations and other permitted material
            also appear here; you decide their significance.
          </p>
          {measurement ? (
            <div className="my-3 rounded border bg-slate-50 p-2">
              <p
                className="font-semibold"
                data-testid="paste-report-percentage"
              >
                {measurement.characters === 0
                  ? 'No text to measure'
                  : measurement.pastedCharacters === 0
                    ? 'Copied percentage unknown'
                    : `At least ${measurement.percentage}% recorded as pasted`}
              </p>
              <p className="mt-1 text-xs">
                {measurement.pastedCharacters.toLocaleString()} of{' '}
                {measurement.characters.toLocaleString()} text characters still
                carry an external-paste mark in this{' '}
                {submissionId ? 'submission snapshot' : 'displayed draft'}.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                A lower bound from recorded external pastes of 200+ characters.
                Earlier, smaller and in-app pastes may be untracked.
              </p>
              <details className="mt-2 text-xs text-muted-foreground">
                <summary className="cursor-pointer underline">
                  How this is counted
                </summary>
                <p className="mt-1">
                  Only surviving pasted text counts. Typed replacements are
                  excluded. Whitespace counts; markup, images and paragraph
                  separators do not. This report does not determine authorship
                  or misconduct.
                </p>
              </details>
              {measurement.unlinkedCharacters > 0 ? (
                <p className="mt-1 text-xs">
                  {measurement.unlinkedCharacters} marked characters predate
                  event links.
                </p>
              ) : null}
            </div>
          ) : (
            <p className="my-3 text-xs">
              Open the document text to measure this version.
            </p>
          )}
          <div className="my-2 flex items-center justify-between gap-2">
            <h3 className="font-medium">Recorded events</h3>
            <button
              type="button"
              className="text-xs underline"
              disabled={loading}
              onClick={() => void load()}
            >
              Refresh
            </button>
          </div>
          {error ? (
            <p role="status" className="my-2 text-xs">
              The event list could not be loaded. Try Refresh.
            </p>
          ) : null}
          {loading ? (
            <p role="status" className="my-2 text-xs">
              Loading events…
            </p>
          ) : null}
          {report && report.events.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No events were recorded. This does not establish that no text was
              pasted.
            </p>
          ) : null}
          <ol className="space-y-2">
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
                    className={`w-full rounded border p-2 text-left text-xs disabled:cursor-default ${selectedId === event.id ? 'border-amber-600 bg-amber-50' : 'border-slate-200'}`}
                  >
                    <span className="block font-medium">
                      {new Date(event.createdAt).toLocaleString()}
                    </span>
                    <span className="mt-1 block">
                      {event.textLength.toLocaleString()} characters pasted
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
              className="mt-3 text-xs underline"
              disabled={loading}
              onClick={() => void load(report.nextCursor!)}
            >
              Load earlier events
            </button>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
