import {
  type LoaderFunctionArgs,
  data as dataResponse,
  redirect,
} from 'react-router';
import { Form, Link, useLoaderData, useSearchParams } from 'react-router';
import { DocumentLink } from '~/components/document-link.js';
import { NoDataPlaceholder } from '~/components/no-data-placeholder.js';
import { useUser } from '~/hooks/useUser.js';
import { getAvailableAssignmentTypesForScopes } from '~/utils/assignment-type-access.server';
import { requireProfile, requireUserId } from '~/utils/auth.server.js';
import { prisma } from '~/utils/db.server.js';
import {
  getAssignmentCreationStandardizationEnabledClassIdsForContext,
  getAssignmentsEnabledClassIdsForContext,
} from '~/utils/feature-flags.server';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '~/components/ui/accordion';
import { Badge } from '~/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { formatDateOnly } from '~/utils/date-only';
import type { TeacherClassCardData } from '~/components/teacher-class-card';
import { getTeacherClassCardStats } from '~/utils/teacher-class-card-stats.server';
import { AssignmentTypesList } from './components/assignment-types-list';
import { ClassesAtAGlance } from './components/classes-at-a-glance';
import { TeacherAssignmentsList } from './components/teacher-assignments-list';

export type AssignmentTypeRow = {
  id: string;
  title: string;
  systemKey?: string | null;
  image?: { id: string } | null;
};

export type TeacherClassOption = {
  id: string;
  name: string;
};

