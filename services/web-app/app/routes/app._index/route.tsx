import {
  type LoaderFunctionArgs,
  data as dataResponse,
  redirect,
} from 'react-router';
import { Form, Link, useLoaderData, useRouteLoaderData, useSearchParams } from 'react-router';
import { useState } from 'react';
import type { Route as RootRoute } from '../../+types/root';
import { AssignmentCreationSheet } from '~/components/assignments/assignment-creation-sheet';
import { DocumentLink } from '~/components/document-link.js';
import { NoDataPlaceholder } from '~/components/no-data-placeholder.js';
import { useUser } from '~/hooks/useUser.js';
import { requireMembership, requireUserId } from '~/utils/auth.server.js';
import {
  getStudentPreviewState,
  shouldUseStudentExperience,
} from '~/utils/student-preview.server';
import { prisma } from '~/utils/db.server.js';
import { getAvailableAssignmentTypesForScopes } from '~/utils/assignment-type-access.server';
import { AP_HISTORY_ASSIGNMENT_TYPE_KEY } from '~/domain/ap-history/schema';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '~/components/ui/accordion';
import { Tabs, TabsList, TabsTrigger } from '~/components/ui/tabs';
import type { TeacherClassCardData } from '~/components/teacher-class-card';
import { getTeacherClassCardStats } from '~/utils/teacher-class-card-stats.server';
import { getTeacherRecentActiveClassIds } from '~/utils/teacher-dashboard-recent-classes.server';
import {
  orderAssignmentModuleSessionsForCurrentStep,
  type AssignmentModuleSessionResumeCandidate,
} from '~/utils/assignment-module-session-resume';
import { AssignmentsAtAGlance } from './components/assignments-at-a-glance';
import { ClassesAtAGlance } from './components/classes-at-a-glance';
import { TeacherGradingAtAGlance } from './components/teacher-grading-at-a-glance';

const DASHBOARD_MAX_TEACHER_CLASSES = 6;

export type AssignmentTypeRow = {
  id: string;
  title: string;
  systemKey?: string | null;
  image?: { id: string } | null;
};

function formatClassLabel(klass: {
  grade: string;
  period: string | null;
  title: string | null;
}) {
  const base = klass.period
    ? `Grade ${klass.grade} • Period ${klass.period}`
    : `Grade ${klass.grade}`;
  return klass.title ? `${base} — ${klass.title}` : base;
}

function orderDocumentTileModuleSessions<
  T extends { assignmentModuleSessions: AssignmentModuleSessionResumeCandidate[] },
