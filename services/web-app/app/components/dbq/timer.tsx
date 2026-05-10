import { Clock, Pause, Play, RotateCcw } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { cn } from '~/utils/misc';

function fmt(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function Timer({
  label,
  msRemaining,
  running,
  onStart,
  onPause,
  onReset,
}: {
  label: string;
  msRemaining: number;
  running: boolean;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
}) {
  const low = msRemaining < 60 * 1000;
  return (
    <div className="flex items-center gap-2 rounded-full border bg-muted/40 px-3 py-1.5">
      <Clock
        size={16}
        className={cn('text-muted-foreground', low && 'text-destructive')}
      />
      <span className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          'font-mono text-sm tabular-nums',
          low && 'text-destructive'
        )}
      >
        {fmt(msRemaining)}
      </span>
      {running ? (
        <Button size="icon-sm" variant="ghost" onClick={onPause} aria-label="Pause">
          <Pause size={14} />
        </Button>
      ) : (
        <Button size="icon-sm" variant="ghost" onClick={onStart} aria-label="Start">
          <Play size={14} />
        </Button>
      )}
      <Button size="icon-sm" variant="ghost" onClick={onReset} aria-label="Reset">
        <RotateCcw size={14} />
      </Button>
    </div>
  );
}
