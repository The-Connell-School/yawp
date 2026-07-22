import { Clock3, ExternalLink, Play } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import type { ApHistorySnapshot } from '~/domain/ap-history/schema';

type PromptPanelProps = {
  snapshot: ApHistorySnapshot;
  documentId?: string;
  initialTimerStartedAt?: string | Date | null;
  canStartTimer?: boolean;
};

function titleCase(value: string) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function getApHistoryTimerView(
  startedAt: string | Date,
  durationMinutes: number,
  nowMs: number
) {
  const startedAtMs = new Date(startedAt).getTime();
  const totalSeconds = Math.max(0, Math.floor(durationMinutes * 60));
  if (!Number.isFinite(startedAtMs)) {
    return { remainingSeconds: totalSeconds, expired: false };
  }
  const elapsedSeconds = Math.max(0, Math.floor((nowMs - startedAtMs) / 1000));
  const remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds);
  return { remainingSeconds, expired: remainingSeconds === 0 };
}

function formatCountdown(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function ApHistoryTimer({
  snapshot,
  documentId,
  initialTimerStartedAt,
  canStartTimer = false,
}: PromptPanelProps) {
  const [startedAt, setStartedAt] = useState<string | null>(() =>
    initialTimerStartedAt ? new Date(initialTimerStartedAt).toISOString() : null
  );
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!startedAt) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  if (snapshot.timing.mode !== 'timed') {
    return (
      <Badge variant="outline" size="sm">
        Untimed practice
      </Badge>
    );
  }

  const timerView = startedAt
    ? getApHistoryTimerView(startedAt, snapshot.timing.durationMinutes, nowMs)
    : null;

  async function startTimer() {
    if (!documentId || isStarting) return;
    setIsStarting(true);
    setError(null);
    try {
      const form = new FormData();
      form.set('documentId', documentId);
      const response = await fetch('/api/ap-history/timer', {
        method: 'POST',
        body: form,
      });
      const payload = (await response.json()) as {
        timerStartedAt?: string;
        message?: string;
      };
      if (!response.ok || !payload.timerStartedAt) {
        throw new Error(payload.message ?? 'Could not start the timer.');
      }
      setStartedAt(payload.timerStartedAt);
      setNowMs(Date.now());
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Could not start the timer.'
      );
    } finally {
      setIsStarting(false);
    }
  }

  if (!startedAt) {
    return (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Badge variant="outline" size="sm">
          <Clock3 className="mr-1 h-3.5 w-3.5" />
          {snapshot.timing.durationMinutes} minute pacing timer
        </Badge>
        {canStartTimer ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isStarting}
            onClick={() => void startTimer()}
            data-testid="ap-history-start-timer"
          >
            <Play className="h-3.5 w-3.5" />
            {isStarting ? 'Starting…' : 'Start timer'}
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">Not started</span>
        )}
        {error ? (
          <p
            role="alert"
            className="basis-full text-right text-xs text-destructive"
          >
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-2"
      aria-live="polite"
      data-testid="ap-history-timer"
    >
      <Clock3 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      {timerView?.expired ? (
        <span className="text-sm font-medium text-amber-800">
          Time expired — you can keep writing.
        </span>
      ) : (
        <span className="font-mono text-sm font-semibold tabular-nums">
          {formatCountdown(timerView?.remainingSeconds ?? 0)} remaining
        </span>
      )}
    </div>
  );
}

export function ApHistoryAssignmentPanel(props: PromptPanelProps) {
  const { snapshot } = props;
  return (
    <section
      className="shrink-0 border-b bg-slate-50/95 px-3 py-2.5"
      aria-labelledby="ap-history-prompt-heading"
      data-testid="ap-history-prompt-panel"
    >
      <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" size="sm">
              APUSH {snapshot.essayType.toUpperCase()}
            </Badge>
            <Badge variant="outline" size="sm">
              Period {snapshot.periodNumber}
            </Badge>
            <Badge variant="outline" size="sm">
              {titleCase(snapshot.reasoningSkill)}
            </Badge>
            <Badge variant="outline" size="sm">
              {snapshot.rubric.totalPoints} rubric points
            </Badge>
          </div>
          <p
            id="ap-history-prompt-heading"
            className="whitespace-pre-wrap text-sm font-medium leading-5 text-foreground"
          >
            {snapshot.prompt}
          </p>
        </div>
        <div className="shrink-0 lg:max-w-sm">
          <ApHistoryTimer {...props} />
        </div>
      </div>
    </section>
  );
}

function safeHttpsUrl(value: string | null | undefined) {
  return value?.startsWith('https://') ? value : null;
}

export function ApHistorySourcesPanel({
  snapshot,
  className = '',
}: {
  snapshot: ApHistorySnapshot;
  className?: string;
}) {
  return (
    <section
      className={`flex h-full min-h-0 flex-col bg-white ${className}`}
      aria-label="Source documents"
      data-testid="ap-history-sources-panel"
    >
      <header className="shrink-0 border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Source documents</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {snapshot.sources.length}{' '}
          {snapshot.sources.length === 1 ? 'document' : 'documents'} in the
          assignment snapshot
        </p>
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {snapshot.sources.map((source) => {
          const licenseName =
            'licenseName' in source ? source.licenseName : null;
          const licenseUrl =
            'licenseUrl' in source ? safeHttpsUrl(source.licenseUrl) : null;
          const provenanceUrl = safeHttpsUrl(source.provenanceUrl);
          const imageUrl = safeHttpsUrl(source.imageUrl);
          return (
            <article
              key={source.externalKey}
              className="rounded-lg border bg-background p-3 shadow-sm"
            >
              <div className="flex items-start gap-2">
                <Badge variant="secondary" size="sm" className="shrink-0">
                  Document {source.position}
                </Badge>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold leading-5">
                    {source.title}
                  </h3>
                  <p className="mt-0.5 text-xs leading-4 text-muted-foreground">
                    {source.attribution}
                  </p>
                </div>
              </div>
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={source.imageAlt?.trim() || source.title}
                  loading="lazy"
                  className="mt-3 max-h-72 w-full rounded-md border object-contain"
                />
              ) : null}
              {source.caption ? (
                <p className="mt-3 text-sm italic text-muted-foreground">
                  {source.caption}
                </p>
              ) : null}
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6">
                {source.body}
              </p>
              {licenseName || provenanceUrl ? (
                <footer className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t pt-2 text-xs text-muted-foreground">
                  {licenseUrl && licenseName ? (
                    <a
                      href={licenseUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 underline underline-offset-2"
                    >
                      {licenseName}
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                  ) : licenseName ? (
                    <span>{licenseName}</span>
                  ) : null}
                  {provenanceUrl ? (
                    <a
                      href={provenanceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 underline underline-offset-2"
                    >
                      View provenance
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                  ) : null}
                </footer>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
