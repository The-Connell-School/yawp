import { ChevronDown, ChevronRight, ClipboardPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  Link,
  data as dataResponse,
  useLoaderData,
  useNavigate,
  type LoaderFunctionArgs,
} from 'react-router';

import {
  AssignmentCreationSheet,
  WRITING_PRACTICE_TYPE_ID,
} from '~/components/assignments/assignment-creation-sheet';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/ui/card';
import { Checkbox } from '~/components/ui/checkbox';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '~/components/ui/collapsible';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { isCompositionPracticeEnabled } from '~/utils/writing-lessons/composition-flag.server';
import {
  getAssignedPracticeForStudent,
  getWritingPracticeAssignmentsForTeacher,
} from '~/utils/writing-lessons/practice-assignments.server';
import { getQuickWritingLessonSections } from '~/utils/writing-lessons/static-lessons.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);

  // Composition is behind its rollout flag; hide the whole section until on.
  const compositionEnabled = isCompositionPracticeEnabled();
  const sections = getQuickWritingLessonSections().filter(
    (section) => compositionEnabled || section.section !== 'Composition'
  );

  // The student's self-directed session is ACT multiple-choice only, so its
  // builder lists grammar skills exclusively. Teacher-assigned practice
  // supports both kinds: grammar skills drill ACT items and composition
  // skills are constructed response, mixed freely in one assignment.
  const grammarLessons = getQuickWritingLessonSections()
    .filter((section) => section.section === 'Grammar & Mechanics')
    .flatMap((section) => section.groups)
    .flatMap((group) => group.lessons);
  const assignableLessons = sections
    .flatMap((section) => section.groups)
    .flatMap((group) => group.lessons);

  // Flat skill list for the student "Create practice" builder.
  const practiceSkillOptions = grammarLessons.map((lesson) => ({
    slug: lesson.slug,
    title: lesson.title,
    category: lesson.category,
  }));

  const isTeacher = profile.role === 'TEACHER';

  const teacherClasses = isTeacher
    ? (
        await prisma.class.findMany({
          where: { teachers: { some: { id: profile.id } }, isArchived: false },
          select: { id: true, title: true, grade: true, period: true },
          orderBy: [{ grade: 'asc' }, { period: 'asc' }],
        })
      ).map((klass) => ({
        id: klass.id,
        title: klass.title,
        grade: klass.grade,
        period: klass.period,
      }))
    : [];
  const writingPracticeLessons = isTeacher
    ? assignableLessons.map((lesson) => ({
        slug: lesson.slug,
        title: lesson.title,
        category: lesson.category,
      }))
    : [];

  const assignedPractice =
    profile.role === 'STUDENT'
      ? (await getAssignedPracticeForStudent(profile.id)).map(
          (classAssignment) => ({
            id: classAssignment.id,
            title: classAssignment.assignment.title,
            problemCount: classAssignment.assignment.problemCount,
            dueAt: classAssignment.assignment.dueAt
              ? classAssignment.assignment.dueAt.toISOString()
              : null,
            completedCount: Math.min(
              classAssignment.attempts.length,
              classAssignment.assignment.problemCount
            ),
          })
        )
      : [];

  const assignedByTeacher =
    profile.role === 'TEACHER'
      ? (await getWritingPracticeAssignmentsForTeacher(profile.id)).map(
          (classAssignment) => ({
            id: classAssignment.id,
            title: classAssignment.assignment.title,
            problemCount: classAssignment.assignment.problemCount,
            dueAt: classAssignment.assignment.dueAt
              ? classAssignment.assignment.dueAt.toISOString()
              : null,
            classLabel:
              classAssignment.class.title ??
              `Grade ${classAssignment.class.grade} · Period ${classAssignment.class.period}`,
            attemptCount: classAssignment._count.attempts,
          })
        )
      : [];

  return dataResponse({
    sections,
    isTeacher,
    teacherClasses,
    writingPracticeLessons,
    practiceSkillOptions,
    assignedPractice,
    assignedByTeacher,
  });
}

const PRACTICE_PROBLEM_PRESETS = [3, 5, 10, 15] as const;

type PracticeSkillOption = { slug: string; title: string; category: string };

