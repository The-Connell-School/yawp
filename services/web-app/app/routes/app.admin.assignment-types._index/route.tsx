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

  const courses = await prisma.assignmentType.findMany({
    include: {
      assignmentModules: {
        where: { deletedAt: null },
        include: {
          instructions: true,
        },
      },
      image: { select: { id: true } },
      organizationAssignments: {
        include: { organization: { select: { id: true, name: true } } },
        orderBy: { organization: { name: 'asc' } },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

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

function CreateSheet({
  isSheetOpen,
  setIsSheetOpen,
  fetcher,
}: {
  isSheetOpen: boolean;
  setIsSheetOpen: (open: boolean) => void;
  fetcher: ReturnType<typeof useFetcher>;
}) {
  return (
    <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
      <SheetTrigger asChild>
        <Button size="sm" className="gap-1.5 py-1.5 pr-3 pl-2">
          <Plus className="size-4 shrink-0" />
          New type
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
  );
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

  const isEmpty = courses.length === 0;

  return (
    <div className="p-4 sm:p-6">
      {/* Page header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground text-pretty">
            {courses.length} {courses.length === 1 ? 'type' : 'types'} total
          </p>
        </div>
        <CreateSheet
          isSheetOpen={isSheetOpen}
          setIsSheetOpen={setIsSheetOpen}
          fetcher={fetcher}
        />
      </div>

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-20 text-center">
          <p className="text-sm font-semibold text-balance">No assignment types yet</p>
          <p className="text-sm text-muted-foreground text-pretty">
            Create your first assignment type to get started.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {courses.map((course) => (
            <button
              key={course.id}
              type="button"
              onClick={() => navigate(`/app/admin/assignment-types/${course.id}`)}
              className="flex flex-col overflow-hidden rounded-lg border bg-white text-left ring-1 ring-black/5"
            >
              <div className="aspect-[5/3] w-full overflow-hidden">
                {course.image ? (
                  <img
                    src={`/api/image/course/${course.image.id}`}
                    alt={course.title}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full bg-linear-to-br from-neutral-100 to-neutral-200" />
                )}
              </div>
              <div className="flex flex-1 flex-col gap-2 p-3">
                <p className="line-clamp-1 text-sm font-semibold text-balance">
                  {course.title}
                </p>
                <p className="line-clamp-2 grow text-sm text-muted-foreground text-pretty">
                  {course.description || 'No description'}
                </p>
                <div className="flex items-center justify-between text-sm text-muted-foreground tabular-nums">
                  <span>{course.assignmentModules.length} modules</span>
                  <span>{course.organizationAssignments.length} orgs</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
