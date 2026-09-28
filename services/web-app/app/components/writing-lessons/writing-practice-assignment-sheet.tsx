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
import {
  PracticeSkillPicker,
  type PracticeSkillOption,
} from '~/components/writing-lessons/practice-skill-picker';

const MIN_PROBLEM_COUNT = 1;
const MAX_PROBLEM_COUNT = 20;

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

/**
 * A default the teacher can keep: the skill's own name while the set covers
 * one skill, and the mix itself once it covers several — "Passive Voice
 * practice" would misname a set that is half comma splices.
 */
export function suggestWritingPracticeTitle(lessonTitles: string[]): string {
  if (lessonTitles.length === 1) return `${lessonTitles[0]} practice`;
  if (lessonTitles.length > 1) return 'Mixed writing practice';
  return 'Writing practice';
}

/**
 * Everything `/app/writing-lessons/assign` requires. Checked here so the
 * teacher is told by a disabled button rather than a rejected round trip.
 */
export function canSubmitWritingPracticeAssignment({
  title,
  dueAt,
  lessonSlugs,
  classIds,
  problemCount,
  isSubmitting,
}: {
  title: string;
  dueAt: string;
  lessonSlugs: string[];
  classIds: string[];
  problemCount: string;
  isSubmitting: boolean;
}): boolean {
  const parsedProblemCount = Number(problemCount);
  return (
    !isSubmitting &&
    title.trim().length > 0 &&
    dueAt.length > 0 &&
    lessonSlugs.length > 0 &&
    classIds.length > 0 &&
    Number.isInteger(parsedProblemCount) &&
    parsedProblemCount >= MIN_PROBLEM_COUNT &&
    parsedProblemCount <= MAX_PROBLEM_COUNT
  );
}

/**
 * Assigning writing practice. Opened from a lesson it assigns that lesson;
 * opened from the practice page it takes a set of skills, which is how a
 * teacher assigns mixed practice — several skills interleaved into one set.
 */
export function WritingPracticeAssignmentSheetContent({
  lesson,
  skillOptions,
  teacherClasses,
  onOpenChange,
}: {
  lesson?: { slug: string; title: string };
  skillOptions?: PracticeSkillOption[];
  teacherClasses: WritingPracticeAssignmentClass[];
  onOpenChange: (open: boolean) => void;
}) {
  const fetcher = useFetcher<AssignResult>();
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>(
    lesson ? [lesson.slug] : []
  );
  const [title, setTitle] = useState(
    lesson
      ? suggestWritingPracticeTitle([lesson.title])
      : suggestWritingPracticeTitle([])
  );
  // Once a teacher names the set themselves, changing the skills must not
  // overwrite what they typed.
  const [titleEdited, setTitleEdited] = useState(false);
  const [dueAt, setDueAt] = useState('');
  const [problemCount, setProblemCount] = useState('5');
  const isSubmitting = fetcher.state !== 'idle';

  const lessonSlugs = lesson ? [lesson.slug] : selectedSlugs;
  const canSubmit = canSubmitWritingPracticeAssignment({
    title,
    dueAt,
    lessonSlugs,
    classIds: selectedClassIds,
    problemCount,
    isSubmitting,
  });

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

  function changeSkills(slugs: string[]) {
    setSelectedSlugs(slugs);
    if (titleEdited) return;
    const titles = slugs.map(
      (slug) =>
        (skillOptions ?? []).find((option) => option.slug === slug)?.title ??
        slug
    );
    setTitle(suggestWritingPracticeTitle(titles));
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>
          {lesson ? `Assign ${lesson.title}` : 'Create an assignment'}
        </SheetTitle>
        <SheetDescription>
          {lesson
            ? 'Create a focused writing-practice assignment from this lesson.'
            : 'Pick the skills to cover. Choose more than one and your students get a mixed set that interleaves them.'}
        </SheetDescription>
      </SheetHeader>

      <fetcher.Form
        method="post"
        action="/app/writing-lessons/assign"
        className="mt-6 flex flex-col gap-5"
      >
        {lessonSlugs.map((slug) => (
          <input key={slug} type="hidden" name="lessonSlugs" value={slug} />
        ))}
        {selectedClassIds.map((classId) => (
          <input key={classId} type="hidden" name="classIds" value={classId} />
        ))}

        {lesson ? null : (
          <div className="space-y-2">
            <Label>Skills to practice</Label>
            <p className="text-sm text-muted-foreground">
              Pick one, or several to mix them into one set.
            </p>
            <PracticeSkillPicker
              skills={skillOptions ?? []}
              selected={selectedSlugs}
              onSelectedChange={changeSkills}
            />
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="writing-practice-title">Assignment title</Label>
          <Input
            id="writing-practice-title"
            name="title"
            value={title}
            onChange={(event) => {
              setTitleEdited(true);
              setTitle(event.target.value);
            }}
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
                    data-testid={`writing-practice-class-${klass.id}`}
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
              min={MIN_PROBLEM_COUNT}
              max={MAX_PROBLEM_COUNT}
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
            data-testid="writing-practice-assign-result"
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
    </>
  );
}

export function WritingPracticeAssignmentSheet({
  lesson,
  skillOptions,
  teacherClasses,
  onOpenChange,
}: {
  lesson?: { slug: string; title: string };
  skillOptions?: PracticeSkillOption[];
  teacherClasses: WritingPracticeAssignmentClass[];
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <WritingPracticeAssignmentSheetContent
          lesson={lesson}
          skillOptions={skillOptions}
          teacherClasses={teacherClasses}
          onOpenChange={onOpenChange}
        />
      </SheetContent>
    </Sheet>
  );
}
