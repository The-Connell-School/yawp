import { type LoaderFunctionArgs, data as dataResponse } from 'react-router';
import { BookOpen, Clock, Award } from 'lucide-react';
import { requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { type BreadcrumbHandle } from '~/utils/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';

export const handle: BreadcrumbHandle = { breadcrumb: 'My Courses' };

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      teacherProfile: true,
    },
  });

  if (!user?.teacherProfile) {
    throw new Response('Teacher profile required', { status: 403 });
  }

  return dataResponse({});
}

export default function MyCoursesRoute() {
  return (
    <section className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll">
      <div className="flex w-full justify-between border-b bg-secondary">
        <div className="mx-auto w-full max-w-screen-lg p-3 sm:p-5">
          <div className="flex flex-col">
            <h2>My Courses</h2>
            <p className="mt-3 max-w-full text-muted-foreground sm:max-w-[400px]">
              Access your teacher courses and track your professional development progress.
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-screen-lg px-3 py-3 pb-24 sm:px-5">
        <div className="flex flex-col items-center justify-center min-h-[400px] space-y-6">
          <div className="rounded-full bg-primary/10 p-6">
            <BookOpen className="h-16 w-16 text-primary" />
          </div>
          
          <div className="text-center space-y-2">
            <h3 className="text-2xl font-semibold">Teacher Courses Coming Soon</h3>
            <p className="text-muted-foreground max-w-md">
              This section is being developed to provide you with access to professional development courses and track your progress.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3 w-full max-w-2xl mt-8">
            <Card className="text-center">
              <CardHeader className="pb-3">
                <div className="mx-auto rounded-full bg-blue-100 p-3 w-fit dark:bg-blue-900">
                  <BookOpen className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <CardTitle className="text-lg">Course Library</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Access a comprehensive library of teacher training courses
                </p>
              </CardContent>
            </Card>

            <Card className="text-center">
              <CardHeader className="pb-3">
                <div className="mx-auto rounded-full bg-green-100 p-3 w-fit dark:bg-green-900">
                  <Clock className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
                <CardTitle className="text-lg">Progress Tracking</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Monitor your progress through each course and module
                </p>
              </CardContent>
            </Card>

            <Card className="text-center">
              <CardHeader className="pb-3">
                <div className="mx-auto rounded-full bg-purple-100 p-3 w-fit dark:bg-purple-900">
                  <Award className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                </div>
                <CardTitle className="text-lg">Certifications</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Earn certificates upon completion of courses
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
}