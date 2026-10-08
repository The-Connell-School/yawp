import { Link } from 'react-router';
import { ClipboardCheck, Sparkles } from 'lucide-react';
import type { ExitTicketClassRead } from '~/domain/assignment-types/exit-ticket-class-read';

/**
 * What a class's exit tickets said, on one card: how many landed in each
 * band, the questions students are still asking, and who to check in with.
 * Shown for ungraded tickets too — every response is read either way — and
 * ends on the way to plan tomorrow from it.
 */
export function ExitTicketClassReadPanel({
  read,
  planHref,
}: {
  read: ExitTicketClassRead;
  /** Null where the Lesson Planner is not on for this school. */
  planHref: string | null;
}) {
  const widest = Math.max(1, ...read.bands.map((band) => band.count));

  return (
    <section
      data-testid="exit-ticket-class-read"
      className="rounded-lg border bg-card p-4"
    >
      <div className="flex items-center gap-2">
        <ClipboardCheck size={16} className="shrink-0 text-primary" />
        <h2 className="text-base font-semibold">Class read</h2>
        {read.responseCount > 0 ? (
          <span className="ml-auto text-xs text-muted-foreground">
            {read.readCount} of {read.responseCount} responses read
          </span>
        ) : null}
      </div>

      {read.responseCount === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          No responses yet. Once students hand in their tickets, this shows how
          the lesson landed without you grading each one.
        </p>
      ) : (
        <div className="mt-3 space-y-4">
          <ul className="space-y-1.5" aria-label="How the class landed">
            {read.bands.map((band) => (
              <li
                key={band.label}
                className="grid grid-cols-[7.5rem_1fr_2rem] items-center gap-2 text-sm"
              >
                <span className="text-muted-foreground">{band.label}</span>
                <span className="h-2 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-primary/70"
                    style={{ width: `${(band.count / widest) * 100}%` }}
                  />
                </span>
                <span className="text-right tabular-nums">{band.count}</span>
              </li>
            ))}
          </ul>

          {read.watchFor ? (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Watching for:</span>{' '}
              {read.watchFor}
            </p>
          ) : null}

          {read.openQuestions.length > 0 ? (
            <div className="space-y-1">
              <p className="text-sm font-medium">Still asking</p>
              <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
                {read.openQuestions.map((question) => (
                  <li key={question}>{question}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {read.needsFollowUp.length > 0 ? (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">
                Check in with:
              </span>{' '}
              {read.needsFollowUp.join(', ')}
            </p>
          ) : null}

          {planHref ? (
            <Link
              to={planHref}
              data-testid="exit-ticket-plan-tomorrow"
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
            >
              <Sparkles size={13} />
              Plan tomorrow from this
            </Link>
          ) : null}
        </div>
      )}
    </section>
  );
}
