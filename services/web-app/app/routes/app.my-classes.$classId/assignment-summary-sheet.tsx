import type { ReactNode } from 'react';
import {
  effectiveParagraphModes,
  paragraphModeLabels,
} from '~/domain/assignment-types/daily-pages-paragraph-modes';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet';
import { AssignmentDocumentsPill } from './assignment-documents-pill';
import { AssignmentPromptPreview } from './assignment-prompt-preview';
import { AssignmentPromptAttachment } from '~/components/assignments/assignment-prompt-attachment';
import {
  ClassInsightsPanel,
  type ClassInsight,
} from '../app.my-classes.$classId_.assignments.$assignmentId/class-insights-panel';

export type AssignmentSummarySheetAssignment = {
  id: string;
  classAssignmentId: string;
  title: string | null;
  prompt: string;
  promptAttachmentName?: string | null;
  submitForGrade: boolean;
  pointValue: number | null;
  assignmentType: { title: string } | null;
  documentCount: number;
  gradedCount: number;
  insight: ClassInsight | null;
  /** Daily Pages: the paragraph type it practices. Null or absent is none. */
  paragraphMode?: string | null;
  /** Daily Pages: every paragraph type it practices; wins over the above. */
  paragraphModes?: string[] | null;
  /** How long students have to write. Null or absent is untimed. */
  writingTimeMinutes?: number | null;
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
  /**
   * Set true to skip rendering the built-in title header entirely. Used by
   * the dedicated assignment detail page, which renders its own page-level
   * heading and passes this content in as the body of a content card below
   * it — rendering both would produce two headings with the same name.
   */
  hideHeader?: boolean;
};

export function assignmentSummaryLayoutClassName(renderSheet: boolean) {
  return renderSheet
    ? 'mt-4 space-y-6'
    : 'mt-4 grid gap-6 lg:grid-cols-2 lg:items-start';
}

export const ASSIGNMENT_SUMMARY_SHEET_CONTENT_CLASS_NAME =
  'flex h-full w-full flex-col gap-0 overflow-hidden p-0 text-foreground dark:bg-card sm:max-w-xl';

function metadataYesNo(value: boolean) {
  return value ? 'Yes' : 'No';
}

function MetadataRow({
  label,
  children,
  stacked = false,
}: {
  label: string;
  children: ReactNode;
  stacked?: boolean;
}) {
  if (stacked) {
    return (
      <div className="px-4 py-3">
        <dt className="text-muted-foreground">{label}</dt>
        <dd className="mt-2 min-w-0">{children}</dd>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right font-medium text-foreground">{children}</dd>
    </div>
  );
}

function AssignmentMetadataSection({
  assignment,
  onViewDocuments,
}: {
  assignment: AssignmentSummarySheetAssignment;
  onViewDocuments: () => void;
}) {
  const title = assignment.title ?? 'Assignment';
  const isViewOnly = !assignment.submitForGrade;
  const paragraphTypeLabels = paragraphModeLabels(
    effectiveParagraphModes(assignment)
  );

  return (
    <section
      className="overflow-hidden rounded-xl border bg-white text-sm dark:bg-card"
      aria-label="Assignment details"
      data-testid="assignment-metadata-section"
    >
      <dl className="divide-y">
        {assignment.assignmentType ? (
          <MetadataRow label="Type">{assignment.assignmentType.title}</MetadataRow>
        ) : null}
        <MetadataRow label="Documents">
          <AssignmentDocumentsPill
            documentCount={assignment.documentCount}
            onClick={() => onViewDocuments()}
            ariaLabel={`View documents for ${title}`}
            testId="assignment-documents-link"
          />
        </MetadataRow>
        <MetadataRow label="Submit for grade">
          {metadataYesNo(assignment.submitForGrade)}
        </MetadataRow>
        {paragraphTypeLabels.length > 0 ? (
          <MetadataRow
            label={
              paragraphTypeLabels.length > 1 ? 'Paragraph types' : 'Paragraph type'
            }
          >
            {paragraphTypeLabels.join(', ')}
          </MetadataRow>
        ) : null}
        {assignment.writingTimeMinutes ? (
          <MetadataRow label="Time to write">
            {assignment.writingTimeMinutes} minutes
          </MetadataRow>
        ) : null}
        {assignment.submitForGrade ? (
          <MetadataRow label="Point value">{assignment.pointValue ?? 100}</MetadataRow>
        ) : null}
        <MetadataRow label="View only">{metadataYesNo(isViewOnly)}</MetadataRow>
        <MetadataRow label="Prompt" stacked>
          <div className="space-y-3">
            <AssignmentPromptPreview prompt={assignment.prompt} />
            {assignment.promptAttachmentName ? (
              <AssignmentPromptAttachment
                assignmentId={assignment.id}
                fileName={assignment.promptAttachmentName}
              />
            ) : null}
          </div>
        </MetadataRow>
      </dl>
    </section>
  );
}

function ClassAssignmentSummarySection({
  classAssignmentId,
  classInsightsEnabled,
  gradedCount,
  initialInsight,
}: {
  classAssignmentId: string;
  classInsightsEnabled: boolean;
  gradedCount: number;
  initialInsight: ClassInsight | null;
}) {
  if (!classInsightsEnabled) {
    return null;
  }

  return (
    <ClassInsightsPanel
      classAssignmentId={classAssignmentId}
      initialInsight={initialInsight}
      gradedCount={gradedCount}
    />
  );
}

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
  hideHeader = false,
}: AssignmentSummarySheetContentProps) {
  const title = assignment?.title ?? 'Assignment';

  const header = hideHeader ? null : renderSheet ? (
    <SheetHeader>
      <SheetTitle>{title}</SheetTitle>
    </SheetHeader>
  ) : (
    <div>
      <h2>{title}</h2>
    </div>
  );

  return (
    <>
      {header}

      {assignment ? (
        <div
          className={assignmentSummaryLayoutClassName(renderSheet)}
          data-testid="assignment-summary-layout"
        >
          <AssignmentMetadataSection
            assignment={assignment}
            onViewDocuments={onViewDocuments}
          />

          <ClassAssignmentSummarySection
            classAssignmentId={assignment.classAssignmentId}
            classInsightsEnabled={classInsightsEnabled}
            gradedCount={assignment.gradedCount}
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
