import { Link } from 'react-router';
import { Lightbulb } from 'lucide-react';
import {
  formatSummaryHandoff,
  summaryHandoffHref,
  type SummaryHandoff,
} from '~/domain/lesson-planner/summary-handoff';

/**
 * A way from one part of the assignment summary into the Lesson Planner. Ids
 * only: the planner rebuilds the ask from the stored summary.
 */
export function PlanLink({
  classAssignmentId,
  handoff,
  children,
}: {
  classAssignmentId: string;
  handoff: SummaryHandoff;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={summaryHandoffHref(classAssignmentId, handoff)}
      data-handoff={formatSummaryHandoff(handoff)}
      className="inline-flex w-fit items-center gap-1.5 rounded-md text-sm font-medium text-primary hover:underline"
    >
      <Lightbulb size={14} className="shrink-0" aria-hidden />
      {children}
    </Link>
  );
}
