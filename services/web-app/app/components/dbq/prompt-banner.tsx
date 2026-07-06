import { Clock, Pause, Play, RotateCcw, Send } from 'lucide-react';
import { Button } from '~/components/ui/button';
import type { DbqState } from './use-dbq-state';
import { cn } from '~/utils/misc';

function fmt(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function PromptBanner({
  state,
  showSubmit = true,
}: {
  state: DbqState;
  showSubmit?: boolean;
}) {
  const {
    prompt,
    timeMode,
    setTimeMode,
    msRemaining,
    durationMinutes,
    timerRunning,
    startTimer,
    pauseTimer,
    resetTimer,
    submit,
    view,
  } = state;

  const low = timeMode === 'timed' && msRemaining < 5 * 60 * 1000;

  return (
    <div className="flex items-center gap-4 border-b bg-background px-4 py-2.5">
      <div className="flex min-w-0 flex-1 items-baseline gap-3">
        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
          DBQ · APUSH{prompt.title ? ` · ${prompt.title}` : ''}
        </span>
        <p className="truncate text-sm font-medium text-foreground">
          {prompt.prompt}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <div className="inline-flex rounded-full border bg-muted/40 p-0.5">
          <button
            type="button"
            onClick={() => setTimeMode('untimed')}
            className={cn(
              'rounded-full px-2.5 py-0.5 text-[11px] transition',
              timeMode === 'untimed'
                ? 'bg-background shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Untimed
          </button>
          <button
            type="button"
            onClick={() => setTimeMode('timed')}
            className={cn(
              'rounded-full px-2.5 py-0.5 text-[11px] transition',
              timeMode === 'timed'
                ? 'bg-background shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Timed · {durationMinutes}m
          </button>
        </div>

        {timeMode === 'timed' ? (
          <div className="flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5">
            <Clock
              size={13}
              className={cn('text-muted-foreground', low && 'text-destructive')}
            />
            <span
              className={cn(
                'font-mono text-[12px] tabular-nums',
                low && 'text-destructive'
              )}
            >
              {fmt(msRemaining)}
            </span>
            {timerRunning ? (
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={pauseTimer}
                aria-label="Pause"
                className="h-6 w-6"
              >
                <Pause size={12} />
              </Button>
            ) : (
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={startTimer}
                aria-label="Start"
                className="h-6 w-6"
              >
                <Play size={12} />
              </Button>
            )}
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={resetTimer}
              aria-label="Reset"
              className="h-6 w-6"
            >
              <RotateCcw size={12} />
            </Button>
          </div>
        ) : null}

        {showSubmit ? (
          <Button
            variant="outline"
            size="sm"
            onClick={submit}
            disabled={view === 'submitted'}
          >
            <Send size={13} className="mr-1.5" />
            {view === 'submitted' ? 'Submitted' : 'Submit'}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
