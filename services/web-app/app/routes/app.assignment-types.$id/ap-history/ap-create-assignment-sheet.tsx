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
import { type ApPrompt, ESSAY_TYPE_LABEL } from './types';

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
  selectedPrompt?: ApPrompt | null;
};

function classLabel(klass: TeacherClass) {
  return klass.title || `Grade ${klass.grade} • Period ${klass.period}`;
}

export function ApCreateAssignmentSheet({
  assignmentTypeId,
  teacherClasses,
  open,
  onOpenChange,
  selectedPrompt,
}: Props) {
  const fetcher = useFetcher<{ success?: boolean; message?: string }>();
  const [selectedClassId, setSelectedClassId] = useState(
    teacherClasses[0]?.id ?? ''
  );
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [essayType, setEssayType] = useState('dbq');
  const [timedMode, setTimedMode] = useState('untimed');
  const [durationMinutes, setDurationMinutes] = useState('60');
  const [dueDate, setDueDate] = useState('');

  const isSaving = fetcher.state !== 'idle';

  useEffect(() => {
    if (!open) return;
    setSelectedClassId(teacherClasses[0]?.id ?? '');
    setTitle('');
    setDueDate('');

    if (selectedPrompt) {
      setPrompt(selectedPrompt.promptBody);
      setEssayType(selectedPrompt.essayType);
      setTimedMode('untimed');
      setDurationMinutes(selectedPrompt.essayType === 'leq' ? '40' : '60');
    } else {
      setPrompt('');
      setEssayType('dbq');
      setTimedMode('untimed');
      setDurationMinutes('60');
    }
  }, [open, teacherClasses, selectedPrompt]);

  useEffect(() => {
    setDurationMinutes(essayType === 'leq' ? '40' : '60');
  }, [essayType]);

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data?.success) {
      onOpenChange(false);
    }
  }, [fetcher.state, fetcher.data, onOpenChange]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>
            New {ESSAY_TYPE_LABEL[essayType] ?? 'AP History'} Assignment
          </SheetTitle>
          <SheetDescription>
            Create a {essayType === 'dbq' ? 'Document-Based Question' : 'Long Essay Question'} assignment for one of your classes.
          </SheetDescription>
        </SheetHeader>

        <fetcher.Form
          method="post"
          action={
            selectedClassId ? `/app/my-classes/${selectedClassId}` : undefined
          }
          className="mt-6 space-y-4"
        >
          <input type="hidden" name="intent" value="create-assignment" />
          <input type="hidden" name="classId" value={selectedClassId} />
          <input type="hidden" name="assignmentTypeId" value={assignmentTypeId} />
          <input type="hidden" name="essayType" value={essayType} />
          <input type="hidden" name="timedMode" value={timedMode} />
          <input type="hidden" name="durationMinutes" value={durationMinutes} />

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

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Essay Type</Label>
              <Select
                value={essayType}
                onValueChange={setEssayType}
                disabled={isSaving || !!selectedPrompt}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dbq">DBQ</SelectItem>
                  <SelectItem value="leq">LEQ</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Mode</Label>
              <Select
                value={timedMode}
                onValueChange={setTimedMode}
                disabled={isSaving}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="untimed">Untimed</SelectItem>
                  <SelectItem value="timed">Timed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {timedMode === 'timed' ? (
            <div className="space-y-2">
              <Label htmlFor="ap-duration">Duration (minutes)</Label>
              <Input
                id="ap-duration"
                type="number"
                min={10}
                max={120}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
                disabled={isSaving}
              />
              <p className="text-xs text-muted-foreground">
                {essayType === 'dbq'
                  ? 'AP exam allows 60 minutes (15 reading + 45 writing)'
                  : 'AP exam allows 40 minutes'}
              </p>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="ap-title">Title (optional)</Label>
            <Input
              id="ap-title"
              name="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                essayType === 'dbq'
                  ? 'e.g., Reconstruction DBQ'
                  : 'e.g., Civil War LEQ'
              }
              disabled={isSaving}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ap-prompt">Prompt</Label>
            <Textarea
              id="ap-prompt"
              name="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={6}
              placeholder={
                essayType === 'dbq'
                  ? 'Evaluate the extent to which…'
                  : 'Compare and contrast…'
              }
              disabled={isSaving}
              required
            />
            {selectedPrompt ? (
              <p className="text-xs text-muted-foreground">
                Pre-filled from prompt library
                {selectedPrompt.essayType === 'dbq' && selectedPrompt.sourceCount > 0
                  ? ` (${selectedPrompt.sourceCount} source documents included)`
                  : ''}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="ap-due">Due Date (optional)</Label>
            <Input
              id="ap-due"
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
              disabled={isSaving || !selectedClassId || !prompt.trim()}
            >
              {isSaving ? 'Creating…' : 'Create Assignment'}
            </Button>
          </div>
        </fetcher.Form>
      </SheetContent>
    </Sheet>
  );
}
