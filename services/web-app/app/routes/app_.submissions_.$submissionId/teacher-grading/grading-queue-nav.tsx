import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { cn } from '~/utils/misc';
import {
  TEACHER_DOCUMENT_STATUS_LABELS,
  type TeacherDocumentStatus,
} from '~/utils/teacher-document-status';

export type GradingQueueNavEntry = {
  submissionId: string;
  studentName: string;
  documentTitle: string;
  status: TeacherDocumentStatus;
};

export type GradingQueueNavProps = {
  /** Whose paper is open — rendered between the arrows. */
  currentName: string;
  previous: GradingQueueNavEntry | null;
  next: GradingQueueNavEntry | null;
  position: number;
  total: number;
  /** Builds the detail link for a neighbour, carrying the queue context along. */
  hrefFor: (submissionId: string) => string;
};

function neighborLabel(
  direction: 'Previous' | 'Next',
  entry: GradingQueueNavEntry | null
) {
  if (!entry) {
    return direction === 'Previous'
      ? 'No earlier paper in this list'
      : 'No later paper in this list';
  }

  return `${direction} paper: ${entry.studentName} — ${
    TEACHER_DOCUMENT_STATUS_LABELS[entry.status]
  }`;
}

/**
 * Prev/next student arrows for the grading header.
 *
 * Grading is a stack of papers, not a set of unrelated pages: the teacher wants
 * to finish one and reach for the next without going back to the list. These
 * arrows walk the same work list they arrived from, in the same order, and stay
 * put once a grade is released so the release does not strand them.
 */
export function GradingQueueNav({
  currentName,
  previous,
  next,
  position,
  total,
  hrefFor,
}: GradingQueueNavProps) {
  const navigate = useNavigate();

  // Alt+Arrow flips papers without leaving the keyboard. Alt keeps it clear of
  // the browser's own back/forward and of caret movement inside the comment box.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!event.altKey || event.ctrlKey || event.metaKey) return;

      if (event.key === 'ArrowLeft' && previous) {
        event.preventDefault();
        navigate(hrefFor(previous.submissionId));
        return;
      }

      if (event.key === 'ArrowRight' && next) {
        event.preventDefault();
        navigate(hrefFor(next.submissionId));
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [previous, next, hrefFor, navigate]);

  function renderArrow(
    direction: 'Previous' | 'Next',
    entry: GradingQueueNavEntry | null
  ) {
    const Icon = direction === 'Previous' ? ChevronLeft : ChevronRight;
    const testId =
      direction === 'Previous'
        ? 'grading-queue-previous'
        : 'grading-queue-next';
    const label = neighborLabel(direction, entry);

    if (!entry) {
      return (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled
          data-testid={testId}
          aria-label={label}
          title={label}
          className="h-7 w-7 shrink-0 p-0 text-muted-foreground"
        >
          <Icon className="h-4 w-4" />
        </Button>
      );
    }

    return (
      <Button
        asChild
        variant="ghost"
        size="sm"
        className="h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-foreground"
      >
        <Link
          to={hrefFor(entry.submissionId)}
          data-testid={testId}
          data-student-name={entry.studentName}
          aria-label={label}
          title={label}
          prefetch="intent"
        >
          <Icon className="h-4 w-4" />
        </Link>
      </Button>
    );
  }

  return (
    <div
      className="flex shrink-0 items-center gap-0.5"
      data-testid="grading-queue-nav"
      role="group"
      aria-label="Move through the grading queue"
    >
      {renderArrow('Previous', previous)}
      <span
        data-testid="grading-student-name"
        className="max-w-[14rem] truncate px-1 text-sm text-muted-foreground"
      >
        {currentName}
      </span>
      {renderArrow('Next', next)}
      <span
        data-testid="grading-queue-position"
        className={cn(
          'shrink-0 whitespace-nowrap pl-1 text-xs tabular-nums text-muted-foreground/70'
        )}
        aria-label={`Paper ${position} of ${total} in this list`}
      >
        {position} of {total}
      </span>
    </div>
  );
}
