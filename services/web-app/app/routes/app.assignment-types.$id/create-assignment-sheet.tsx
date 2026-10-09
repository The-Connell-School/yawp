import { useEffect, useState } from 'react';
import { useFetcher } from 'react-router';
import { AssignmentCreationSheet } from '~/components/assignments/assignment-creation-sheet';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { ClassCheckboxList } from '~/components/assignments/class-checkbox-list';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '~/components/ui/accordion';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet';
import { FileTextIcon } from 'lucide-react';
import { formatClassCardTitle } from '~/utils/class-display';
import {
  ApHistorySourceCarousel,
  type ApHistorySourceCardData,
} from '~/components/ap-history/source-card';
import type { ExitTicketPrefill } from '~/domain/lesson-planner/exit-ticket-block';

type TeacherClass = {
  id: string;
  grade: string | null;
  period: string | null;
  title: string | null;
};

type Props = {
  assignmentTypeId: string;
  assignmentTypeTitle: string;
  /** `AssignmentType.kind` — exit ticket UI, engagement point minimums, etc. */
  assignmentTypeKind?: string | null;
  assignmentTypeRubricName?: string | null;
  /** Whether this kind of writing is in the collaborative-drafts pilot. */
  assignmentTypeCollaborationSupported?: boolean;
  /** Whether this type's rubric grades grammar, so the toggle is worth showing. */
  assignmentTypeGradesGrammar?: boolean;
  teacherClasses: TeacherClass[];
  initialClassId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPrompt?: string;
  /**
   * The exit ticket a lesson plan ended on, when the teacher followed the
   * planner's button here. The sheet opens on these answers and still shows
   * them the composed prompt before anything is created.
   */
  plannedExitTicket?: ExitTicketPrefill | null;
  titleRequired?: boolean;
  apHistoryEntry?: {
    externalKey: string;
    title: string;
    prompt: string;
    essayType: string;
    sources?: ApHistorySourceCardData[];
  } | null;
};

function classLabel(klass: TeacherClass) {
  return formatClassCardTitle(klass);
}

