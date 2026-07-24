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

type TeacherClass = {
  id: string;
  grade: string;
  period: string;
  title: string | null;
};

type Props = {
  assignmentTypeId: string;
  assignmentTypeTitle: string;
  teacherClasses: TeacherClass[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPrompt?: string;
  apHistoryEntry?: {
    externalKey: string;
    title: string;
    prompt: string;
    essayType: string;
  } | null;
  apEnglishLitEntry?: {
    externalKey: string;
    title: string;
    prompt: string;
    frqType: string;
  } | null;
};

const FRQ_TYPE_LABEL: Record<string, string> = {
  poetry: 'Poetry',
  prose: 'Prose',
  literary_argument: 'Literary Argument',
};

function classLabel(klass: TeacherClass) {
  return klass.title || `Grade ${klass.grade} • Period ${klass.period}`;
}

export function CreateAssignmentSheet({
  assignmentTypeId,
  assignmentTypeTitle,
  teacherClasses,
  open,
  onOpenChange,
  initialPrompt = '',
  apHistoryEntry = null,
  apEnglishLitEntry = null,
}: Props) {
  const fetcher = useFetcher<{ success?: boolean; message?: string }>();
  const [selectedClassId, setSelectedClassId] = useState(
    teacherClasses[0]?.id ?? ''
  );
  const [title, setTitle] = useState('');

  const isSaving = fetcher.state !== 'idle';

  const libraryEntry = apHistoryEntry
    ? {
        externalKey: apHistoryEntry.externalKey,
        title: apHistoryEntry.title,
        prompt: apHistoryEntry.prompt,
        typeLabel: apHistoryEntry.essayType,
        courseLabel: 'APUSH',
        fieldName: 'apHistoryLibraryEntryId',
        titlePlaceholder: 'e.g., Revolutionary Ideals DBQ',
      }
    : apEnglishLitEntry
      ? {
          externalKey: apEnglishLitEntry.externalKey,
          title: apEnglishLitEntry.title,
          prompt: apEnglishLitEntry.prompt,
          typeLabel:
            FRQ_TYPE_LABEL[apEnglishLitEntry.frqType] ??
            apEnglishLitEntry.frqType,
          courseLabel: 'AP Literature',
          fieldName: 'apEnglishLitLibraryEntryId',
          titlePlaceholder: 'e.g., Poetry Analysis — Frost',
        }
      : null;

  useEffect(() => {
    if (!open || !libraryEntry) return;
    setSelectedClassId(teacherClasses[0]?.id ?? '');
    setTitle('');
  }, [open, teacherClasses, libraryEntry]);

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data?.success) {
      onOpenChange(false);
    }
  }, [fetcher.state, fetcher.data, onOpenChange]);

  if (!libraryEntry) {
    return (
      <AssignmentCreationSheet
        open={open}
        onOpenChange={onOpenChange}
        entryPoint="assignment-type"
        fixedAssignmentTypeId={assignmentTypeId}
        assignmentTypes={[{ id: assignmentTypeId, title: assignmentTypeTitle }]}
        teacherClasses={teacherClasses}
        initialPrompt={initialPrompt}
      />
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>New Assignment</SheetTitle>
          <SheetDescription>
            Create a {libraryEntry.courseLabel} assignment from the selected
            prompt.
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
            name={libraryEntry.fieldName}
            value={libraryEntry.externalKey}
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
              placeholder={libraryEntry.titlePlaceholder}
              disabled={isSaving}
            />
          </div>

          <div className="space-y-2 rounded-lg border bg-muted/40 p-4">
            <div className="flex items-center justify-between gap-3">
              <Label>Selected {libraryEntry.courseLabel} Prompt</Label>
              <span className="text-xs font-medium uppercase text-muted-foreground">
                {libraryEntry.typeLabel}
              </span>
            </div>
            <h3 className="text-base font-semibold">{libraryEntry.title}</h3>
            <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
              {libraryEntry.prompt}
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
