import { BadgeCheck } from 'lucide-react';

export function GradeSummaryReleasedLabel() {
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-normal text-foreground/90"
      data-testid="grade-summary-released-label"
    >
      <BadgeCheck
        className="h-3.5 w-3.5 shrink-0 text-foreground/80"
        aria-hidden
      />
      Released
    </span>
  );
}
