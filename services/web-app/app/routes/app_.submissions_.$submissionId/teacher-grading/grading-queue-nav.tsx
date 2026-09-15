import { useNavigate } from 'react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '~/components/ui/button';
import type { GradingQueueNeighbors } from '~/domain/grading/grading-queue';

export function GradingQueueNav({
  queue,
  submissionId,
  hrefFor,
  disabled = false,
}: {
  queue: GradingQueueNeighbors;
  submissionId: string;
  hrefFor: (submissionId: string) => string;
  disabled?: boolean;
}) {
  const navigate = useNavigate();
  const remaining = queue.entries.filter(
    (entry) => entry.status === 'needs-grading'
  ).length;
  return (
    <div
      className="flex min-w-0 items-center gap-1"
      data-testid="grading-queue-nav"
      role="group"
      aria-label="Ungraded submissions"
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 w-8 shrink-0 p-0"
        data-testid="grading-queue-previous"
        aria-label={
          queue.previous
            ? `Previous submission: ${queue.previous.studentName}, ${queue.previous.documentTitle}`
            : 'No previous ungraded submission'
        }
        disabled={disabled || !queue.previous}
        onClick={() =>
          queue.previous && navigate(hrefFor(queue.previous.submissionId))
        }
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <select
        aria-label="Choose ungraded submission"
        data-testid="grading-student-name"
        className="h-8 min-w-0 max-w-[min(24rem,45vw)] rounded-md border border-input bg-background px-2 text-sm"
        value={submissionId}
        disabled={disabled}
        onChange={(event) => navigate(hrefFor(event.currentTarget.value))}
      >
        {queue.entries.map((entry) => (
          <option key={entry.submissionId} value={entry.submissionId}>
            {entry.studentName} — {entry.documentTitle}
            {entry.status !== 'needs-grading' ? ' (Current, graded)' : ''}
          </option>
        ))}
      </select>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 w-8 shrink-0 p-0"
        data-testid="grading-queue-next"
        aria-label={
          queue.next
            ? `Next submission: ${queue.next.studentName}, ${queue.next.documentTitle}`
            : 'No next ungraded submission'
        }
        disabled={disabled || !queue.next}
        onClick={() => queue.next && navigate(hrefFor(queue.next.submissionId))}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
      <span
        className="hidden whitespace-nowrap text-xs text-muted-foreground lg:inline"
        data-testid="grading-queue-position"
        aria-live="polite"
      >
        {remaining === 0
          ? 'No ungraded submissions'
          : `${queue.position} of ${queue.total}`}
      </span>
    </div>
  );
}
