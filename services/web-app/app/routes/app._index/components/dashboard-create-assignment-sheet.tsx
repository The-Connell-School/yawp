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
import { Checkbox } from '~/components/ui/checkbox';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Textarea } from '~/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import type { AssignmentTypeRow, TeacherClassOption } from '../route';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignmentTypes: AssignmentTypeRow[];
  teacherClasses: TeacherClassOption[];
};

export function DashboardCreateAssignmentSheet({
  open,
  onOpenChange,
  assignmentTypes,
  teacherClasses,
}: Props) {
  const fetcher = useFetcher<{ success?: boolean; message?: string }>();
  const [selectedAssignmentTypeId, setSelectedAssignmentTypeId] = useState(
    assignmentTypes[0]?.id ?? ''
  );
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [tutorContext, setTutorContext] = useState('');
  const [dueDate, setDueDate] = useState('');

  const isSaving = fetcher.state !== 'idle';

  useEffect(() => {
    if (!open) return;
    setSelectedAssignmentTypeId(assignmentTypes[0]?.id ?? '');
    setSelectedClassIds([]);
    setTitle('');
    setPrompt('');
    setTutorContext('');
    setDueDate('');
  }, [open, assignmentTypes]);

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data?.success) {
      onOpenChange(false);
    }
  }, [fetcher.state, fetcher.data, onOpenChange]);

  function toggleClass(classId: string) {
    setSelectedClassIds((prev) =>
      prev.includes(classId)
        ? prev.filter((id) => id !== classId)
        : [...prev, classId]
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>New Assignment</SheetTitle>
          <SheetDescription>
            Create an assignment for one or more of your classes.
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
            value={selectedAssignmentTypeId}
          />
          {selectedClassIds.map((id) => (
            <input key={id} type="hidden" name="classIds" value={id} />
          ))}

          <div className="space-y-2">
            <Label>Assignment type</Label>
            <Select
              value={selectedAssignmentTypeId}
              onValueChange={setSelectedAssignmentTypeId}
              disabled={isSaving}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select an assignment type" />
              </SelectTrigger>
              <SelectContent>
                {assignmentTypes.map((at) => (
                  <SelectItem key={at.id} value={at.id}>
                    {at.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Assign to</Label>
            <div className="space-y-2.5 rounded-md border p-3">
              {teacherClasses.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  You don&apos;t have any classes yet.
                </p>
              ) : (
                teacherClasses.map((klass) => (
                  <div key={klass.id} className="flex items-center gap-2.5">
                    <Checkbox
                      id={`dashboard-class-${klass.id}`}
                      checked={selectedClassIds.includes(klass.id)}
                      onCheckedChange={() => toggleClass(klass.id)}
                      disabled={isSaving}
                    />
                    <Label
                      htmlFor={`dashboard-class-${klass.id}`}
                      className="font-normal cursor-pointer"
                    >
                      {klass.name}
                    </Label>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dash-cs-title">Title (optional)</Label>
            <Input
              id="dash-cs-title"
              name="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Rhetorical Analysis Essay"
              disabled={isSaving}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dash-cs-prompt">Prompt</Label>
            <Textarea
              id="dash-cs-prompt"
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
            <Label htmlFor="dash-cs-tutor">Tutor Context (optional)</Label>
            <Textarea
              id="dash-cs-tutor"
              name="tutorContext"
              value={tutorContext}
              onChange={(e) => setTutorContext(e.target.value)}
              rows={4}
              placeholder="Guidance for the tutor system prompt…"
              disabled={isSaving}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dash-cs-due">Due Date (optional)</Label>
            <Input
              id="dash-cs-due"
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
                !selectedAssignmentTypeId ||
                selectedClassIds.length === 0 ||
                !prompt.trim()
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
