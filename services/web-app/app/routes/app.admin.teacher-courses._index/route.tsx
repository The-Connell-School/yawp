import {
  data as dataResponse,
  useFetcher,
  type LoaderFunctionArgs,
  useLoaderData,
  type ActionFunctionArgs,
  redirect,
  useNavigate,
} from 'react-router';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { prisma } from '~/utils/db.server';
import { Plus } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '~/components/ui/sheet';
import { Label } from '~/components/ui/label';
import { Input } from '~/components/ui/input';
import { Textarea } from '~/components/ui/textarea';
import { useEffect, useState } from 'react';
import { requireAdmin } from '~/utils/auth.server';

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);

  const [teacherCourses, stats] = await Promise.all([
    prisma.teacherCourse.findMany({
      include: {
        teacherCourseModules: {
          include: {
            resources: {
              select: {
                id: true,
                name: true,
                contentType: true,
              },
            },
          },
        },
        resources: {
          select: {
            id: true,
          },
        },
        image: { select: { id: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.$queryRaw<
      {
        total_courses: number;
        total_modules: number;
        total_resources: number;
      }[]
    >`
      SELECT
        COUNT(DISTINCT tc.id)::int as total_courses,
        COUNT(DISTINCT tcm.id)::int as total_modules,
        COUNT(DISTINCT tcr.id)::int as total_resources
      FROM "TeacherCourse" tc
      LEFT JOIN "TeacherCourseModule" tcm ON tcm."teacherCourseId" = tc.id
      LEFT JOIN "TeacherCourseResource" tcr ON tcr."teacherCourseId" = tc.id
    `,
  ]);

  return dataResponse({
    teacherCourses,
    stats: stats[0],
  });
}

export async function action({ request }: ActionFunctionArgs) {
  await requireAdmin(request);
  const formData = await request.formData();
  const intent = formData.get('intent');

  if (intent === 'create') {
    const title = formData.get('title')?.toString();
    const description = formData.get('description')?.toString();

    if (!title) {
      throw new Response('Title is required', { status: 400 });
    }

    const count = await prisma.teacherCourse.count();
    const teacherCourse = await prisma.teacherCourse.create({
      data: {
        title,
        description: description || null,
        position: count,
      },
    });

    return redirect(`/app/admin/teacher-courses/${teacherCourse.id}`);
  }

  return dataResponse({ status: 'error' });
}

export default function TeacherCoursesRoute() {
  const { teacherCourses, stats } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data) {
      setIsSheetOpen(false);
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <div className="p-3 sm:p-5">
      <div className="flex flex-1 flex-col">
        <div className="mb-4">
          <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
            <SheetTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Create Teacher Course
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Create Teacher Course</SheetTitle>
              </SheetHeader>
              <fetcher.Form method="post" className="mt-4 space-y-4">
                <input type="hidden" name="intent" value="create" />
                <div className="space-y-2">
                  <Label htmlFor="title">Title</Label>
                  <Input id="title" name="title" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea id="description" name="description" rows={3} />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={fetcher.state !== 'idle'}
                >
                  {fetcher.state === 'idle'
                    ? 'Create Teacher Course'
                    : 'Creating...'}
                </Button>
              </fetcher.Form>
            </SheetContent>
          </Sheet>
        </div>

        <div className="flex-1 overflow-y-auto">
          {fetcher.state !== 'idle' ? (
            <div className="flex h-full flex-col items-center justify-center border border-dashed bg-muted">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span className="mt-2 text-sm text-muted-foreground">
                Loading...
              </span>
            </div>
          ) : teacherCourses.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center border border-dashed bg-muted py-6">
              <span className="text-lg font-bold">
                No teacher courses found
              </span>
              <span className="text-sm text-muted-foreground">
                Create your first teacher course to get started
              </span>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {teacherCourses.map((course) => (
                <Card
                  key={course.id}
                  className="bg-muted cursor-pointer transition-shadow hover:shadow-lg"
                  onClick={() =>
                    navigate(`/app/admin/teacher-courses/${course.id}`)
                  }
                >
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
                    <CardTitle className="line-clamp-1">
                      {course.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="line-clamp-2 text-sm text-muted-foreground">
                      {course.description || 'No description'}
                    </p>
                    <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
                      <span>{course.teacherCourseModules.length} modules</span>
                      <span>{course.resources.length} resources</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
