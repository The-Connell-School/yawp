import {
  data as dataResponse,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  useLoaderData,
  useFetcher,
  useNavigate,
  redirect,
} from 'react-router';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
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
import { requireAdmin } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { CheckCircle2, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);

  const assignmentTypes = await prisma.assignmentType.findMany({
    include: {
      image: { select: { id: true } },
      assignmentModules: { where: { deletedAt: null }, select: { id: true } },
      organizationAssignments: { select: { organizationId: true } },
      gradingAssistantLinks: {
        where: { isDefault: true, activeTo: null },
        include: {
          gradingAssistantTemplate: {
            select: { id: true, name: true, status: true },
          },
        },
        orderBy: { activeFrom: 'desc' },
        take: 1,
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return dataResponse({ assignmentTypes });
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

export default function AssignmentsGradingRoute() {
  const { assignmentTypes } = useLoaderData<typeof loader>();
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
      <div className="mb-4">
        <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
          <SheetTrigger asChild>
            <Button>
              <Plus className="mr-2 size-4 shrink-0" />
              Create assignment type
            </Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Create assignment type</SheetTitle>
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
                {fetcher.state === 'idle' ? 'Create assignment type' : 'Creating...'}
              </Button>
            </fetcher.Form>
          </SheetContent>
        </Sheet>
      </div>

      {assignmentTypes.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center rounded-lg border border-dashed bg-muted">
          <span className="text-lg font-semibold">No assignment types</span>
          <span className="mt-1 text-sm text-muted-foreground">
            Create your first assignment type to get started.
          </span>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {assignmentTypes.map((at) => {
            const activeGrading = at.gradingAssistantLinks[0]?.gradingAssistantTemplate ?? null;
            const hasActiveGrading = activeGrading?.status === 'active';

            return (
              <Card
                key={at.id}
                className="bg-muted cursor-pointer gap-0 overflow-hidden py-0 transition-shadow hover:shadow-md"
                onClick={() => navigate(`/app/admin/assignment-types/${at.id}`)}
              >
                <div className="aspect-[5/3] w-full overflow-hidden rounded-t-lg">
                  {at.image ? (
                    <img
                      src={`/api/image/course/${at.image.id}`}
                      alt={at.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full bg-linear-to-br from-foreground/5 to-foreground/20" />
                  )}
                </div>
                <CardHeader>
                  <CardTitle className="line-clamp-1">{at.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {at.description || 'No description'}
                  </p>
                  <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
                    <span>{at.assignmentModules.length} modules</span>
                    <span>
                      {at.organizationAssignments.length}{' '}
                      {at.organizationAssignments.length === 1 ? 'org' : 'orgs'}
                    </span>
                  </div>
                  {hasActiveGrading && (
                    <div className="mt-2 flex items-center gap-1 text-xs text-green-700">
                      <CheckCircle2 className="size-3.5 shrink-0" />
                      <span className="truncate">{activeGrading!.name}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
