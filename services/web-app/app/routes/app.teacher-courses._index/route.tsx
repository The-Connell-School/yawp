import {
  type LoaderFunctionArgs,
  data as dataResponse,
  useLoaderData,
} from 'react-router';
import { Link } from 'react-router';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { prisma } from '~/utils/db.server';
import { requireUserId } from '~/utils/auth.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { profiles: { include: { teacherProfile: true } } },
  });
  if (!user?.profiles.some((p) => p.teacherProfile)) {
    throw new Response('Teacher profile required', { status: 403 });
  }

  const teacherCourses = await prisma.teacherCourse.findMany({
    include: { image: { select: { id: true } } },
    orderBy: { createdAt: 'desc' },
  });

  return dataResponse({ teacherCourses });
}

export default function TeacherCoursesIndexRoute() {
  const { teacherCourses } = useLoaderData<typeof loader>();
  return (
    <div className="p-3 sm:p-5">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Teacher Lounge</h1>
            <p className="text-muted-foreground">
              Courses and resources for teachers
            </p>
          </div>
        </div>
        {teacherCourses.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center border border-dashed bg-muted py-6 rounded-lg">
            <span className="text-lg font-bold">No courses available</span>
            <span className="text-sm text-muted-foreground">
              Check back later
            </span>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {teacherCourses.map((course) => (
              <Card key={course.id} className="bg-muted">
                <div className="aspect-video w-full overflow-hidden rounded-t-lg">
                  {course.image ? (
                    <img
                      src={`/api/image/teacher-course/${course.image.id}`}
                      alt={course.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full bg-gradient-to-br from-foreground/5 to-foreground/20" />
                  )}
                </div>
                <CardHeader>
                  <CardTitle className="line-clamp-1">{course.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Button asChild className="w-full">
                    <Link to={`/app/teacher-courses/${course.id}`}>Open</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
