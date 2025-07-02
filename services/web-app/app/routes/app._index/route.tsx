import {
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  data as dataResponse,
} from 'react-router';
import { Link, useLoaderData, useFetcher } from 'react-router';
import { BookmarkIcon, EllipsisVertical, PlusIcon, Users, BookOpen, Chalkboard } from 'lucide-react';
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

  const [courses, documents, user] = await Promise.all([
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
    prisma.user.findUnique({
      where: { id: userId },
      include: { 
        teacherProfile: {
          include: {
            teacherClasses: {
              include: {
                students: {
                  include: {
                    user: true
                  }
                }
              }
            }
          }
        }
      },
    }),
  ]);

  return dataResponse({
    courses,
    documents,
    user,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    const formData = await request.formData();
    const intent = formData.get('intent');
    const userId = await requireUserId(request);

    if (intent === 'createTeacherProfile') {
      await prisma.teacherProfile.create({
        data: {
          userId,
        },
      });

      return dataResponse({ success: true } as const);
    }

    return dataResponse({ success: false } as const);
  } catch (error) {
    throw error;
  }
}

export default function AppRoute() {
  const { courses, documents, user: userFromLoader } = useLoaderData<typeof loader>();
  const user = useUser();
  const fetcher = useFetcher<typeof action>();
  
  const isOwner = user.isOwner;
  const hasTeacherProfile = user.teacherProfile !== null;

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
              Welcome to your dashboard. Here you can manage your classes, courses, and documents.
            </p>
          </div>
        </div>
      </div>
      <div className="mx-auto w-full max-w-screen-lg px-3 py-3 pb-24 sm:px-5">
        <div className="flex flex-col space-y-4">
          {/* Create Teacher Profile Button - if user.isOwner && !user.teacherProfile */}
          {isOwner && !hasTeacherProfile && (
            <div className="flex items-center">
              <fetcher.Form method="post">
                <input type="hidden" name="intent" value="createTeacherProfile" />
                <Button 
                  type="submit" 
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                  disabled={fetcher.state === 'submitting'}
                >
                  <Chalkboard className="mr-2 h-4 w-4" />
                  {fetcher.state === 'submitting' ? 'Creating...' : 'Create Teacher Profile'}
                </Button>
              </fetcher.Form>
            </div>
          )}

          {/* Teacher Profile Cards - if user.teacherProfile exists */}
          {hasTeacherProfile && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* Teacher's Lounge Card */}
              <Link
                to="/app/my-courses"
                className="flex flex-col items-center justify-center rounded-lg border bg-gradient-to-br from-blue-50 to-blue-100 p-6 shadow-sm transition-shadow hover:shadow-md dark:from-blue-950 dark:to-blue-900"
              >
                <BookOpen className="mb-3 h-12 w-12 text-blue-600 dark:text-blue-400" />
                <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100">
                  Teacher's Lounge
                </h3>
                <p className="mt-1 text-center text-sm text-blue-700 dark:text-blue-300">
                  Access your teacher courses and professional development
                </p>
              </Link>

              {/* My Classes Card */}
              <Link
                to="/app/my-classes"
                className="flex flex-col items-center justify-center rounded-lg border bg-gradient-to-br from-green-50 to-green-100 p-6 shadow-sm transition-shadow hover:shadow-md dark:from-green-950 dark:to-green-900"
              >
                <Users className="mb-3 h-12 w-12 text-green-600 dark:text-green-400" />
                <h3 className="text-lg font-semibold text-green-900 dark:text-green-100">
                  My Classes
                </h3>
                <p className="mt-1 text-center text-sm text-green-700 dark:text-green-300">
                  Manage your classes and students
                </p>
              </Link>
            </div>
          )}

          {/* Courses Section - for everyone */}
          <div className="mt-8 flex flex-col">
            <h3 className="mb-4 text-xl font-bold text-foreground">Courses</h3>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {courses.map((course) => (
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

          {/* Documents Section */}
          <div className="mt-8 flex flex-col">
            <h3 className="mb-4 text-xl font-bold text-foreground">Documents</h3>
            {documents.length ? (
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                {documents.map((doc) => (
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
      </div>
    </section>
  );
}