function StudentPracticeBuilder({
  open,
  onOpenChange,
  skills,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skills: PracticeSkillOption[];
}) {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string[]>([]);
  const [problemCount, setProblemCount] = useState('5');

  const grouped = useMemo(() => {
    const map = new Map<string, PracticeSkillOption[]>();
    for (const skill of skills) {
      const list = map.get(skill.category) ?? [];
      list.push(skill);
      map.set(skill.category, list);
    }
    return Array.from(map, ([category, items]) => ({ category, items }));
  }, [skills]);

  function toggle(slug: string) {
    setSelected((current) =>
      current.includes(slug)
        ? current.filter((value) => value !== slug)
        : [...current, slug]
    );
  }

  const parsedCount = Number(problemCount);
  const countValid =
    Number.isInteger(parsedCount) && parsedCount >= 1 && parsedCount <= 20;
  const canStart = selected.length > 0 && countValid;

  function start() {
    if (!canStart) return;
    const params = new URLSearchParams({
      skills: selected.join(','),
      count: String(parsedCount),
    });
    navigate(`/app/writing-lessons/practice?${params.toString()}`);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Create practice</SheetTitle>
          <SheetDescription>
            Pick the skills you want to work on and how many problems.
            We&rsquo;ll build a mixed set and give you feedback on every
            rewrite.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          <div className="space-y-2">
            <Label>Skills to practice</Label>
            <p className="text-sm text-muted-foreground">
              Pick one, or several to mix them into one set.
            </p>
            <div className="max-h-72 space-y-3 overflow-y-auto rounded-md border p-3">
              {grouped.map((group) => (
                <div key={group.category} className="space-y-1.5">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {group.category}
                  </p>
                  {group.items.map((skill) => (
                    <div key={skill.slug} className="flex items-center gap-2.5">
                      <Checkbox
                        id={`practice-skill-${skill.slug}`}
                        checked={selected.includes(skill.slug)}
                        onCheckedChange={() => toggle(skill.slug)}
                      />
                      <Label
                        htmlFor={`practice-skill-${skill.slug}`}
                        className="cursor-pointer font-normal"
                      >
                        {skill.title}
                      </Label>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>How many problems?</Label>
            <div className="flex flex-wrap items-center gap-2">
              {PRACTICE_PROBLEM_PRESETS.map((preset) => {
                const isSelected = problemCount === String(preset);
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setProblemCount(String(preset))}
                    aria-pressed={isSelected}
                    className={`h-9 w-12 rounded-md border text-sm transition ${
                      isSelected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background hover:bg-muted'
                    }`}
                  >
                    {preset}
                  </button>
                );
              })}
              <Input
                type="number"
                min={1}
                max={20}
                inputMode="numeric"
                aria-label="Custom number of problems"
                value={problemCount}
                onChange={(event) => setProblemCount(event.target.value)}
                className="h-9 w-20"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              You can keep going past this — the set never runs dry.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={start} disabled={!canStart}>
              Start practice
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function formatDueDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function TeacherDirections() {
  return (
    <section className="rounded-lg border bg-muted/40 p-4">
      <h3 className="mb-2 text-base font-semibold">
        How writing practice works
      </h3>
      <p className="mb-3 max-w-[70ch] text-sm text-muted-foreground">
        Open any lesson and choose “Assign to your classes” to send a short set
        of targeted rewrite drills. Students get instant, skill-specific
        feedback from the tutor — it guides them toward the fix without handing
        it over — and every attempt is saved. Track who has practiced and how
        they are doing under “Assigned by you.”
      </p>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        When to use it
      </p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-foreground/80">
        <li>
          Warm-ups or bell-ringers on a single skill (comma splices, passive
          voice…)
        </li>
        <li>Reteaching after you notice a recurring error in student essays</li>
        <li>Low-stakes practice between larger, graded writing assignments</li>
        <li>Mixed review that combines several skills at once</li>
      </ul>
    </section>
  );
}

export default function WritingLessonsIndexRoute() {
  const {
    sections,
    isTeacher,
    teacherClasses,
    writingPracticeLessons,
    practiceSkillOptions,
    assignedPractice,
    assignedByTeacher,
  } = useLoaderData<typeof loader>();
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);

  return (
    <section className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll">
      <div className="flex w-full justify-between border-b bg-secondary">
        <div className="mx-auto w-full max-w-screen-lg p-3 sm:p-5">
          <img
            src="/img/writing-fundamentals-cafe-cat.png"
            alt="A cat in a beret writing in a notebook at a Parisian café"
            data-testid="writing-fundamentals-banner"
            className="mb-4 h-32 w-full rounded-lg object-cover object-center sm:h-48"
          />
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-col">
              <p className="text-base font-medium text-primary sm:text-sm">
                Practice
              </p>
              <h2 className="mt-1">Writing Fundamentals Practice</h2>
              <p className="mt-3 max-w-full text-base text-muted-foreground sm:max-w-[620px] sm:text-sm">
                Focused lessons and quick rewrite drills for sentence control,
                grammar, and revision habits.
              </p>
            </div>
            {isTeacher ? (
              <>
                <Button
                  className="shrink-0 rounded-full"
                  onClick={() => setIsAssignOpen(true)}
                >
                  <ClipboardPlus className="mr-2 h-4 w-4" />
                  New practice assignment
                </Button>
                <AssignmentCreationSheet
                  open={isAssignOpen}
                  onOpenChange={setIsAssignOpen}
                  entryPoint="dashboard"
                  assignmentTypes={[]}
                  teacherClasses={teacherClasses}
                  initialAssignmentTypeId={WRITING_PRACTICE_TYPE_ID}
                  writingPracticeEnabled
                  writingPracticeLessons={writingPracticeLessons}
                />
              </>
            ) : (
              <>
                <Button
                  className="shrink-0 rounded-full"
                  onClick={() => setIsBuilderOpen(true)}
                >
                  Create practice
                </Button>
                <StudentPracticeBuilder
                  open={isBuilderOpen}
                  onOpenChange={setIsBuilderOpen}
                  skills={practiceSkillOptions}
                />
              </>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-screen-lg flex-col gap-8 px-3 py-6 pb-24 sm:px-5">
        {isTeacher ? <TeacherDirections /> : null}

        {assignedByTeacher.length > 0 ? (
          <section className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold">Assigned by you</h3>
              <Badge variant="secondary" size="sm">
                {assignedByTeacher.length}
              </Badge>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {assignedByTeacher.map((assignment) => (
                <Link
                  key={assignment.id}
                  to={`/app/writing-lessons/results/${assignment.id}`}
                  className="block h-full"
                  data-testid="assigned-by-teacher-card"
                >
                  <Card className="flex h-full flex-col shadow-none hover:shadow-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base leading-snug">
                        {assignment.title ?? 'Writing Fundamentals Practice'}
                      </CardTitle>
                      <CardDescription className="text-base sm:text-sm">
                        {assignment.classLabel} · {assignment.problemCount}{' '}
                        problems
                        {assignment.dueAt
                          ? ` · Due ${formatDueDate(assignment.dueAt)}`
                          : ''}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="mt-auto flex items-center justify-between gap-3 text-base text-muted-foreground sm:text-sm">
                      <span>{assignment.attemptCount} attempts</span>
                      <span className="inline-flex items-center gap-1">
                        View progress
                        <ChevronRight className="h-4 w-4 shrink-0" />
                      </span>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {assignedPractice.length > 0 ? (
          <section className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold">Assigned to you</h3>
              <Badge variant="secondary" size="sm">
                {assignedPractice.length}
              </Badge>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {assignedPractice.map((assignment) => {
                const complete =
                  assignment.completedCount >= assignment.problemCount;
                return (
                  <Link
                    key={assignment.id}
                    to={`/app/writing-lessons/assigned/${assignment.id}`}
                    className="block h-full"
                    data-testid="assigned-practice-card"
                  >
                    <Card className="flex h-full flex-col border-primary/40 shadow-none hover:shadow-sm">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base leading-snug">
                          {assignment.title ?? 'Writing Fundamentals Practice'}
                        </CardTitle>
                        <CardDescription className="text-base sm:text-sm">
                          {assignment.completedCount} of{' '}
                          {assignment.problemCount} problems done
                          {assignment.dueAt
                            ? ` · Due ${formatDueDate(assignment.dueAt)}`
                            : ''}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="mt-auto flex items-center justify-between gap-3 text-base text-muted-foreground sm:text-sm">
                        <Badge
                          variant={complete ? 'secondary' : 'default'}
                          size="sm"
                        >
                          {complete ? 'Complete' : 'Continue'}
                        </Badge>
                        <span className="inline-flex items-center gap-1">
                          {complete ? 'Review' : 'Start'}
                          <ChevronRight className="h-4 w-4 shrink-0" />
                        </span>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        ) : null}

        {sections.map((section) => {
          const sectionCount = section.groups.reduce(
            (total, group) => total + group.lessons.length,
            0
          );
          return (
            <Collapsible key={section.section} className="flex flex-col gap-5">
              <div className="flex items-center gap-2 border-b pb-2">
                <h3 className="flex-1 text-xl font-bold tracking-tight">
                  <CollapsibleTrigger className="group flex w-full items-center gap-2 text-left">
                    <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
                    {section.section}
                  </CollapsibleTrigger>
                </h3>
                <Badge variant="secondary" size="sm">
                  {sectionCount}
                </Badge>
              </div>
              <CollapsibleContent className="flex flex-col gap-5">
                {section.groups.map((group) => (
                  <section key={group.category} className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                        {group.category}
                      </h4>
                      <Badge variant="secondary" size="sm">
                        {group.lessons.length}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {group.lessons.map((lesson) => (
                        <Link
                          key={lesson.slug}
                          to={`/app/writing-lessons/${lesson.slug}`}
                          className="block h-full"
                        >
                          <Card className="h-full shadow-none hover:shadow-sm">
                            <CardHeader className="p-4">
                              <CardTitle className="text-base leading-snug">
                                {lesson.title}
                              </CardTitle>
                              <CardDescription className="text-base sm:text-sm">
                                {lesson.description}
                              </CardDescription>
                            </CardHeader>
                          </Card>
                        </Link>
                      ))}
                    </div>
                  </section>
                ))}
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    </section>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
