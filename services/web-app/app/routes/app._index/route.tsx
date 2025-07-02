import {
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  data as dataResponse,
} from 'react-router';
import { Link, useLoaderData, useFetcher } from 'react-router';
import { BookmarkIcon, EllipsisVertical, PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { DocumentLink } from '~/components/document-link.js';
import { NoDataPlaceholder } from '~/components/no-data-placeholder.js';
import { Button } from '~/components/ui/button.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu.js';
import { useUser } from '~/hooks/useUser.js';
import { redirectIfDisabled, requireUserId } from '~/utils/auth.server.js';
import { prisma } from '~/utils/db.server.js';
import { FeatureFlags } from '~/utils/featureFlags/index.js';

export async function loader({ request }: LoaderFunctionArgs) {
  await redirectIfDisabled(FeatureFlags.Courses, '/app/assistants');
  const userId = await requireUserId(request);

  // Check if user has teacher profile
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { teacherProfile: { select: { id: true } } },
  });

  const [courses, documents, studentProfiles, views, teacherCourses] = await Promise.all([
    prisma.course.findMany({
      select: { image: { select: { id: true } }, id: true, title: true },
    }),
    prisma.document.findMany({
      orderBy: { createdAt: 'desc' },
      where: { userId, deletedAt: null },
      include: {
        courseModuleSessions: {
          include: { courseModule: true },
          orderBy: { courseModule: { position: 'desc' } },
        },
      },
    }),
    prisma.studentProfile.findMany({
      where: { workshopLeaderId: userId },
      include: { user: { include: { image: true, documents: true } } },
    }),
    prisma.studentView.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    }),
    // Fetch teacher courses if user has teacher profile
    user?.teacherProfile ? 
      prisma.teacherCourse.findMany({
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
                  teacherProfileId: user.teacherProfile.id
                },
                select: {
                  videoProgress: true,
                  videoTimestamp: true
                }
              }
            },
            orderBy: { position: 'asc' }
          }
        },
        orderBy: { position: 'asc' }
      }) : 
      [],
  ]);

  return dataResponse({
    courses,
    documents,
    studentProfiles,
    views,
    teacherCourses,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    const formData = await request.formData();
    const intent = formData.get('intent');

    if (intent === 'deleteView') {
      const viewId = formData.get('viewId');
      await prisma.studentView.delete({
        where: { id: viewId as string },
      });

      return dataResponse({ success: true } as const);
    }

    return dataResponse({ success: false } as const);
  } catch (error) {
    throw error;
  }
}

export default function AppRoute() {
  const data = useLoaderData<typeof loader>();
  const user = useUser();
  const isTeacher = user.teacherProfile !== null;
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const fetcher = useFetcher<typeof action>();

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
              <p className="text-foreground/60">Folders</p>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setIsCreateModalOpen(true)}
              >
                <PlusIcon className="h-5 w-5" />
              </Button>
            </div>
            {data.views.length ? (
              <div className="flex flex-wrap gap-2">
                {data.views.map((view) => (
                  <Link
                    key={view.id}
                    to={`/app/students?filters=${encodeURIComponent(
                      JSON.stringify({
                        school: view.school?.split(',').filter(Boolean) ?? [],
                        grade: view.grade?.split(',').filter(Boolean) ?? [],
                        period: view.period?.split(',').filter(Boolean) ?? [],
                        workshopLeader:
                          view.workshopLeader?.split(',').filter(Boolean) ?? [],
                        schoolTeacher:
                          view.schoolTeacher?.split(',').filter(Boolean) ?? [],
                        view: 'cards',
                      })
                    )}`}
                    className="align-center flex justify-between gap-2 rounded-lg border bg-muted/50 p-2 shadow-sm transition-shadow hover:shadow-md"
                  >
                    <BookmarkIcon className="my-auto h-5 w-5 fill-white text-gray-400" />
                    <div className="my-auto min-w-fit font-medium">
                      {view.name}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={(e: React.MouseEvent) => e.stopPropagation()}
                        >
                          <EllipsisVertical
                            size={16}
                            className="text-muted-foreground"
                          />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <fetcher.Form method="post">
                          <input
                            type="hidden"
                            name="intent"
                            value="deleteView"
                          />
                          <input type="hidden" name="viewId" value={view.id} />
                          <DropdownMenuItem asChild>
                            <Button
                              variant="ghost"
                              className="w-full justify-start"
                              onClick={(e: React.MouseEvent) =>
                                e.stopPropagation()
                              }
                            >
                              Delete
                            </Button>
                          </DropdownMenuItem>
                        </fetcher.Form>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </Link>
                ))}
              </div>
            ) : (
              <NoDataPlaceholder
                title="No saved views"
                subtitle="Create a view to quickly access filtered student lists."
              />
            )}
          </div>
          <div className="mt-8 flex flex-col">
            <p className="my-2 text-foreground/60">Teacher Professional Development</p>
            {data.teacherCourses.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {data.teacherCourses.map((course) => {
                  // Calculate overall progress
                  const totalModules = course.teacherCourseModules.length;
                  const completedModules = course.teacherCourseModules.filter(
                    module => module.teacherCourseModuleSessions.some(session => session.videoProgress >= 95)
                  ).length;
                  const progressPercentage = totalModules > 0 ? (completedModules / totalModules) * 100 : 0;
                  
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
                        <h4 className="text-foreground/90 font-medium">{course.title}</h4>
                        {course.description && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                            {course.description}
                          </p>
                        )}
                        <div className="mt-3 flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">
                            {completedModules}/{totalModules} modules completed
                          </span>
                          <span className="text-primary font-medium">
                            {Math.round(progressPercentage)}%
                          </span>
                        </div>
                        <div className="mt-2 w-full bg-muted-foreground/20 rounded-full h-2">
                          <div 
                            className="bg-primary h-2 rounded-full transition-all duration-300" 
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
                <p className="text-sm mt-1">Check back later for professional development opportunities.</p>
              </div>
            )}
          </div>
          <div className="mt-8 flex flex-col">
            <p className="my-2 text-foreground/60">Resources (by course)</p>
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
          </div>
        </div>
        <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create a Student View</DialogTitle>
              <DialogDescription>
                Go to the Students page, add your desired filters, and hit the
                'Save' button to create a new Student View from those filters.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button asChild>
                <Link to="/app/students">Go to Students</Link>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
        </div>
      </div>
    </section>
  );
}
