import {
  type LoaderFunctionArgs,
  data as dataResponse,
  redirect,
} from 'react-router';
import { Form, Link, useLoaderData, useSearchParams } from 'react-router';
import { DocumentLink } from '~/components/document-link.js';
import { NoDataPlaceholder } from '~/components/no-data-placeholder.js';
import { useUser } from '~/hooks/useUser.js';
import { requireProfile, requireUserId } from '~/utils/auth.server.js';
import { prisma } from '~/utils/db.server.js';
import { isAssignmentsEnabledForOrganization } from '~/utils/feature-flags.server';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '~/components/ui/accordion';
import { Badge } from '~/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { formatDateOnly } from '~/utils/date-only';
import { AssignmentTypesList } from './components/assignment-types-list';
import { ClassesAtAGlance } from './components/classes-at-a-glance';

export type AssignmentTypeRow = {
  id: string;
  title: string;
  image?: { id: string } | null;
};

export type CourseGlanceRow = {
  id: string;
  name: string;
  inProgress: number;
  submitted: number;
  graded: number;
  released: number;
};

export type TeacherClassOption = {
  id: string;
  name: string;
};

// Preview-only mock: surfaces the AP History Essay AssignmentType on the
// teacher dashboard so reviewers can see the v1 spec rendered as a card
// alongside existing AssignmentTypes. Tied to PR #115 (AP history spec v1,
// stacked on PR #108). Remove when the real AssignmentType lands.
const PREVIEW_AP_HISTORY_ESSAY: AssignmentTypeRow = {
  id: 'preview-ap-history-essay',
  title: 'AP History Essay',
  image: null,
};

