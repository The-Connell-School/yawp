import { useEffect, useState } from 'react';
import { useFetcher } from 'react-router';
import { AssignmentCreationSheet } from '~/components/assignments/assignment-creation-sheet';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
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
import {
  DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL,
  gradingAssistantStrictnessOptions,
} from '~/domain/grading/grading-assistant-strictness';

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
    sources: Array<{
      externalKey?: string;
      position: number;
      title: string;
      attribution: string;
      body: string;
    }>;
  } | null;
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
}: Props) {
  const defaultClassId = teacherClasses[0]?.id ?? '';
  const apHistoryEntryKey = apHistoryEntry?.externalKey ?? null;
  const fetcher = useFetcher<{ success?: boolean; message?: string }>();
  const [selectedClassId, setSelectedClassId] = useState(defaultClassId);
  const [title, setTitle] = useState('');
  const [tutorEnabled, setTutorEnabled] = useState(true);
  const [submitForGrade, setSubmitForGrade] = useState(true);
  const [pointValue, setPointValue] = useState('100');
  const [strictness, setStrictness] = useState(
    DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL
  );

  const isSaving = fetcher.state !== 'idle';

  useEffect(() => {
    if (!open || !apHistoryEntryKey) return;
    setSelectedClassId(defaultClassId);
    setTitle('');
    setTutorEnabled(true);
    setSubmitForGrade(true);
    setPointValue('100');
    setStrictness(DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL);
  }, [apHistoryEntryKey, defaultClassId, open]);

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
          <input
            type="hidden"
            name="tutorEnabled"
            value={String(tutorEnabled)}
          />
          <input
            type="hidden"
            name="submitForGrade"
            value={String(submitForGrade)}
          />
          <input
            type="hidden"
            name="gradingAssistantStrictnessLevel"
            value={strictness}
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
            {apHistoryEntry.sources.length > 0 ? (
              <details className="rounded-md border bg-background p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  Preview {apHistoryEntry.sources.length} source
                  {apHistoryEntry.sources.length === 1 ? '' : 's'}
                </summary>
                <div className="mt-3 max-h-72 space-y-3 overflow-y-auto">
                  {apHistoryEntry.sources.map((source) => (
                    <article
                      key={source.externalKey ?? source.position}
                      className="rounded-md bg-muted/40 p-3"
                    >
                      <p className="text-sm font-semibold">
                        Document {source.position}: {source.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {source.attribution}
                      </p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-5">
                        {source.body}
                      </p>
                    </article>
                  ))}
                </div>
              </details>
            ) : null}
          </div>

          <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
            <div className="flex items-start gap-2">
              <Checkbox
                id="ap-library-tutor"
                checked={tutorEnabled}
                onCheckedChange={(checked) => setTutorEnabled(checked === true)}
                disabled={isSaving}
              />
              <Label htmlFor="ap-library-tutor" className="font-normal">
                Enable AP History tutor
              </Label>
            </div>
            <div className="flex items-start gap-2">
              <Checkbox
                id="ap-library-graded"
                checked={submitForGrade}
                onCheckedChange={(checked) =>
                  setSubmitForGrade(checked === true)
                }
                disabled={isSaving}
              />
              <Label htmlFor="ap-library-graded" className="font-normal">
                Submit for a grade
              </Label>
            </div>
            {submitForGrade ? (
              <div className="space-y-2">
                <Label htmlFor="ap-library-points">Point value</Label>
                <Input
                  id="ap-library-points"
                  name="pointValue"
                  type="number"
                  min={1}
                  max={1000}
                  value={pointValue}
                  onChange={(event) => setPointValue(event.target.value)}
                  disabled={isSaving}
                />
              </div>
            ) : null}
            <div className="space-y-2">
              <Label>Grading strictness</Label>
              <Select
                value={strictness}
                onValueChange={(value) =>
                  setStrictness(value as typeof strictness)
                }
                disabled={isSaving}
              >
                <SelectTrigger aria-label="Grading assistant strictness">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {gradingAssistantStrictnessOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
