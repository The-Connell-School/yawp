import { getCreationTypeDefaultsById } from '~/domain/grading/writing-time.server';
import { type LoaderFunctionArgs, data as dataResponse } from 'react-router';
import {
  Form,
  Link,
  useFetcher,
  useLoaderData,
  useRevalidator,
  useRouteLoaderData,
  useNavigate,
} from 'react-router';
import { PenLine } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Route as RootRoute } from '../../+types/root';
import { AssignmentCreationSheet } from '~/components/assignments/assignment-creation-sheet';
import { Button } from '~/components/ui/button';
import { NoDataPlaceholder } from '~/components/no-data-placeholder.js';
import { useUser } from '~/hooks/useUser.js';
import { requireMembership, requireUserId } from '~/utils/auth.server.js';
import { prisma } from '~/utils/db.server.js';
import { getAvailableAssignmentTypesForScopes } from '~/utils/assignment-type-access.server';
import { AP_HISTORY_ASSIGNMENT_TYPE_KEY } from '~/domain/ap-history/schema';
import type { TeacherClassCardData } from '~/components/teacher-class-card';
import { StudentClassCard } from '~/components/student-class-card';
import { getTeacherClassCardStats } from '~/utils/teacher-class-card-stats.server';
import { getTeacherRecentActiveClassIds } from '~/utils/teacher-dashboard-recent-classes.server';
import { getStudentEnrolledClasses } from '~/utils/student-classes.server';
import {
  resolveSchoolYearScopeForMembership,
  schoolYearWhere,
} from '~/utils/school-year-scope.server';
import { AssignmentsAtAGlance } from './components/assignments-at-a-glance';
import { ClassesAtAGlance } from './components/classes-at-a-glance';
import { TeacherGradingAtAGlance } from './components/teacher-grading-at-a-glance';
import { formatClassLabel } from '~/utils/class-display';
import { writingPracticeAssignmentTitle } from '~/utils/writing-lessons/assignment-title';
import {
  computeAssignedProgress,
  getAssignedPracticeForStudent,
} from '~/utils/writing-lessons/practice-assignments.server';
import { getQuickWritingLessonBySlug } from '~/utils/writing-lessons/static-lessons.server';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { getGrammarGradingAssignmentTypeIds } from '~/domain/assignment-types/assignment-type-grading-config.server';

const DASHBOARD_MAX_TEACHER_CLASSES = 6;

function formatAssignmentDueDate(iso: string): string {
  // Render date-only consistently regardless of local timezone
  // by formatting in UTC (matches assignment due-date displays elsewhere).
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(iso));
}

