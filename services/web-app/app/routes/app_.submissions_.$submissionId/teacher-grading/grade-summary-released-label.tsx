import { BadgeCheck } from 'lucide-react';

export function GradeSummaryReleasedLabel() {
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground"
      data-testid="grade-summary-released-label"
    >
      <BadgeCheck
        className="h-3.5 w-3.5 shrink-0 text-muted-foreground/80"
        aria-hidden
      />
      Released
    </span>
  );
}
