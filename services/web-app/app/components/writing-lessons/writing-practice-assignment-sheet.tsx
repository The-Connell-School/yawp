import { Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useFetcher } from 'react-router';

import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet';
import { Textarea } from '~/components/ui/textarea';

export type WritingPracticeAssignmentClass = {
  id: string;
  title: string | null;
  grade: string | null;
  period: string | null;
};

type AssignResult = {
  success: boolean;
  message: string;
  classCount?: number;
};

function classLabel(klass: WritingPracticeAssignmentClass) {
  if (klass.title?.trim()) return klass.title;

  const details = [
    klass.grade ? `Grade ${klass.grade}` : null,
    klass.period ? `Period ${klass.period}` : null,
  ].filter(Boolean);
  return details.join(' · ') || 'Class';
}

export function WritingPracticeAssignmentSheet({
  lesson,
  teacherClasses,
  onOpenChange,
}: {
  lesson: { slug: string; title: string };
  teacherClasses: WritingPracticeAssignmentClass[];
  onOpenChange: (open: boolean) => void;
}) {
  const fetcher = useFetcher<AssignResult>();
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [title, setTitle] = useState(`${lesson.title} practice`);
  const [dueAt, setDueAt] = useState('');
  const [problemCount, setProblemCount] = useState('5');
  const isSubmitting = fetcher.state !== 'idle';
  const parsedProblemCount = Number(problemCount);
  const canSubmit =
    !isSubmitting &&
    title.trim().length > 0 &&
    dueAt.length > 0 &&
    selectedClassIds.length > 0 &&
    Number.isInteger(parsedProblemCount) &&
    parsedProblemCount >= 1 &&
    parsedProblemCount <= 20;
  const classOptions = useMemo(
    () =>
      teacherClasses.map((klass) => ({ ...klass, label: classLabel(klass) })),
    [teacherClasses]
  );

  function toggleClass(classId: string, checked: boolean) {
    setSelectedClassIds((current) =>
      checked
        ? [...new Set([...current, classId])]
        : current.filter((id) => id !== classId)
    );
  }

  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Assign {lesson.title}</SheetTitle>
          <SheetDescription>
            Create a focused writing-practice assignment from this lesson.
          </SheetDescription>
        </SheetHeader>

        <fetcher.Form
          method="post"
          action="/app/writing-lessons/assign"
          className="mt-6 flex flex-col gap-5"
        >
          <input type="hidden" name="lessonSlugs" value={lesson.slug} />
          {selectedClassIds.map((classId) => (
            <input
              key={classId}
              type="hidden"
              name="classIds"
              value={classId}
            />
          ))}

          <div className="space-y-2">
            <Label htmlFor="writing-practice-title">Assignment title</Label>
            <Input
              id="writing-practice-title"
              name="title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
            />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Assign to</legend>
            {classOptions.length > 0 ? (
              <div className="space-y-2 rounded-lg border p-3">
                {classOptions.map((klass) => (
                  <div key={klass.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`writing-practice-class-${klass.id}`}
                      checked={selectedClassIds.includes(klass.id)}
                      onCheckedChange={(checked) =>
                        toggleClass(klass.id, checked === true)
                      }
                    />
                    <Label
                      htmlFor={`writing-practice-class-${klass.id}`}
                      className="font-normal"
                    >
                      {klass.label}
                    </Label>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                You do not have an active class to assign this lesson to.
              </p>
            )}
          </fieldset>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="writing-practice-due-at">Due date</Label>
              <Input
                id="writing-practice-due-at"
                name="dueAt"
                type="date"
                value={dueAt}
                onChange={(event) => setDueAt(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="writing-practice-problem-count">
                Number of problems
              </Label>
              <Input
                id="writing-practice-problem-count"
                name="problemCount"
                type="number"
                min={1}
                max={20}
                value={problemCount}
                onChange={(event) => setProblemCount(event.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="writing-practice-instructions">
              Instructions{' '}
              <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="writing-practice-instructions"
              name="instructions"
              placeholder="Add any directions for your students."
            />
          </div>

          <Button type="submit" disabled={!canSubmit}>
            {isSubmitting ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : null}
            {isSubmitting ? 'Assigning…' : 'Assign practice'}
          </Button>

          {fetcher.data ? (
            <p
              className={
                fetcher.data.success
                  ? 'text-sm text-emerald-700'
                  : 'text-sm text-destructive'
              }
              role="status"
            >
              {fetcher.data.message}
            </p>
          ) : null}
        </fetcher.Form>
      </SheetContent>
    </Sheet>
  );
}
