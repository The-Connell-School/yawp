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

  const [courses] = await Promise.all([
    prisma.assignmentType.findMany({
      include: {
        assignmentModules: {
          where: { deletedAt: null },
          include: {
            instructions: true,
          },
        },
        image: { select: { id: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return dataResponse({
    courses,
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

    const count = await prisma.assignmentType.count();
    const course = await prisma.assignmentType.create({
      data: {
        title,
        description: description || null,
        position: count,
      },
    });

    return redirect(`/app/admin/assignment-types/${course.id}`);
  }

  return dataResponse({ status: 'error' });
}

export default function AssignmentTypesRoute() {
  const { courses } = useLoaderData<typeof loader>();
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
                Create Assignment Type
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Create Assignment Type</SheetTitle>
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
                  {fetcher.state === 'idle' ? 'Create Assignment Type' : 'Creating...'}
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
          ) : courses.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center border border-dashed bg-muted">
              <span className="text-lg font-bold">No assignment types found</span>
              <span className="text-sm text-muted-foreground">
                Create your first assignment type to get started
              </span>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {courses.map((course) => (
                <Card
                  key={course.id}
                  className="bg-muted cursor-pointer transition-shadow hover:shadow-lg"
                  onClick={() =>
                    navigate(`/app/admin/assignment-types/${course.id}`)
                  }
                >
                  <div className="aspect-video w-full overflow-hidden rounded-t-lg">
                    {course.image ? (
                      <img
                        src={`/api/image/course/${course.image.id}`}
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
                      <span>{course.assignmentModules.length} modules</span>
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