export type AssignmentTypeRow = {
  id: string;
  title: string;
  systemKey?: string | null;
  collaborationSupported?: boolean;
  image?: { id: string } | null;
};

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  const useStudentExperience = profile.role === 'STUDENT';
  // The dashboard is the first thing either role sees, so it has to obey the
  // same school year everything else does.
  const schoolYearScope = await resolveSchoolYearScopeForMembership(
    request,
    profile
  );

  const studentClassCount = useStudentExperience
    ? ((
        await prisma.orgMembership.findUnique({
          where: { id: profile.id },
          select: { _count: { select: { classesAsStudent: true } } },
        })
      )?._count.classesAsStudent ?? 0)
    : 0;

  const isStudentOnlyWithNoClasses =
    useStudentExperience && !profile.isOrgOwner && studentClassCount === 0;

  // Student assignment types were only used for the retired "Write something new"
  // entry point. Students now start writing only from a class assignment.
  let studentAssignmentClassIds: string[] = [];
  if (useStudentExperience) {
    const studentClasses = await prisma.class.findMany({
      where: {
        students: { some: { id: profile.id } },
        ...schoolYearWhere(schoolYearScope),
      },
      select: { id: true },
    });
    studentAssignmentClassIds = studentClasses.map((klass) => klass.id);
  }

  const teacherAssignmentClassScopes = !useStudentExperience
    ? await prisma.class
        .findMany({
          where: {
            teachers: { some: { id: profile.id } },
            isArchived: false,
          },
          select: {
            id: true,
            school: { select: { id: true, organizationId: true } },
          },
        })
        .then((classes) =>
          classes.map((klass) => ({
            id: klass.id,
            organizationId: klass.school.organizationId,
            schoolId: klass.school.id,
            teacherProfileId: profile.id,
          }))
        )
    : [];
  const assignmentsEnabled = useStudentExperience
    ? studentAssignmentClassIds.length > 0
    : teacherAssignmentClassScopes.length > 0;

  const enrolledClasses = useStudentExperience
    ? await getStudentEnrolledClasses(profile.id, schoolYearScope)
    : [];

  const teacherClasses = !useStudentExperience
    ? await prisma.class.findMany({
        where: {
          teachers: { some: { id: profile.id } },
          isArchived: false,
          ...schoolYearWhere(schoolYearScope),
        },
        select: {
          id: true,
          grade: true,
          period: true,
          title: true,
          classArtIndex: true,
          classArtKey: true,
          school: { select: { id: true, name: true, organizationId: true } },
          _count: {
            select: { students: true, teachers: true, classAssignments: true },
          },
        },
      })
    : [];

  // Sort teacher classes with recent activity first.
  let teacherClassesOrdered: typeof teacherClasses = teacherClasses;
  let recentActiveClassIds: string[] = [];
  if (!useStudentExperience && teacherClasses.length > 0) {
    recentActiveClassIds = await getTeacherRecentActiveClassIds({
      teacherClassIds: teacherClasses.map((klass) => klass.id),
    });
    const recentClassIdRank = new Map(
      recentActiveClassIds.map((classId, index) => [classId, index])
    );
    teacherClassesOrdered = [...teacherClasses].sort((a, b) => {
      const aRank = recentClassIdRank.get(a.id);
      const bRank = recentClassIdRank.get(b.id);

      if (aRank !== undefined && bRank !== undefined) {
        return aRank - bRank;
      }
      if (aRank !== undefined) {
        return -1;
      }
      if (bRank !== undefined) {
        return 1;
      }

      return (
        (a.title ?? '').localeCompare(b.title ?? '') ||
        (a.grade ?? '').localeCompare(b.grade ?? '') ||
        (a.period ?? '').localeCompare(b.period ?? '')
      );
    });
  }

  const teacherClassStatsById = !useStudentExperience
    ? new Map(
        await Promise.all(
          teacherClasses.map(
            async (klass) =>
              [
                klass.id,
                {
                  stats: await getTeacherClassCardStats(klass.id),
                  assignments: klass._count.classAssignments,
                },
              ] as const
          )
        )
      )
    : new Map<
        string,
        {
          stats: Awaited<ReturnType<typeof getTeacherClassCardStats>>;
          assignments: number;
        }
      >();

  const teacherClassCards: TeacherClassCardData[] = !useStudentExperience
    ? teacherClassesOrdered
        .map((klass) => {
          const classStats = teacherClassStatsById.get(klass.id);
          return {
            id: klass.id,
            grade: klass.grade,
            period: klass.period,
            title: klass.title,
            classArtKey: klass.classArtKey,
            legacyClassArtIndex: klass.classArtIndex,
            school: { id: klass.school.id, name: klass.school.name },
            _count: {
              students: klass._count.students,
              assignments: klass._count.classAssignments,
            },
            stats: classStats?.stats,
          };
        })
        .slice(0, DASHBOARD_MAX_TEACHER_CLASSES)
    : [];

  const teacherWorkspaceClassStats = !useStudentExperience
    ? teacherClasses.map((klass) => {
        const classStats = teacherClassStatsById.get(klass.id);
        return {
          assignments: classStats?.assignments ?? 0,
          ungradedCount: classStats?.stats.ungradedCount ?? 0,
          gradedUnreleasedCount: classStats?.stats.gradedUnreleasedCount ?? 0,
        };
      })
    : [];

  const teacherAssignmentTypes =
    !useStudentExperience &&
    assignmentsEnabled &&
    teacherAssignmentClassScopes.length > 0
      ? await getAvailableAssignmentTypesForScopes<AssignmentTypeRow>({
          scopes: teacherAssignmentClassScopes,
          select: {
            id: true,
            title: true,
            collaborationSupported: true,
            systemKey: true,
            image: { select: { id: true } },
          },
          orderBy: { position: 'asc' },
        })
      : [];

  const enabledTeacherClasses =
    !useStudentExperience && assignmentsEnabled ? teacherClassesOrdered : [];
  const assignmentCreationClasses = enabledTeacherClasses;
  const creationTypeRows = teacherAssignmentTypes.filter(
    (type) => type.systemKey !== AP_HISTORY_ASSIGNMENT_TYPE_KEY
  );
  // One query for the whole list, so the creation sheet knows which types can
  // offer the teacher's grammar-grading toggle.
  const gradesGrammarIds = await getGrammarGradingAssignmentTypeIds(
    creationTypeRows.map((type) => type.id)
  );
  const creationTypeDefaults = await getCreationTypeDefaultsById(
    creationTypeRows.map((type) => type.id)
  );
  const assignmentCreationTypes = creationTypeRows.map((type) => ({
    id: type.id,
    title: type.title,
    // AssignmentTypeRow is shared with student-side selects that do not ask
    // for this column, so it is optional there and defaulted here.
    collaborationSupported: type.collaborationSupported ?? false,
    gradesGrammar: gradesGrammarIds.has(type.id),
    defaultWritingTimeMinutes:
      creationTypeDefaults.get(type.id)?.defaultWritingTimeMinutes ?? null,
    offersParagraphModes:
      creationTypeDefaults.get(type.id)?.offersParagraphModes ?? false,
  }));

  // A student's assigned Writing Fundamentals practice, surfaced on their
  // dashboard alongside their classes (each card links into the practice
  // runner). Grammar sets report answered progress; composition sets report
  // mastery.
  const writingPracticeAssignments =
    useStudentExperience
      ? (await getAssignedPracticeForStudent(profile.id))
          .map((classAssignment) => {
            const { assignment } = classAssignment;
            const progress = computeAssignedProgress(
              classAssignment.attempts.map((attempt) => ({
                promptId: attempt.promptId,
                lessonSlug: attempt.lessonSlug,
                status: attempt.status,
              }))
            );
            const hasComposition = assignment.lessonSlugs.some(
              (slug) =>
                getQuickWritingLessonBySlug(slug)?.section === 'Composition'
            );
            return {
              id: classAssignment.id,
              title: writingPracticeAssignmentTitle(assignment),
              problemCount: assignment.problemCount,
              dueAt: assignment.dueAt ? assignment.dueAt.toISOString() : null,
              hasComposition,
              doneCount: Math.min(progress.doneCount, assignment.problemCount),
              masteredCount: Math.min(
                progress.masteredCount,
                assignment.problemCount
              ),
              classLabel: {
                grade: classAssignment.class.grade,
                period: classAssignment.class.period,
                title: classAssignment.class.title,
              },
            };
          })
      : [];

  return dataResponse({
    requiresClassCode: isStudentOnlyWithNoClasses,
    enrolledClasses,
    writingPracticeAssignments,
    teacherClasses: teacherClassesOrdered,
    assignmentsEnabled,
    teacherClassCards,
    totalTeacherClassCount: teacherClasses.length,
    teacherWorkspaceClassStats,
    teacherAssignmentTypes,
    assignmentCreationClasses: assignmentCreationClasses.map((klass) => ({
      id: klass.id,
      name: formatClassLabel(klass),
    })),
    assignmentCreationTypes,
  });
}

