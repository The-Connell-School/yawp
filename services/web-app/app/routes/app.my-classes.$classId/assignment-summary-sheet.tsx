import { ChevronRight } from 'lucide-react';
import { Badge, badgeVariants } from '~/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet';
import { cn } from '~/utils/misc';
import {
  ClassInsightsPanel,
  type ClassInsight,
} from '../app.my-classes.$classId_.assignments.$assignmentId/class-insights-panel';

export type AssignmentSummarySheetAssignment = {
  id: string;
  classAssignmentId: string;
  title: string | null;
  assignmentType: { title: string } | null;
  documentCount: number;
  gradedCount: number;
  insight: ClassInsight | null;
};

export type AssignmentSummarySheetContentProps = {
  assignment: AssignmentSummarySheetAssignment | null;
  /** Gated on the organization's classInsightsEnabled flag. */
  classInsightsEnabled: boolean;
  onViewDocuments: () => void;
  /**
   * Set false to render the header as plain markup instead of Radix
   * SheetHeader/SheetTitle, which require a Dialog context. Lets tests
   * render this content directly without the Sheet portal.
   */
  renderSheet?: boolean;
};

export const ASSIGNMENT_SUMMARY_SHEET_CONTENT_CLASS_NAME =
  'w-full overflow-y-auto text-foreground dark:bg-card sm:max-w-xl';

/**
 * The sheet body, split out from the `<Sheet>`/`<SheetContent>` Radix
 * wrapper so it can be rendered and asserted on directly in tests without
 * depending on the portal. Mirrors `StudentGrowthPlansSheetContent`.
 */
export function AssignmentSummarySheetContent({
  assignment,
  classInsightsEnabled,
  onViewDocuments,
  renderSheet = true,
}: AssignmentSummarySheetContentProps) {
  const title = assignment?.title ?? 'Assignment';

  const header = renderSheet ? (
    <SheetHeader>
      <SheetTitle>{title}</SheetTitle>
      <SheetDescription>
        {assignment?.assignmentType?.title ?? 'Assignment details'}
      </SheetDescription>
    </SheetHeader>
  ) : (
    <div>
      <h2>{title}</h2>
      <p>{assignment?.assignmentType?.title ?? 'Assignment details'}</p>
    </div>
  );

  return (
    <>
      {header}

      {assignment ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {assignment.assignmentType ? (
            <Badge variant="outline" size="sm">
              {assignment.assignmentType.title}
            </Badge>
          ) : null}
          <span className="text-sm text-muted-foreground">
            {assignment.documentCount}{' '}
            {assignment.documentCount === 1 ? 'document' : 'documents'} ·{' '}
            {assignment.gradedCount} graded
          </span>
          <button
            type="button"
            className={cn(
              badgeVariants({ variant: 'secondary' }),
              'cursor-pointer gap-1 py-1 pl-2 pr-1'
            )}
            onClick={onViewDocuments}
            aria-label={`View documents for ${title}`}
          >
            Docs
            <ChevronRight className="size-3 shrink-0" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {assignment && classInsightsEnabled ? (
        <div className="mt-4 pb-6">
          <ClassInsightsPanel
            classAssignmentId={assignment.classAssignmentId}
            initialInsight={assignment.insight}
          />
        </div>
      ) : null}
    </>
  );
}

export function AssignmentSummarySheet({
  open,
  onOpenChange,
  assignment,
  classInsightsEnabled,
  onViewDocuments,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignment: AssignmentSummarySheetAssignment | null;
  classInsightsEnabled: boolean;
  onViewDocuments: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className={ASSIGNMENT_SUMMARY_SHEET_CONTENT_CLASS_NAME}>
        <AssignmentSummarySheetContent
          assignment={assignment}
          classInsightsEnabled={classInsightsEnabled}
          onViewDocuments={onViewDocuments}
        />
      </SheetContent>
    </Sheet>
  );
}
