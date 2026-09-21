import { useEffect, useState } from 'react';
import { useFetcher } from 'react-router';
import { AssignmentCreationSheet } from '~/components/assignments/assignment-creation-sheet';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet';
import { formatClassCardTitle } from '~/utils/class-display';

type TeacherClass = {
  id: string;
  grade: string | null;
  period: string | null;
  title: string | null;
};

type Props = {
  assignmentTypeId: string;
  assignmentTypeTitle: string;
  /** Whether this kind of writing is in the collaborative-drafts pilot. */
  assignmentTypeCollaborationSupported?: boolean;
  teacherClasses: TeacherClass[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPrompt?: string;
  titleRequired?: boolean;
  apHistoryEntry?: {
    externalKey: string;
    title: string;
    prompt: string;
    essayType: string;
  } | null;
  rubricDefaultTotalPoints?: number | null;
};

function classLabel(klass: TeacherClass) {
  return formatClassCardTitle(klass);
}

export function CreateAssignmentSheet({
  assignmentTypeId,
  assignmentTypeTitle,
  assignmentTypeCollaborationSupported = false,
  teacherClasses,
  open,
  onOpenChange,
  initialPrompt = '',
  titleRequired = false,
  apHistoryEntry = null,
  rubricDefaultTotalPoints = null,
}: Props) {
  const fetcher = useFetcher<{ success?: boolean; message?: string }>();
  const [selectedClassId, setSelectedClassId] = useState(
    teacherClasses[0]?.id ?? ''
  );
  const [title, setTitle] = useState('');

  const isSaving = fetcher.state !== 'idle';

  useEffect(() => {
    if (!open || !apHistoryEntry) return;
    setSelectedClassId(teacherClasses[0]?.id ?? '');
    setTitle('');
  }, [open, teacherClasses, apHistoryEntry]);

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
            collaborationSupported: assignmentTypeCollaborationSupported,
          },
        ]}
        teacherClasses={teacherClasses}
        initialPrompt={initialPrompt}
        titleRequired={titleRequired}
        initialRubricDefaultTotalPoints={rubricDefaultTotalPoints}
      />
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>New Assignment</SheetTitle>
          <SheetDescription>
            Create an APUSH assignment from the selected prompt.
          </SheetDescription>
        </SheetHeader>

        <fetcher.Form
          method="post"
          action="/api/assignments/create"
          className="mt-6 space-y-4"
        >
          <input type="hidden" name="intent" value="create-assignment" />
          <input type="hidden" name="classIds" value={selectedClassId} />
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
            <Label>Class</Label>
            <Select
              value={selectedClassId}
              onValueChange={setSelectedClassId}
              disabled={isSaving}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a class" />
              </SelectTrigger>
              <SelectContent>
                {teacherClasses.map((klass) => (
                  <SelectItem key={klass.id} value={klass.id}>
                    {classLabel(klass)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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

          <div className="space-y-2 rounded-lg border bg-muted/40 p-4">
            <div className="flex items-center justify-between gap-3">
              <Label>Selected APUSH Prompt</Label>
              <span className="text-xs font-medium uppercase text-muted-foreground">
                {apHistoryEntry.essayType}
              </span>
            </div>
            <h3 className="text-base font-semibold">{apHistoryEntry.title}</h3>
            <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
              {apHistoryEntry.prompt}
            </p>
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
            <Button type="submit" disabled={isSaving || !selectedClassId}>
              {isSaving ? 'Creating…' : 'Create Assignment'}
            </Button>
          </div>
        </fetcher.Form>
      </SheetContent>
    </Sheet>
  );
}
