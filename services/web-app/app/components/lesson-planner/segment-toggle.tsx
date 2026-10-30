import { BookmarkCheck, BookmarkPlus } from 'lucide-react';
import { cn } from '~/utils/misc';

/**
 * "Add to stack" on one segment of the lesson, wherever it appears in the
 * reply (Brian's run 3, item 1). The same status as its card and its line in
 * "Steps in this plan", because all three read the same pieces.
 */
export function SegmentToggle({
  isIn,
  minutes,
  disabled,
  onToggle,
  className,
}: {
  isIn: boolean;
  minutes?: number | null;
  disabled?: boolean;
  onToggle: (next: boolean) => void;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      {minutes != null ? (
        <span className="text-xs tabular-nums text-muted-foreground">{minutes} min</span>
      ) : null}
      <button
        type="button"
        disabled={disabled}
        data-testid="segment-toggle"
        aria-pressed={isIn}
        title={isIn ? 'In the stack. Click to remove it.' : undefined}
        onClick={() => onToggle(!isIn)}
        className={cn(
          'inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium transition disabled:opacity-50',
          isIn
            ? 'bg-primary/10 text-primary hover:bg-primary/15'
            : 'border border-primary/40 text-primary hover:bg-primary/5'
        )}
      >
        {isIn ? <BookmarkCheck size={12} /> : <BookmarkPlus size={12} />}
        {isIn ? 'In the stack' : 'Add to stack'}
      </button>
    </span>
  );
}
