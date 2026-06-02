import { useEffect, useState } from 'react';
import { useFetcher } from 'react-router';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet';
import { Button } from '~/components/ui/button';
import { Label } from '~/components/ui/label';
import { Input } from '~/components/ui/input';
import { Textarea } from '~/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';

type TeacherClass = {
  id: string;
  grade: string;
  period: string;
  title: string | null;
};

type Props = {
  assignmentTypeId: string;
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
};

function classLabel(klass: TeacherClass) {
  return klass.title || `Grade ${klass.grade} • Period ${klass.period}`;
}

export function CreateAssignmentSheet({
  assignmentTypeId,
  teacherClasses,
  open,
  onOpenChange,
  initialPrompt = '',
  apHistoryEntry = null,
}: Props) {
  const fetcher = useFetcher<{ success?: boolean; message?: string }>();
  const [selectedClassId, setSelectedClassId] = useState(
    teacherClasses[0]?.id ?? ''
  );
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [tutorContext, setTutorContext] = useState('');
  const [dueDate, setDueDate] = useState('');

  const isSaving = fetcher.state !== 'idle';
  const isApHistoryAssignment = apHistoryEntry != null;

  useEffect(() => {
    if (!open) return;
    setSelectedClassId(teacherClasses[0]?.id ?? '');
    setTitle('');
    setPrompt(apHistoryEntry ? '' : initialPrompt);
    setTutorContext('');
    setDueDate('');
  }, [open, teacherClasses, initialPrompt, apHistoryEntry]);

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data?.success) {
      onOpenChange(false);
    }
  }, [fetcher.state, fetcher.data, onOpenChange]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>New Assignment</SheetTitle>
          <SheetDescription>
            Create an assignment for one of your classes.
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
          {apHistoryEntry ? (
            <input
              type="hidden"
              name="apHistoryLibraryEntryId"
              value={apHistoryEntry.externalKey}
            />
          ) : null}

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
              placeholder="e.g., Rhetorical Analysis Essay"
              disabled={isSaving}
            />
          </div>

          {apHistoryEntry ? (
            <div className="space-y-2 rounded-lg border bg-muted/40 p-4">
              <div className="flex items-center justify-between gap-3">
                <Label>Selected APUSH Prompt</Label>
                <span className="text-xs font-medium uppercase text-muted-foreground">
                  {apHistoryEntry.essayType}
                </span>
              </div>
              <h3 className="text-base font-semibold">
                {apHistoryEntry.title}
              </h3>
              <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                {apHistoryEntry.prompt}
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="cs-prompt">Prompt</Label>
                <Textarea
                  id="cs-prompt"
                  name="prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={8}
                  placeholder="Paste or type the full assignment prompt for students…"
                  disabled={isSaving}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cs-tutor">Tutor Context (optional)</Label>
                <Textarea
                  id="cs-tutor"
                  name="tutorContext"
                  value={tutorContext}
                  onChange={(e) => setTutorContext(e.target.value)}
                  rows={4}
                  placeholder="Guidance for the tutor system prompt…"
                  disabled={isSaving}
                />
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="cs-due">Due Date (optional)</Label>
            <Input
              id="cs-due"
              type="date"
              name="dueDate"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              disabled={isSaving}
            />
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
              disabled={
                isSaving ||
                !selectedClassId ||
                (!isApHistoryAssignment && !prompt.trim())
              }
            >
              {isSaving ? 'Creating…' : 'Create Assignment'}
            </Button>
          </div>
        </fetcher.Form>
      </SheetContent>
    </Sheet>
  );
}
