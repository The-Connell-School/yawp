/**
 * What the planner is doing, while a lesson is being written.
 *
 * The bar is driven by real milestones the server reports — a tool it actually
 * called, then the writing — never by a timer. It eases toward each milestone
 * so it keeps moving between them, and it never reaches the end before the
 * lesson does.
 *
 * The label matters as much as the bar: "Reading how the class scored" tells a
 * teacher what their lesson is being built out of, which is worth more than a
 * spinner that says "Planning…".
 */
import { useEffect, useRef, useState } from 'react';

export type PlanningProgressState = { label: string; fraction: number };

/** How much of the gap to the reported milestone to close per tick. */
const EASE_RATE = 0.08;
const TICK_MS = 120;

export function PlanningProgressBar({
  progress,
}: {
  progress: PlanningProgressState;
}) {
  // The drawn position trails the reported one so the bar animates between
  // milestones instead of jumping and then sitting still.
  const [drawn, setDrawn] = useState(progress.fraction);
  const target = useRef(progress.fraction);
  target.current = Math.max(target.current, progress.fraction);

  useEffect(() => {
    const timer = setInterval(() => {
      setDrawn((current) =>
        current >= target.current
          ? current
          : current + (target.current - current) * EASE_RATE
      );
    }, TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const percent = Math.round(Math.min(drawn, target.current) * 100);

  return (
    <div
      className="w-full max-w-sm"
      data-testid="planning-progress"
      role="status"
      aria-live="polite"
    >
      <p className="mb-1.5 text-sm text-muted-foreground">{progress.label}…</p>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/10"
        // Announced as a bar for anyone who cannot see it move. The value is
        // the honest one — the same number the fill is drawn from.
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label="Writing your lesson"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-150 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
