import { BookOpen, PenLine, Send } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { Timer } from './timer';
import type { DbqState } from './use-dbq-state';
import { cn } from '~/utils/misc';

export function TopBar({ state }: { state: DbqState }) {
  const {
    prompt,
    mode,
    setMode,
    timeMode,
    setTimeMode,
    readingMsRemaining,
    writingMsRemaining,
    timerRunning,
    startTimer,
    pauseTimer,
    resetTimer,
    submit,
  } = state;

  const writingLocked = timeMode === 'timed' && mode === 'reading';

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-background px-4 py-3">
      <div className="flex items-baseline gap-3">
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-primary">
          DBQ · APUSH
        </span>
        <h1 className="text-base font-semibold">{prompt.title}</h1>
      </div>

      <div className="flex items-center gap-2">
        <div className="inline-flex rounded-full border bg-muted/40 p-0.5">
          <button
            type="button"
            onClick={() => setMode('reading')}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm transition',
              mode === 'reading'
                ? 'bg-background shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <BookOpen size={14} /> Reading
          </button>
          <button
            type="button"
            onClick={() => !writingLocked && setMode('writing')}
            disabled={writingLocked}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm transition',
              mode === 'writing'
                ? 'bg-background shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
              writingLocked && 'cursor-not-allowed opacity-50'
            )}
            title={
              writingLocked
                ? 'Editor unlocks at end of reading phase'
                : undefined
            }
          >
            <PenLine size={14} /> Writing
          </button>
        </div>

        <div className="inline-flex rounded-full border bg-muted/40 p-0.5">
          <button
            type="button"
            onClick={() => setTimeMode('untimed')}
            className={cn(
              'rounded-full px-3 py-1 text-xs transition',
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
              'rounded-full px-3 py-1 text-xs transition',
              timeMode === 'timed'
                ? 'bg-background shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Timed · 60min
          </button>
        </div>

        {timeMode === 'timed' ? (
          <Timer
            label={mode === 'reading' ? 'Reading' : 'Writing'}
            msRemaining={
              mode === 'reading' ? readingMsRemaining : writingMsRemaining
            }
            running={timerRunning}
            onStart={startTimer}
            onPause={pauseTimer}
            onReset={resetTimer}
          />
        ) : null}

        <Button
          variant="outline"
          size="sm"
          onClick={submit}
          disabled={mode === 'submitted'}
        >
          <Send size={14} className="mr-1.5" />
          {mode === 'submitted' ? 'Submitted' : 'Submit'}
        </Button>
      </div>
    </header>
  );
}
