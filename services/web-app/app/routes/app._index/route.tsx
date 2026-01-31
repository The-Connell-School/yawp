import {
  type LoaderFunctionArgs,
  data as dataResponse,
  redirect,
} from 'react-router';
import { Link, useLoaderData } from 'react-router';
import { DocumentLink } from '~/components/document-link.js';
import { NoDataPlaceholder } from '~/components/no-data-placeholder.js';
import { useUser } from '~/hooks/useUser.js';
import { requireProfile, requireUserId } from '~/utils/auth.server.js';
import { prisma } from '~/utils/db.server.js';
import { cn } from '~/utils/misc';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '~/components/ui/accordion';

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

  // Determine which student courses to show
  let allowedCourseIds: string[] | null = null;
  if (profile.studentProfile) {
    const studentClasses = await prisma.class.findMany({
      where: {
        students: { some: { id: profile.studentProfile.id } },
      },
      include: {
        allowedStudentCourses: {
          select: {
            studentCourseId: true,
          },
        },
      },
    });

    // Collect all allowed course IDs from all classes
    const courseIdSet = new Set<string>();
    studentClasses.forEach((cls) => {
      cls.allowedStudentCourses.forEach((asc) => {
        courseIdSet.add(asc.studentCourseId);
      });
    });

    // If we found specific courses, use them; otherwise show all (fallback)
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
        submittedSnapshot: {
          select: {
            grades: {
              select: {
                score: true,
                overallScore: true,
                releasedAt: true,
              },
              take: 1,
            },
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
        studentCourseModuleSessions: {
          include: { studentCourseModule: true },
          orderBy: { studentCourseModule: { position: 'desc' } },
        },
        submittedSnapshot: {
          select: {
            grades: {
              select: {
                score: true,
                overallScore: true,
                releasedAt: true,
              },
              take: 1,
            },
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
    // Fetch teacher courses if user has teacher profile
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
                  where: {
                    teacherProfileId: profile.teacherProfile.id,
                  },
                  select: {
                    videoTimestamp: true,
                  },
                },
              },
              orderBy: { position: 'asc' },
            },
          },
          orderBy: { position: 'asc' },
        })
      : [],
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

  return dataResponse({
    courses,
    documents,
    archivedDocuments,
    studentProfiles,
    teacherCourses,
    teacherClasses: teacherClassesOrdered,
    teacherSchoolCount,
  });
}

export default function AppRoute() {
  const data = useLoaderData<typeof loader>();
  const user = useUser();
  const isTeacher = user.selectedProfile?.teacherProfile !== null;

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
                Welcome to your teacher dashboard. Manage students, view
                resources, and more.
              </p>
            </div>
          </div>
        </div>
        <div className="mx-auto w-full max-w-screen-lg px-3 py-3 pb-24 sm:px-5">
          <div className="mt-8 flex flex-col">
            <div className="mb-1 flex items-center gap-1">
              <p className="text-foreground/60">My Classes</p>
            </div>
            {Array.isArray(data.teacherClasses) &&
            data.teacherClasses.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                {data.teacherClasses.map((klass) => (
                  <Link
                    key={klass.id}
                    to={`/app/my-classes/${klass.id}`}
                    className="flex flex-col rounded-lg border bg-muted p-4 hover:shadow transition"
                  >
                    <div className="flex items-baseline justify-between">
                      <h4 className="text-foreground/90 font-medium">
                        Grade {klass.grade} • Period {klass.period}
                      </h4>
                    </div>
                    {klass.title && (
                      <p className="text-sm font-medium mt-1">{klass.title}</p>
                    )}
                    {(data.teacherSchoolCount ?? 0) === 1 ? null : (
                      <p className="text-sm text-muted-foreground mt-1">
                        {klass.school?.name ?? 'School'}
                      </p>
                    )}
                    <div className="mt-3 flex items-center gap-4 text-sm text-muted-foreground">
                      <span>{klass._count.students} students</span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="mt-2 border rounded-lg p-2 text-muted-foreground">
                No classes yet.
              </div>
            )}
          </div>
          <div className="mt-8 flex flex-col">
            <p className="my-2 text-foreground/60">Teachers' Lounge</p>
            {data.teacherCourses.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {data.teacherCourses.map((course) => {
                  // Calculate overall progress
                  const totalModules = course.teacherCourseModules.length;
                  const completedModules = course.teacherCourseModules.filter(
                    (module) =>
                      module.teacherCourseModuleSessions.some(
                        (session) =>
                          session.videoTimestamp === module.videoDuration
                      )
                  ).length;
                  const progressPercentage =
                    totalModules > 0
                      ? (completedModules / totalModules) * 100
                      : 0;

                  return (
                    <Link
                      to={`/app/teacher-courses/${course.id}`}
                      key={course.id}
                      className="flex flex-col rounded-lg border transition-shadow hover:shadow bg-muted"
                    >
                      <div className="aspect-video w-full overflow-hidden rounded-t-lg">
                        {course.image ? (
                          <img
                            src={`/api/image/teacher-course/${course.image.id}`}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="h-full w-full bg-gradient-to-br from-foreground/5 to-foreground/20" />
                        )}
                      </div>
                      <div className="flex flex-col p-4">
                        <h4 className="text-foreground/90 font-medium">
                          {course.title}
                        </h4>
                        {course.description && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                            {course.description}
                          </p>
                        )}
                        <div className="mt-3 flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">
                            {completedModules}/{totalModules} modules completed
                          </span>
                          <span
                            className={cn(
                              'text-primary font-medium',
                              progressPercentage === 100 && 'text-green-600'
                            )}
                          >
                            {Math.round(progressPercentage)}%
                          </span>
                        </div>
                        <div className="mt-2 w-full bg-muted-foreground/20 rounded-full h-2">
                          <div
                            className={cn(
                              'h-2 rounded-full transition-all duration-300',
                              progressPercentage === 100 && 'bg-green-600'
                            )}
                            style={{ width: `${progressPercentage}%` }}
                          />
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-8 border-2 border-dashed rounded-lg">
                <p>No teacher courses available yet.</p>
                <p className="text-sm mt-1">
                  Check back later for professional development opportunities.
                </p>
              </div>
            )}
          </div>
          <div className="mt-8 flex flex-col">
            <p className="my-2 text-foreground/60">Student Courses</p>
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
          </div>
          <div className="mt-8 flex flex-col">
            <p className="my-2 text-foreground/60">Documents</p>
            {data.documents.length ? (
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                {data.documents.map((doc) => (
                  <DocumentLink key={doc.id} doc={doc} exitTo="/app" />
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
                          <DocumentLink key={doc.id} doc={doc} exitTo="/app" isArchived />
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
        </div>
        <div className="mt-8 flex flex-col">
          <p className="my-2 text-foreground/60">Documents</p>
          {data.documents.length ? (
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {data.documents.map((doc) => (
                <DocumentLink key={doc.id} doc={doc} exitTo="/app" />
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
                        <DocumentLink key={doc.id} doc={doc} exitTo="/app" isArchived />
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
