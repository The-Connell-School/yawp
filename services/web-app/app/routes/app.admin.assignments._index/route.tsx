import {
  data as dataResponse,
  type LoaderFunctionArgs,
  useLoaderData,
  useNavigate,
  Link,
} from 'react-router';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { requireAdmin } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { CheckCircle2, Plus } from 'lucide-react';

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);

  const assignmentTypes = await prisma.assignmentType.findMany({
    include: {
      image: { select: { id: true } },
      assignmentModules: { where: { deletedAt: null }, select: { id: true } },
      organizationAssignments: { select: { organizationId: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return dataResponse({ assignmentTypes });
}

export default function AssignmentTypesRoute() {
  const { assignmentTypes } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  return (
    <div className="p-3 sm:p-5">
      <div className="mb-4">
        <Button asChild>
          <Link to="/app/admin/assignment-types/new">
            <Plus className="mr-2 size-4 shrink-0" />
            Create assignment type
          </Link>
        </Button>
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
            const hasRubric = Boolean(at.rubricJson);

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
                  {hasRubric && (
                    <div className="mt-2 flex items-center gap-1 text-xs text-green-700">
                      <CheckCircle2 className="size-3.5 shrink-0" />
                      <span className="truncate">Rubric configured</span>
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