>(documents: T[]) {
  return documents.map((document) => ({
    ...document,
    assignmentModuleSessions: orderAssignmentModuleSessionsForCurrentStep(
      document.assignmentModuleSessions
    ),
  }));
}

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  const preview = await getStudentPreviewState(request);
  const useStudentExperience = shouldUseStudentExperience({
    membershipRole: profile.role,
    previewActive: preview.active,
  });

  const studentClassCount =
    useStudentExperience
      ? ((
          await prisma.orgMembership.findUnique({
            where: { id: profile.id },
            select: { _count: { select: { classesAsStudent: true } } },
          })
        )?._count.classesAsStudent ?? 0)
      : 0;

  const isStudentOnlyWithNoClasses =
    useStudentExperience &&
    !profile.isOrgOwner &&
    studentClassCount === 0;

  if (isStudentOnlyWithNoClasses) {
    return redirect('/enter-code');
  }

  // Determine which class IDs this student belongs to (for assignment fetching).
  let studentAssignmentClassIds: string[] = [];
  if (useStudentExperience) {
    const studentClasses = await prisma.class.findMany({
      where: {
        students: { some: { id: profile.id } },
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
  const assignmentsEnabled =
    useStudentExperience
      ? studentAssignmentClassIds.length > 0
      : teacherAssignmentClassScopes.length > 0;

  const [courses, documents, archivedDocuments, teacherClasses, assignments] =
    await Promise.all([
    !useStudentExperience
      ? ([] as AssignmentTypeRow[])
      : prisma.assignmentType.findMany({
          where: {
            archivedAt: null,
            organizationAssignments: {
              some: { organizationId: profile.organization.id },
            },
          },
          select: {
            image: { select: { id: true } },
            id: true,
            title: true,
            systemKey: true,
          },
          orderBy: { position: 'asc' },
        }),
    prisma.document.findMany({
      orderBy: { createdAt: 'desc' },
      where: { membershipId: profile.id, deletedAt: null, archivedAt: null },
      include: {
        assignmentModuleSessions: {
          include: {
            assignmentModule: {
              include: {
                instructions: { select: { id: true } },
              },
            },
          },
          orderBy: { assignmentModule: { position: 'desc' } },
        },
        submissions: {
          where: { archivedAt: null },
          orderBy: { submittedAt: 'desc' },
          select: {
            id: true,
            title: true,
            releasedAt: true,
            submittedAt: true,
          },
        },
      },
    }),
    prisma.document.findMany({
      orderBy: { archivedAt: 'desc' },
      where: {
        membershipId: profile.id,
        deletedAt: null,
        archivedAt: { not: null },
      },
      include: {
        assignmentModuleSessions: {
          include: {
            assignmentModule: {
              include: {
                instructions: { select: { id: true } },
              },
            },
          },
          orderBy: { assignmentModule: { position: 'desc' } },
        },
        submissions: {
          where: { archivedAt: null },
          orderBy: { submittedAt: 'desc' },
          select: {
            id: true,
            title: true,
            releasedAt: true,
            submittedAt: true,
          },
        },
      },
    }),
    // Teacher classes and recent ordering
    !useStudentExperience
      ? prisma.class.findMany({
          where: {
            teachers: { some: { id: profile.id } },
            isArchived: false,
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
      : [],
    useStudentExperience && assignmentsEnabled
      ? prisma.classAssignment.findMany({
          where: {
            classId: { in: studentAssignmentClassIds },
          },
          select: {
            id: true,
            assignment: {
              select: {
                id: true,
                title: true,
                prompt: true,
                assignmentType: {
                  select: {
                    id: true,
                    title: true,
                  },
                },
              },
            },
            class: {
              select: {
                id: true,
                grade: true,
                period: true,
                title: true,
              },
            },
          },
          orderBy: [{ createdAt: 'desc' }],
        })
      : [],
  ]);

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
        a.grade.localeCompare(b.grade) ||
        (a.period ?? '').localeCompare(b.period ?? '')
      );
    });
  }

  const teacherClassStatsById = !useStudentExperience
    ? new Map(
        await Promise.all(
          teacherClasses.map(async (klass) => [
            klass.id,
            {
              stats: await getTeacherClassCardStats(klass.id),
              assignments: klass._count.classAssignments,
            },
          ] as const)
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
            systemKey: true,
            image: { select: { id: true } },
          },
          orderBy: { position: 'asc' },
        })
      : [];

  const enabledTeacherClasses =
    !useStudentExperience && assignmentsEnabled ? teacherClassesOrdered : [];
  const assignmentCreationClasses = enabledTeacherClasses;
  const assignmentCreationTypes = teacherAssignmentTypes
    .filter((type) => type.systemKey !== AP_HISTORY_ASSIGNMENT_TYPE_KEY)
    .map((type) => ({
      id: type.id,
      title: type.title,
    }));

  return dataResponse({
    courses,
    documents: orderDocumentTileModuleSessions(documents),
    archivedDocuments: orderDocumentTileModuleSessions(archivedDocuments),
    teacherClasses: teacherClassesOrdered,
    assignments,
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
  const user = useUser();
  const rootData =
    useRouteLoaderData<RootRoute.ComponentProps['loaderData']>('root');
  const [searchParams, setSearchParams] = useSearchParams();
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);
  const [createAssignmentTypeId, setCreateAssignmentTypeId] = useState<
    string | undefined
  >();
  const studentPreviewActive = rootData?.studentPreview?.active ?? false;
  const isTeacher =
    user.selectedMembership?.role === 'TEACHER' && !studentPreviewActive;
  const assignmentsEnabled = data.assignmentsEnabled ?? false;
  const currentStudentTab =
    assignmentsEnabled && searchParams.get('tab') === 'assignments'
      ? 'assignments'
      : 'courses';

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
    <section
      data-testid="app._index"
      className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll"
    >
      <div className="flex w-full justify-between border-b bg-secondary">
        <div className="mx-auto w-full max-w-screen-lg p-3 sm:p-5">
          <div className="flex flex-col">
            <h2>Welcome, {user.name}!</h2>
            <p className="mt-3 max-w-full text-muted-foreground sm:max-w-[400px]">
              Welcome to your dashboard. Here you can view and manage your
              courses.
            </p>
          </div>
        </div>
      </div>
      <div className="mx-auto w-full max-w-screen-lg px-3 py-3 pb-24 sm:px-5">
        <div className="flex flex-col">
          {assignmentsEnabled ? (
            <div className="mb-2">
              <Tabs
                value={currentStudentTab}
                onValueChange={(value) => {
                  const next = new URLSearchParams(searchParams);
                  if (value === 'assignments') {
                    next.set('tab', 'assignments');
                  } else {
                    next.delete('tab');
                  }
                  setSearchParams(next, { replace: true });
                }}
              >
                <TabsList>
                  <TabsTrigger value="courses">
                    Courses ({data.courses.length})
                  </TabsTrigger>
                  <TabsTrigger value="assignments">
                    Assignments ({data.assignments.length})
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          ) : null}
          {currentStudentTab === 'courses' ? (
            <>
              <p className="my-2 text-foreground/60">Courses</p>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                {data.courses.map((course) => (
                  <Link
                    to={`/app/assignment-types/${course.id}`}
                    key={course.id}
                    className="flex flex-col rounded-lg border transition-shadow hover:shadow bg-muted"
                  >
                    {course.image ? (
                      <img
                        src={`/api/image/course/${course.image.id}`}
                        alt=""
                        className="h-32 w-auto rounded-t-lg object-cover"
                      />
                    ) : (
                      <div className="h-32 w-auto rounded-t-lg bg-gradient-to-br from-foreground/5 to-foreground/20" />
                    )}
                    <div className="max-w-42 flex items-center justify-between p-3">
                      <h4 className="text-foreground/90">{course.title}</h4>
                    </div>
                  </Link>
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="my-2 text-foreground/60">Assignments</p>
              {data.assignments.length > 0 ? (
                <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                  {data.assignments.map((classAssignment) => (
                    <Form
                      method="post"
                      action={`/app/class-assignments/${classAssignment.id}/start`}
                      key={classAssignment.id}
                    >
                      <button
                        type="submit"
                        className="flex h-full w-full flex-col rounded-lg border bg-muted text-left transition-shadow hover:shadow"
                      >
                        <div className="h-24 w-full rounded-t-lg bg-gradient-to-br from-foreground/5 to-foreground/20 px-3 py-2">
                          <p className="line-clamp-3 text-xs text-muted-foreground">
                            {classAssignment.assignment.prompt}
                          </p>
                        </div>
                        <div className="flex flex-1 flex-col gap-1 p-3">
                          <h4 className="text-foreground/90 font-medium">
                            {classAssignment.assignment.title?.trim() ||
                              'Untitled Assignment'}
                          </h4>
                          <p className="text-xs text-muted-foreground">
                            {classAssignment.assignment.assignmentType.title}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Grade {classAssignment.class.grade}
                            {classAssignment.class.period
                              ? ` • Period ${classAssignment.class.period}`
                              : ''}
                            {classAssignment.class.title
                              ? ` • ${classAssignment.class.title}`
                              : ''}
                          </p>
                        </div>
                      </button>
                    </Form>
                  ))}
                </div>
              ) : (
                <NoDataPlaceholder
                  title="No assignments"
                  subtitle="When your teacher posts assignments, they will appear here."
                />
              )}
            </>
          )}
        </div>
        <div className="mt-8 flex flex-col">
          <p className="my-2 text-foreground/60">Documents</p>
          {data.documents.length ? (
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {data.documents.map((doc) => (
                <DocumentLink
                  key={doc.id}
                  doc={doc}
                  exitTo="/app"
                  isStudentView
                />
              ))}
            </div>
          ) : (
            <NoDataPlaceholder
              title="No documents"
              subtitle="Select a course above to get started."
            />
          )}
          {data.archivedDocuments.length > 0 && (
            <div className="mt-6">
              <Accordion type="single" collapsible>
                <AccordionItem value="archived" className="border-none">
                  <AccordionTrigger className="text-sm text-muted-foreground hover:no-underline py-2">
                    View archived documents ({data.archivedDocuments.length})
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-4 pt-2">
                      {data.archivedDocuments.map((doc) => (
                        <DocumentLink
                          key={doc.id}
                          doc={doc}
                          exitTo="/app"
                          isArchived
                          isStudentView
                        />
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