export function CreateAssignmentSheet({
  assignmentTypeId,
  assignmentTypeTitle,
  assignmentTypeKind = null,
  assignmentTypeRubricName = null,
  assignmentTypeCollaborationSupported = false,
  assignmentTypeGradesGrammar = false,
  teacherClasses,
  initialClassId,
  open,
  onOpenChange,
  initialPrompt = '',
  plannedExitTicket = null,
  titleRequired = false,
  apHistoryEntry = null,
}: Props) {
  const fetcher = useFetcher<{ success?: boolean; message?: string }>();
  // Only a class the teacher came from is preselected; with several targets
  // possible, an implicit default is how an assignment lands on the wrong section.
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>(
    initialClassId ? [initialClassId] : []
  );
  const [title, setTitle] = useState('');

  const isSaving = fetcher.state !== 'idle';

  function toggleClass(classId: string) {
    setSelectedClassIds((prev) =>
      prev.includes(classId)
        ? prev.filter((id) => id !== classId)
        : [...prev, classId]
    );
  }

  useEffect(() => {
    if (!open || !apHistoryEntry) return;
    setSelectedClassIds(initialClassId ? [initialClassId] : []);
    setTitle('');
  }, [open, teacherClasses, apHistoryEntry, initialClassId]);

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data?.success) {
      onOpenChange(false);
    }
  }, [fetcher.state, fetcher.data, onOpenChange]);

  if (!apHistoryEntry) {
    return (
      <AssignmentCreationSheet
        open={open}
        onOpenChange={onOpenChange}
        entryPoint="assignment-type"
        fixedAssignmentTypeId={assignmentTypeId}
        assignmentTypes={[
          {
            id: assignmentTypeId,
            title: assignmentTypeTitle,
            kind: assignmentTypeKind,
            rubricName: assignmentTypeRubricName,
            collaborationSupported: assignmentTypeCollaborationSupported,
            gradesGrammar: assignmentTypeGradesGrammar,
          },
        ]}
        teacherClasses={teacherClasses}
        initialPrompt={initialPrompt}
        initialExitTicketMode={plannedExitTicket?.mode}
        initialExitTicketFocus={plannedExitTicket?.focus ?? undefined}
        initialExitTicketTopic={plannedExitTicket?.topic}
        initialExitTicketAnswerType={plannedExitTicket?.answerType ?? null}
        initialExitTicketLessonNotes={plannedExitTicket?.lessonNotes ?? null}
        initialExitTicketReflectionPrompt={
          plannedExitTicket?.reflectionPrompt ?? null
        }
        initialExitTicketGrading={plannedExitTicket?.grading ?? null}
        initialExitTicketGradebook={
          plannedExitTicket
            ? {
                submitForGrade: plannedExitTicket.graded,
                pointValue: plannedExitTicket.pointValue,
              }
            : null
        }
        titleRequired={titleRequired}
      />
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>New Assignment</SheetTitle>
          <SheetDescription>
            Create an AP History assignment from the selected prompt.
          </SheetDescription>
        </SheetHeader>

        <fetcher.Form
          method="post"
          action="/api/assignments/create"
          className="mt-6 space-y-4"
        >
          <input type="hidden" name="intent" value="create-assignment" />
          <input
            type="hidden"
            name="assignmentTypeId"
            value={assignmentTypeId}
          />
          <input
            type="hidden"
            name="apHistoryLibraryEntryId"
            value={apHistoryEntry.externalKey}
          />

          <div className="space-y-2">
            <Label>Assign to</Label>
            <ClassCheckboxList
              idPrefix="ap-library"
              name="classIds"
              classes={teacherClasses.map((klass) => ({
                id: klass.id,
                label: classLabel(klass),
              }))}
              selectedIds={selectedClassIds}
              onToggle={toggleClass}
              disabled={isSaving}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cs-title">Title (optional)</Label>
            <Input
              id="cs-title"
              name="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Revolutionary Ideals DBQ"
              disabled={isSaving}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cs-post-at">
                Post date{' '}
                <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="cs-post-at"
                name="postAt"
                type="date"
                disabled={isSaving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cs-due-at">
                Due date <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="cs-due-at"
                name="dueAt"
                type="date"
                disabled={isSaving}
              />
            </div>
          </div>

          <div className="space-y-2 rounded-lg border bg-muted/40 p-4">
            <div className="flex items-center justify-between gap-3">
              <Label>Selected Prompt</Label>
              <span className="text-xs font-medium uppercase text-muted-foreground">
                {apHistoryEntry.essayType}
              </span>
            </div>
            <h3 className="text-base font-semibold">{apHistoryEntry.title}</h3>
            <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
              {apHistoryEntry.prompt}
            </p>
            {apHistoryEntry.sources && apHistoryEntry.sources.length > 0 ? (
              <Accordion type="single" collapsible defaultValue="sources">
                <AccordionItem
                  value="sources"
                  className="rounded-md border bg-background px-3"
                >
                  <AccordionTrigger className="py-2 text-sm hover:no-underline">
                    <span className="flex items-center gap-2">
                      <FileTextIcon className="h-4 w-4 text-muted-foreground" />
                      {apHistoryEntry.sources.length}{' '}
                      {apHistoryEntry.sources.length === 1
                        ? 'Source'
                        : 'Sources'}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="pb-2">
                      <ApHistorySourceCarousel
                        sources={apHistoryEntry.sources}
                      />
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            ) : null}
          </div>

          {fetcher.data && !fetcher.data.success ? (
            <p className="text-sm text-destructive">
              {fetcher.data.message || 'Unable to create assignment.'}
            </p>
          ) : null}

          <div className="flex items-center justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSaving || selectedClassIds.length === 0}
            >
              {isSaving ? 'Creating…' : 'Create Assignment'}
            </Button>
          </div>
        </fetcher.Form>
      </SheetContent>
    </Sheet>
  );
}
