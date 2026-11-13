import { useFetcher } from 'react-router';
import { Loader2, Sparkles } from 'lucide-react';
import {
  EXIT_TICKET_RETEACH_LABELS,
  EXIT_TICKET_SUMMARY_MIN_RESPONSES,
  type ExitTicketSummaryPanelData,
} from '~/domain/assignment-types/exit-ticket-class-summary';

export const EXIT_TICKET_SUMMARY_ACTION = '/api/domain/exit-ticket-summary';

const RETEACH_TONE: Record<string, string> = {
  none: 'border-emerald-600/30 bg-emerald-600/10 text-emerald-800 dark:text-emerald-300',
  'quick-review':
    'border-amber-600/30 bg-amber-500/10 text-amber-800 dark:text-amber-300',
  reteach: 'border-rose-600/30 bg-rose-600/10 text-rose-800 dark:text-rose-300',
};

/**
 * The model-written half of the Class read (flag `exit-ticket-class-summary`):
 * what the class understood, where the confusion is, whether to reteach, and
 * a short opening block for tomorrow. Generated only when the teacher asks,
 * and offered again only once new responses have arrived. Every response is
 * still in the list on the page; this never replaces reading them.
 */
export function ExitTicketSummarySection({
  classAssignmentId,
  data,
}: {
  classAssignmentId: string;
  data: ExitTicketSummaryPanelData;
}) {
  const fetcher = useFetcher<{ success: boolean; message?: string }>();
  const busy = fetcher.state !== 'idle';
  const error =
    fetcher.state === 'idle' && fetcher.data && !fetcher.data.success
      ? fetcher.data.message || 'The summary could not be written.'
      : null;
  const stored = data.stored;
  const actionLabel = stored ? 'Update summary' : 'Summarize responses';
  const showAction = !stored || !stored.current;

  return (
    <div
      data-testid="exit-ticket-summary"
      className="space-y-3 rounded-md border bg-background p-3"
    >
      <div className="flex items-center gap-2">
        <Sparkles size={14} className="shrink-0 text-primary" />
        <p className="text-sm font-medium">Summary</p>
        {stored ? (
          <span
            className={`ml-auto rounded-full border px-2 py-0.5 text-xs font-medium ${RETEACH_TONE[stored.summary.reteach] ?? ''}`}
          >
            {EXIT_TICKET_RETEACH_LABELS[stored.summary.reteach]}
          </span>
        ) : null}
      </div>

      {stored ? (
        <div className="space-y-3 text-sm">
          <p>{stored.summary.understood}</p>
          {stored.summary.confusions.length > 0 ? (
            <div className="space-y-1">
              <p className="font-medium">Where they’re confused</p>
              <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
                {stored.summary.confusions.map((confusion) => (
                  <li key={confusion.point}>
                    {confusion.point}{' '}
                    <span className="text-xs">({confusion.share})</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="text-muted-foreground">
            {stored.summary.reteachReason}
          </p>
          {stored.summary.nextLessonMove ? (
            <div className="rounded-md bg-muted p-2.5">
              <p className="font-medium">
                Tomorrow: {stored.summary.nextLessonMove.title}{' '}
                <span className="font-normal text-muted-foreground">
                  ({stored.summary.nextLessonMove.minutes} min)
                </span>
              </p>
              <p className="mt-0.5 text-muted-foreground">
                {stored.summary.nextLessonMove.detail}
              </p>
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">
            From {stored.responseCount} responses.
            {stored.current ? '' : ' New responses have come in since.'} Every
            response is still in the list below.
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {data.canGenerate
            ? 'Read every response at once: what the class understood, where the confusion is, and whether to reteach.'
            : `A summary needs at least ${EXIT_TICKET_SUMMARY_MIN_RESPONSES} responses.`}
        </p>
      )}

      {showAction ? (
        <fetcher.Form method="post" action={EXIT_TICKET_SUMMARY_ACTION}>
          <input
            type="hidden"
            name="classAssignmentId"
            value={classAssignmentId}
          />
          <button
            type="submit"
            disabled={busy || !data.canGenerate}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition hover:bg-muted disabled:opacity-50"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : null}
            {busy ? 'Summarizing…' : actionLabel}
          </button>
        </fetcher.Form>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