export default function AppRoute() {
  const data = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const user = useUser();
  const rootData =
    useRouteLoaderData<RootRoute.ComponentProps['loaderData']>('root');
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);
  const [createAssignmentTypeId, setCreateAssignmentTypeId] = useState<
    string | undefined
  >();
  const isTeacher = user.selectedMembership?.role === 'TEACHER';
  const assignmentsEnabled = data.assignmentsEnabled ?? false;

  if (isTeacher) {
    const needsGradingCount = data.teacherWorkspaceClassStats.reduce(
      (total, klass) => total + (klass.ungradedCount ?? 0),
      0
    );
    const readyToReleaseCount = data.teacherWorkspaceClassStats.reduce(
      (total, klass) => total + (klass.gradedUnreleasedCount ?? 0),
      0
    );

    return (
      <section
        data-testid="app._index"
        className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll"
      >
        <div className="flex w-full justify-between border-b bg-secondary">
          <div className="mx-auto w-full max-w-screen-lg p-3 sm:p-5">
            <div className="flex flex-col">
              <h2>Welcome, {user.name}!</h2>
              <p className="mt-3 max-w-full text-muted-foreground sm:max-w-[400px]">
                Your classes, assignments, and grading in one place.
              </p>
            </div>
          </div>
        </div>
        <div className="mx-auto flex w-full max-w-screen-lg flex-col gap-8 px-3 py-6 pb-24 sm:px-5">
          <ClassesAtAGlance
            classes={data.teacherClassCards}
            totalClassCount={data.totalTeacherClassCount}
          />
          {assignmentsEnabled ? (
            <>
              <AssignmentsAtAGlance
                assignmentTypes={data.teacherAssignmentTypes}
                onCreateAssignment={() => {
                  setCreateAssignmentTypeId(undefined);
                  setIsCreateSheetOpen(true);
                }}
                onCreateAssignmentForType={(assignmentTypeId) => {
                  const assignmentType = data.teacherAssignmentTypes.find(
                    (type) => type.id === assignmentTypeId
                  );
                  if (
                    assignmentType?.systemKey === AP_HISTORY_ASSIGNMENT_TYPE_KEY
                  ) {
                    void navigate(`/app/assignment-types/${assignmentTypeId}`);
                    return;
                  }
                  setCreateAssignmentTypeId(assignmentTypeId);
                  setIsCreateSheetOpen(true);
                }}
              />
              <AssignmentCreationSheet
                open={isCreateSheetOpen}
                onOpenChange={(open) => {
                  setIsCreateSheetOpen(open);
                  if (!open) {
                    setCreateAssignmentTypeId(undefined);
                  }
                }}
                entryPoint="dashboard"
                assignmentTypes={data.assignmentCreationTypes}
                teacherClasses={data.assignmentCreationClasses}
                initialAssignmentTypeId={createAssignmentTypeId}
              />
            </>
          ) : null}
          <TeacherGradingAtAGlance
            needsGradingCount={needsGradingCount}
            readyToReleaseCount={readyToReleaseCount}
          />
        </div>
      </section>
    );
  }

  return (
    <>
      <section
        data-testid="app._index"
        className={`no-scrollbar flex h-full w-full flex-col overflow-y-scroll ${
          data.requiresClassCode ? 'pointer-events-none select-none' : ''
        }`}
      >
        <div className="flex w-full justify-between border-b bg-secondary">
          <div className="mx-auto w-full max-w-screen-lg p-3 sm:p-5">
            <div className="flex flex-col">
              <h2>Welcome, {user.name}!</h2>
              <p className="mt-3 max-w-full text-muted-foreground sm:max-w-[400px]">
                Welcome to your dashboard. Open a class to see your assignments
                and continue your writing.
              </p>
            </div>
          </div>
        </div>
        <div className="mx-auto w-full max-w-screen-lg px-3 py-3 pb-24 sm:px-5">
          <div className="flex flex-col">
            <p className="my-2 text-foreground/60">Classes</p>
            {data.enrolledClasses.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                {data.enrolledClasses.map((klass) => (
                  <StudentClassCard key={klass.id} klass={klass} />
                ))}
              </div>
            ) : (
              <NoDataPlaceholder
                title="No classes yet"
                subtitle="When your teacher adds you to a class, it will appear here."
              />
            )}
          </div>
          {data.writingPracticeAssignments.length > 0 ? (
            <div className="mt-8 flex flex-col">
              <p className="my-2 text-foreground/60">Writing practice</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                {data.writingPracticeAssignments.map((practice) => {
                  const remaining = practice.hasComposition
                    ? practice.problemCount - practice.masteredCount
                    : practice.problemCount - practice.doneCount;
                  const progressLabel = practice.hasComposition
                    ? `${practice.masteredCount} of ${practice.problemCount} mastered`
                    : `${practice.doneCount} of ${practice.problemCount} done`;
                  return (
                    <Link
                      to={`/app/writing-lessons/assigned/${practice.id}`}
                      key={practice.id}
                      data-testid="writing-practice-assignment-card"
                      className="flex h-full w-full flex-col rounded-lg border bg-muted text-left transition-shadow hover:shadow"
                    >
                      <div className="flex h-24 w-full flex-col justify-between rounded-t-lg bg-gradient-to-br from-primary/10 to-primary/25 px-3 py-2">
                        <span className="inline-flex w-fit items-center gap-1 rounded-full bg-background/70 px-2 py-0.5 text-[11px] font-medium text-primary">
                          <PenLine className="h-3 w-3" />
                          Writing practice
                        </span>
                        <p className="text-xs font-medium text-foreground/80">
                          {remaining > 0
                            ? `${remaining} problem${remaining === 1 ? '' : 's'} left`
                            : 'All done — nice work!'}
                        </p>
                      </div>
                      <div className="flex flex-1 flex-col gap-1 p-3">
                        <h4 className="font-medium text-foreground/90">
                          {practice.title}
                        </h4>
                        <p className="text-xs text-muted-foreground">
                          {progressLabel}
                          {practice.dueAt
                            ? ` • Due ${formatAssignmentDueDate(practice.dueAt)}`
                            : ''}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Grade {practice.classLabel.grade} • Period{' '}
                          {practice.classLabel.period}
                          {practice.classLabel.title
                            ? ` • ${practice.classLabel.title}`
                            : ''}
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </section>
      {data.requiresClassCode ? <ClassCodeGate /> : null}
    </>
  );
}

type ClassCodeFetcherData =
  | {
      status: 'select';
      code: string;
      classes: Array<{ id: string; label: string }>;
    }
  | { status: 'enrolled' }
  | { fieldErrors?: { code?: string; classId?: string } };

function ClassCodeGate() {
  const [isMounted, setIsMounted] = useState(false);
  const fetcher = useFetcher<ClassCodeFetcherData>();
  const revalidator = useRevalidator();
  const result = fetcher.data;
  const needsSelection =
    result && 'status' in result && result.status === 'select';

  useEffect(() => {
    if (result && 'status' in result && result.status === 'enrolled') {
      revalidator.revalidate();
    }
  }, [result, revalidator]);

  const fieldErrors =
    result && 'fieldErrors' in result ? result.fieldErrors : undefined;

  useEffect(() => setIsMounted(true), []);

  // Radix portals render under document.body. Waiting until hydration keeps
  // the server and first client tree identical; the dashboard itself is
  // already pointer-inert while this mounts.
  if (!isMounted) return null;

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent
        hideClose
        overlayClassName="bg-background/50 backdrop-blur-sm"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            {needsSelection ? 'Select your class' : 'Enter your class code'}
          </DialogTitle>
          <DialogDescription>
            {needsSelection
              ? 'Multiple classes use this code. Choose the class you are joining.'
              : 'Enter the code from your teacher to finish setting up your dashboard.'}
          </DialogDescription>
        </DialogHeader>

        <fetcher.Form
          method="post"
          action="/enter-code?modal=1"
          className="space-y-4"
        >
          {needsSelection ? (
            <>
              <input type="hidden" name="intent" value="assign-class" />
              <input type="hidden" name="code" value={result.code} />
              <label className="block space-y-2 text-sm font-medium">
                <span>Class</span>
                <select
                  name="classId"
                  required
                  autoFocus
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  defaultValue=""
                >
                  <option value="" disabled>
                    Select a class
                  </option>
                  {result.classes.map((klass) => (
                    <option key={klass.id} value={klass.id}>
                      {klass.label}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            <>
              <input type="hidden" name="intent" value="validate-code" />
              <label className="block space-y-2 text-sm font-medium">
                <span>Class code</span>
                <input
                  name="code"
                  required
                  autoFocus
                  autoComplete="off"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </label>
            </>
          )}
          {fieldErrors?.code || fieldErrors?.classId ? (
            <p className="text-sm text-destructive" role="alert">
              {fieldErrors.code ?? fieldErrors.classId}
            </p>
          ) : null}
          <Button
            className="w-full"
            type="submit"
            disabled={fetcher.state !== 'idle'}
          >
            {fetcher.state !== 'idle'
              ? 'Checking…'
              : needsSelection
                ? 'Join class'
                : 'Continue'}
          </Button>
        </fetcher.Form>

        <DialogFooter>
          <Form method="post" action="/auth/logout" className="w-full">
            <Button variant="outline" className="w-full" type="submit">
              Sign out
            </Button>
          </Form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