function hasMeaningfulGrade(grade: {
  score: string | null;
  feedback: string | null;
  rubricScores?: unknown | null;
  overallComment?: string | null;
  numericPercentage?: number | null;
  letterGrade?: string | null;
}) {
  return Boolean(
    grade.score ||
      grade.feedback ||
      grade.overallComment ||
      grade.letterGrade ||
      grade.numericPercentage !== null ||
      (grade.rubricScores &&
        typeof grade.rubricScores === 'object' &&
        Object.keys(grade.rubricScores as Record<string, unknown>).length > 0)
  );
}

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

  const assignmentsEnabled = await isAssignmentsEnabledForOrganization(
    profile.organization.id
  );

  const url = new URL(request.url);
  if (
    !assignmentsEnabled &&
    profile.studentProfile &&
    url.searchParams.get('tab') === 'assignments'
  ) {
    return redirect('/app');
  }

  let allowedCourseIds: string[] | null = null;
  let studentClassIds: string[] = [];
  if (profile.studentProfile) {
    const studentClasses = await prisma.class.findMany({
      where: {
        students: { some: { id: profile.studentProfile.id } },
      },
      include: {
        allowedStudentCourses: {
          select: { studentCourseId: true },
        },
      },
    });
    studentClassIds = studentClasses.map((klass) => klass.id);
    const courseIdSet = new Set<string>();
    studentClasses.forEach((cls) => {
      cls.allowedStudentCourses.forEach((asc) => {
        courseIdSet.add(asc.studentCourseId);
      });
    });
    if (courseIdSet.size > 0) {
      allowedCourseIds = Array.from(courseIdSet);
    }
  }

  let teacherCourseWhere:
    | { assignedTeachers: { some: { id: string } } }
    | undefined = undefined;
  if (profile.teacherProfile) {
    const assignmentCounts = await prisma.teacherProfile.findUnique({
      where: { id: profile.teacherProfile.id },
      select: { _count: { select: { assignedTeacherCourses: true } } },
    });
    const hasAssignedCourses =
      (assignmentCounts?._count.assignedTeacherCourses ?? 0) > 0;
    if (hasAssignedCourses) {
      teacherCourseWhere = {
        assignedTeachers: { some: { id: profile.teacherProfile.id } },
      };
    }
  }

  const [
    courses,
    documents,
    archivedDocuments,
    studentProfiles,
    teacherCourses,
    teacherClasses,
    teacherSchoolCount,
    assignments,
  ] = await Promise.all([
    prisma.studentCourse.findMany({
      where: allowedCourseIds ? { id: { in: allowedCourseIds } } : undefined,
      select: { image: { select: { id: true } }, id: true, title: true },
      orderBy: { position: 'asc' },
    }),
    prisma.document.findMany({
      orderBy: { createdAt: 'desc' },
      where: { profileId: profile.id, deletedAt: null, archivedAt: null },
      include: {
        studentCourseModuleSessions: {
          include: { studentCourseModule: true },
          orderBy: { studentCourseModule: { position: 'desc' } },
        },
        submissions: {
          where: { archivedAt: null },
          select: { id: true, title: true, releasedAt: true },
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
        studentCourseModuleSessions: {
          include: { studentCourseModule: true },
          orderBy: { studentCourseModule: { position: 'desc' } },
        },
        submissions: {
          where: { archivedAt: null },
          select: { id: true, title: true, releasedAt: true },
        },
      },
    }),
    prisma.studentProfile.findMany({
      where: {
        classes: { some: { teachers: { some: { profileId: profile.id } } } },
      },
      include: { profile: { include: { documents: true } } },
    }),
    profile?.teacherProfile
      ? prisma.teacherCourse.findMany({
          where: teacherCourseWhere,
          select: {
            image: { select: { id: true } },
            id: true,
            title: true,
            description: true,
            teacherCourseModules: {
              select: {
                id: true,
                title: true,
                videoDuration: true,
                teacherCourseModuleSessions: {
                  where: { teacherProfileId: profile.teacherProfile.id },
                  select: { videoTimestamp: true },
                },
              },
              orderBy: { position: 'asc' },
            },
          },
          orderBy: { position: 'asc' },
        })
      : [],
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
            school: { select: { name: true } },
            _count: { select: { students: true, teachers: true } },
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
          where: { classId: { in: studentClassIds } },
          select: {
            id: true,
            title: true,
            prompt: true,
            dueDate: true,
            class: { select: { id: true, grade: true, period: true, title: true } },
            studentCourse: { select: { id: true, title: true } },
          },
          orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
        })
      : [],
  ]);

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

  const [assignmentTypesFromDb, coursesGlance] = profile.teacherProfile
    ? await Promise.all([
        prisma.studentCourse.findMany({
          where: {
            allowedInClasses: {
              some: {
                class: {
                  teachers: { some: { id: profile.teacherProfile.id } },
                  isArchived: false,
                },
              },
            },
          },
          select: { id: true, title: true, image: { select: { id: true } } },
          orderBy: { position: 'asc' },
        }),
        Promise.all(
          teacherClassesOrdered.map(async (klass) => {
            const [submissions, inProgressCount] = await Promise.all([
              prisma.submission.findMany({
                where: {
                  archivedAt: null,
                  document: { classId: klass.id, deletedAt: null },
                },
                select: {
                  score: true,
                  feedback: true,
                  rubricScores: true,
                  overallComment: true,
                  numericPercentage: true,
                  letterGrade: true,
                  releasedAt: true,
                },
              }),
              prisma.document.count({
                where: {
                  classId: klass.id,
                  deletedAt: null,
                  archivedAt: null,
                  submissions: { none: { archivedAt: null } },
                },
              }),
            ]);
            return {
              id: klass.id,
              name:
                klass.title ||
                `Grade ${klass.grade} • Period ${klass.period}`,
              inProgress: inProgressCount,
              submitted: submissions.filter(
                (s) => !hasMeaningfulGrade(s) && !s.releasedAt
              ).length,
              graded: submissions.filter(
                (s) => hasMeaningfulGrade(s) && !s.releasedAt
              ).length,
              released: submissions.filter((s) => s.releasedAt !== null).length,
            } satisfies CourseGlanceRow;
          })
        ),
      ])
    : [[] as AssignmentTypeRow[], [] as CourseGlanceRow[]];

  const assignmentTypes: AssignmentTypeRow[] = profile.teacherProfile
    ? [PREVIEW_AP_HISTORY_ESSAY, ...assignmentTypesFromDb]
    : assignmentTypesFromDb;

  const teacherClassOptions: TeacherClassOption[] = teacherClassesOrdered.map(
    (klass) => ({
      id: klass.id,
      name: klass.title || `Grade ${klass.grade} • Period ${klass.period}`,
    })
  );

  return dataResponse({
    courses,
    documents,
    archivedDocuments,
    studentProfiles,
    teacherCourses,
    teacherClasses: teacherClassesOrdered,
    teacherSchoolCount,
    assignments,
    assignmentsEnabled,
    assignmentTypes,
    coursesGlance,
    teacherClassOptions,
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
      <section className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll">
        <div className="flex w-full justify-between border-b bg-secondary">
          <div className="mx-auto w-full max-w-screen-lg p-3 sm:p-5">
            <div className="flex flex-col">
              <h2>Welcome, {user.name}!</h2>
              <p className="mt-3 max-w-full text-muted-foreground sm:max-w-[400px]">
                Your assignment types and class progress, all in one place.
              </p>
            </div>
          </div>
        </div>
        <div className="mx-auto w-full max-w-screen-lg px-3 py-6 pb-24 sm:px-5 flex flex-col gap-8">
          <AssignmentTypesList
            assignmentTypes={data.assignmentTypes}
            teacherClasses={data.teacherClassOptions}
          />
          <ClassesAtAGlance courses={data.coursesGlance} />
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
                    to={`/app/courses/${course.id}`}
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
                            {assignment.studentCourse.title}
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
