import * as React from 'react';
import { Clock, BookOpen, PenLine } from 'lucide-react';
import { cn } from '~/utils/misc';
import {
  computeTimedState,
  formatClock,
  type TimedState,
} from '~/domain/timed-mode';
import type { ApEssayType } from '~/domain/grading/ap-rubric';

interface TimerProps {
  essayType: ApEssayType;
  startedAtMs: number;
  onPhaseChange?: (state: TimedState) => void;
  onTimeUp?: () => void;
  className?: string;
}

export function Timer({
  essayType,
  startedAtMs,
  onPhaseChange,
  onTimeUp,
  className,
}: TimerProps) {
  const [now, setNow] = React.useState(() => Date.now());
  const prevPhaseRef = React.useRef<TimedState['phase'] | null>(null);
  const firedTimeUpRef = React.useRef(false);

  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const state = computeTimedState(essayType, startedAtMs, now);

  React.useEffect(() => {
    if (prevPhaseRef.current !== state.phase) {
      prevPhaseRef.current = state.phase;
      onPhaseChange?.(state);
    }
    if (state.phase === 'done' && !firedTimeUpRef.current) {
      firedTimeUpRef.current = true;
      onTimeUp?.();
    }
  }, [state, onPhaseChange, onTimeUp]);

  const isLowTime = state.phaseSecondsRemaining <= 60 && state.phase !== 'done';

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm',
        state.phase === 'reading' && 'border-blue-300 bg-blue-50',
        state.phase === 'writing' && 'border-green-300 bg-green-50',
        state.phase === 'done' && 'border-muted bg-muted',
        className
      )}
      data-testid="timed-mode-timer"
      data-phase={state.phase}
    >
      {state.phase === 'reading' ? (
        <BookOpen className="h-4 w-4 text-blue-600" />
      ) : state.phase === 'writing' ? (
        <PenLine className="h-4 w-4 text-green-600" />
      ) : (
        <Clock className="h-4 w-4 text-muted-foreground" />
      )}
      <span className="font-medium">
        {state.phase === 'reading'
          ? 'Reading'
          : state.phase === 'writing'
            ? 'Writing'
            : "Time's up"}
      </span>
      {state.phase !== 'done' && (
        <span
          className={cn(
            'font-mono tabular-nums',
            isLowTime && 'font-semibold text-red-600'
          )}
        >
          {formatClock(state.phaseSecondsRemaining)}
        </span>
      )}
    </div>
  );
}