export type TeacherAssignmentRow = {
  id: string;
  title: string | null;
  prompt: string;
  dueDate: Date | null;
  createdAt: Date;
  assignmentType: {
    id: string;
    title: string;
  };
  class: {
    id: string;
    grade: string;
    period: string;
    title: string | null;
  };
  _count: {
    documents: number;
  };
};

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);

  const isStudentOnlyWithNoClasses =
    profile.studentProfile &&
    !profile.teacherProfile &&
    !profile.isOwner &&
    profile.studentProfile.classes.length === 0;

  if (isStudentOnlyWithNoClasses) {
    return redirect('/enter-code');
  }

  // Determine which class IDs this student belongs to (for assignment fetching).
  let studentAssignmentClassIds: string[] = [];
  if (profile.studentProfile) {
    const studentClasses = await prisma.class.findMany({
      where: {
        students: { some: { id: profile.studentProfile.id } },
      },
      select: {
        id: true,
        school: { select: { id: true, organizationId: true } },
        teachers: { select: { id: true } },
      },
    });
    studentAssignmentClassIds = await getAssignmentsEnabledClassIdsForContext({
      organizationId: profile.organization.id,
      classes: studentClasses.map((klass) => ({
        id: klass.id,
        organizationId: klass.school.organizationId,
        schoolId: klass.school.id,
        teacherProfileIds: klass.teachers.map((teacher) => teacher.id),
      })),
    });
  }

  const teacherAssignmentClassScopes = profile.teacherProfile
    ? await prisma.class
        .findMany({
          where: {
            teachers: { some: { id: profile.teacherProfile.id } },
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
            teacherProfileId: profile.teacherProfile!.id,
          }))
        )
    : [];
  const teacherAssignmentClassIds = profile.teacherProfile
    ? await getAssignmentsEnabledClassIdsForContext({
        organizationId: profile.organization.id,
        teacherProfileId: profile.teacherProfile.id,
        classes: teacherAssignmentClassScopes.map((scope) => ({
          id: scope.id,
          organizationId: scope.organizationId,
          schoolId: scope.schoolId,
        })),
      })
    : [];
  const assignmentsEnabled =
    studentAssignmentClassIds.length > 0 ||
    teacherAssignmentClassIds.length > 0;
  const teacherAssignmentTypeScopes = profile.teacherProfile
    ? teacherAssignmentClassScopes.length > 0
      ? teacherAssignmentClassScopes.map((scope) => ({
          organizationId: scope.organizationId,
          schoolId: scope.schoolId,
          teacherProfileId: scope.teacherProfileId,
        }))
      : [
          {
            organizationId: profile.organization.id,
            teacherProfileId: profile.teacherProfile.id,
          },
        ]
    : [];

  const url = new URL(request.url);
  if (
    !assignmentsEnabled &&
    profile.studentProfile &&
    url.searchParams.get('tab') === 'assignments'
  ) {
    return redirect('/app');
  }

  const [
    courses,
    documents,
    archivedDocuments,
    studentProfiles,
    teacherClasses,
    teacherSchoolCount,
    assignments,
    teacherAssignments,
  ] = await Promise.all([
    profile.teacherProfile
      ? getAvailableAssignmentTypesForScopes<AssignmentTypeRow>({
          scopes: teacherAssignmentTypeScopes,
          select: {
            image: { select: { id: true } },
            id: true,
            title: true,
            systemKey: true,
          },
          orderBy: { position: 'asc' },
        })
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
      where: { profileId: profile.id, deletedAt: null, archivedAt: null },
      include: {
        assignmentModuleSessions: {
          include: { assignmentModule: true },
          orderBy: { assignmentModule: { position: 'desc' } },
        },
        submissions: {
          where: { archivedAt: null },
          select: {
            id: true,
            title: true,
            releasedAt: true,
          },
        },
      },
    }),
    prisma.document.findMany({
      orderBy: { archivedAt: 'desc' },
      where: {
        profileId: profile.id,
        deletedAt: null,
        archivedAt: { not: null },
      },
      include: {
        assignmentModuleSessions: {
          include: { assignmentModule: true },
          orderBy: { assignmentModule: { position: 'desc' } },
        },
        submissions: {
          where: { archivedAt: null },
          select: {
            id: true,
            title: true,
            releasedAt: true,
          },
        },
      },
    }),
    prisma.studentProfile.findMany({
      where: {
        classes: { some: { teachers: { some: { profileId: profile.id } } } },
      },
      include: { profile: { include: { documents: true } } },
    }),
    // Teacher classes and recent ordering
    profile?.teacherProfile
      ? prisma.class.findMany({
          where: {
            teachers: { some: { id: profile.teacherProfile.id } },
            isArchived: false,
          },
          select: {
            id: true,
            grade: true,
            period: true,
            title: true,
            school: { select: { id: true, name: true, organizationId: true } },
            _count: { select: { students: true, teachers: true, assignments: true } },
          },
        })
      : [],
    profile?.teacherProfile
      ? prisma.teacherProfile
          .findUnique({
            where: { id: profile.teacherProfile.id },
            select: { schools: { select: { id: true } } },
          })
          .then((tp) => tp?.schools.length ?? 0)
      : 0,
    profile.studentProfile && assignmentsEnabled
      ? prisma.assignment.findMany({
          where: {
            classId: { in: studentAssignmentClassIds },
          },
          select: {
            id: true,
            title: true,
            prompt: true,
            dueDate: true,
            class: {
              select: {
                id: true,
                grade: true,
                period: true,
                title: true,
              },
            },
            assignmentType: {
              select: {
                id: true,
                title: true,
              },
            },
          },
          orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
        })
      : [],
    profile.teacherProfile && assignmentsEnabled
      ? prisma.assignment.findMany({
          where: {
            class: {
              teachers: { some: { id: profile.teacherProfile.id } },
              isArchived: false,
              id: { in: teacherAssignmentClassIds },
            },
          },
          select: {
            id: true,
            title: true,
            prompt: true,
            dueDate: true,
            createdAt: true,
            assignmentType: {
              select: {
                id: true,
                title: true,
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
            _count: {
              select: {
                documents: true,
              },
            },
          },
          orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
        })
      : [],
  ]);

  // Compute recent activity per class for teachers, based on latest student document
  let teacherClassesOrdered: typeof teacherClasses = teacherClasses;
  if (profile.teacherProfile && teacherClasses.length > 0) {
    const recentDocs = await prisma.document.findMany({
      where: {
        deletedAt: null,
        profile: {
          studentProfile: {
            classes: {
              some: { teachers: { some: { id: profile.teacherProfile.id } } },
            },
          },
        },
      },
      select: {
        updatedAt: true,
        profile: {
          select: {
            studentProfile: { select: { classes: { select: { id: true } } } },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
    const latestByClass = new Map<string, Date>();
    for (const d of recentDocs) {
      const cid = d.profile.studentProfile?.classes[0]?.id;
      if (!cid) continue;
      if (!latestByClass.has(cid)) latestByClass.set(cid, d.updatedAt);
    }
    teacherClassesOrdered = [...teacherClasses].sort((a, b) => {
      const ad = latestByClass.get(a.id);
      const bd = latestByClass.get(b.id);
      if (ad && bd) return bd.getTime() - ad.getTime();
      if (ad) return -1;
      if (bd) return 1;
      return 0;
    });
  }

  const enabledTeacherClassesOrdered = profile.teacherProfile
    ? teacherClassesOrdered.filter((klass) =>
        teacherAssignmentClassIds.includes(klass.id)
      )
    : [];

  const teacherClassCards: TeacherClassCardData[] = profile.teacherProfile
    ? await Promise.all(
        teacherClassesOrdered.map(async (klass) => {
          const stats = await getTeacherClassCardStats(klass.id);
          return {
            id: klass.id,
            grade: klass.grade,
            period: klass.period,
            title: klass.title,
            school: klass.school,
            _count: {
              students: klass._count.students,
              assignments: klass._count.assignments,
            },
            stats,
          };
        })
      )
    : [];

  const teacherClassOptions: TeacherClassOption[] =
    enabledTeacherClassesOrdered.map((klass) => ({
      id: klass.id,
      name: klass.title || `Grade ${klass.grade} • Period ${klass.period}`,
    }));
  const standardizedTeacherClassIds = profile.teacherProfile
    ? new Set(
        await getAssignmentCreationStandardizationEnabledClassIdsForContext({
          organizationId: profile.organization.id,
          teacherProfileId: profile.teacherProfile.id,
          classes: enabledTeacherClassesOrdered.map((klass) => ({
            id: klass.id,
            organizationId: klass.school.organizationId,
            schoolId: klass.school.id,
          })),
        })
      )
    : new Set<string>();
  const standardizedTeacherClassOptions = teacherClassOptions.filter((klass) =>
    standardizedTeacherClassIds.has(klass.id)
  );
  const assignmentCreationStandardizationEnabled =
    standardizedTeacherClassOptions.length > 0;
  const teacherClassOptionsForCreate = assignmentCreationStandardizationEnabled
    ? standardizedTeacherClassOptions
    : teacherClassOptions;

  return dataResponse({
    courses,
    documents,
    archivedDocuments,
    studentProfiles,
    teacherClasses: teacherClassesOrdered,
    teacherSchoolCount,
    assignments,
    teacherAssignments,
    assignmentsEnabled,
    assignmentCreationStandardizationEnabled,
    assignmentTypes: courses,
    teacherClassCards,
    teacherClassOptions: teacherClassOptionsForCreate,
  });
}

export default function AppRoute() {
  const data = useLoaderData<typeof loader>();
  const user = useUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const isTeacher = user.selectedProfile?.teacherProfile !== null;
  const assignmentsEnabled = data.assignmentsEnabled ?? false;
  const currentStudentTab =
    assignmentsEnabled && searchParams.get('tab') === 'assignments'
      ? 'assignments'
      : 'courses';

  if (isTeacher) {
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
                Your classes and assignment types in one place.
              </p>
            </div>
          </div>
        </div>
        <div className="mx-auto flex w-full max-w-screen-lg flex-col gap-8 px-3 py-6 pb-24 sm:px-5">
          <ClassesAtAGlance classes={data.teacherClassCards} />
          <AssignmentTypesList
            assignmentTypes={data.assignmentTypes}
            teacherClasses={data.teacherClassOptions}
            assignmentCreationStandardizationEnabled={
              data.assignmentCreationStandardizationEnabled
            }
          />
          <TeacherAssignmentsList assignments={data.teacherAssignments} />
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
                  {data.assignments.map((assignment) => (
                    <Form
                      method="post"
                      action={`/app/assignments/${assignment.id}/start`}
                      key={assignment.id}
                    >
                      <button
                        type="submit"
                        className="flex h-full w-full flex-col rounded-lg border bg-muted text-left transition-shadow hover:shadow"
                      >
                        <div className="h-24 w-full rounded-t-lg bg-gradient-to-br from-foreground/5 to-foreground/20 px-3 py-2">
                          <p className="line-clamp-3 text-xs text-muted-foreground">
                            {assignment.prompt}
                          </p>
                        </div>
                        <div className="flex flex-1 flex-col gap-1 p-3">
                          <h4 className="text-foreground/90 font-medium">
                            {assignment.title?.trim() || 'Untitled Assignment'}
                          </h4>
                          <p className="text-xs text-muted-foreground">
                            {assignment.assignmentType.title}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Grade {assignment.class.grade} • Period{' '}
                            {assignment.class.period}
                            {assignment.class.title
                              ? ` • ${assignment.class.title}`
                              : ''}
                          </p>
                          {assignment.dueDate ? (
                            <div className="pt-1">
                              <Badge variant="outline" size="sm">
                                Due {formatDateOnly(assignment.dueDate)}
                              </Badge>
                            </div>
                          ) : null}
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
