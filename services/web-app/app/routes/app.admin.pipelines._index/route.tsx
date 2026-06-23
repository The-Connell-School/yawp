import {
  data as dataResponse,
  Link,
  type LoaderFunctionArgs,
  useLoaderData,
} from 'react-router';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { requireAdmin } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { AlertCircle, CheckCircle2, Circle, ClipboardCheck, FilePen, Plus } from 'lucide-react';
import { cn } from '~/utils/misc';

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);

  const [assignmentTypes, gradingTemplates] = await Promise.all([
    prisma.assignmentType.findMany({
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
      orderBy: { position: 'asc' },
    }),
    prisma.gradingAssistantTemplate.findMany({
      include: {
        assignmentTypeLinks: {
          where: { isDefault: true, activeTo: null },
          select: { id: true },
        },
      },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    }),
  ]);

  const linkedTemplateIds = new Set(
    assignmentTypes.flatMap((at) =>
      at.gradingAssistantLinks.map((l) => l.gradingAssistantTemplate.id)
    )
  );

  const unlinkedTemplates = gradingTemplates.filter(
    (t) => !linkedTemplateIds.has(t.id)
  );

  return dataResponse({
    assignmentTypes: assignmentTypes.map((at) => ({
      id: at.id,
      title: at.title,
      description: at.description,
      imageId: at.image?.id ?? null,
      moduleCount: at.assignmentModules.length,
      orgCount: at.organizationAssignments.length,
      archivedAt: at.archivedAt?.toISOString() ?? null,
      gradingAssistant: at.gradingAssistantLinks[0]?.gradingAssistantTemplate ?? null,
    })),
    unlinkedTemplates: unlinkedTemplates.map((t) => ({
      id: t.id,
      name: t.name,
      status: t.status,
    })),
    stats: {
      typeCount: assignmentTypes.length,
      activeGradingCount: gradingTemplates.filter((t) => t.status === 'active').length,
      gapCount: assignmentTypes.filter(
        (at) =>
          !at.archivedAt &&
          !at.gradingAssistantLinks.some(
            (l) => l.gradingAssistantTemplate.status === 'active'
          )
      ).length,
    },
  });
}

function GradingStatusIcon({
  template,
}: {
  template: { status: string; name: string } | null;
}) {
  if (!template) {
    return <AlertCircle className="h-3.5 w-3.5 text-muted-foreground/50" />;
  }
  if (template.status === 'active') {
    return <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />;
  }
  return <Circle className="h-3.5 w-3.5 text-amber-500" />;
}

function GradingStatusBadge({
  template,
}: {
  template: { status: string; name: string } | null;
}) {
  if (!template) {
    return (
      <Badge variant="outline" className="text-muted-foreground/60 text-[0.65rem]">
        No grading assistant
      </Badge>
    );
  }
  if (template.status === 'active') {
    return (
      <Badge className="border-green-200 bg-green-50 text-green-700 text-[0.65rem]">
        {template.name}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-amber-200 text-amber-600 text-[0.65rem]">
      {template.name} · {template.status}
    </Badge>
  );
}

export default function PipelinesRoute() {
  const { assignmentTypes, unlinkedTemplates, stats } = useLoaderData<typeof loader>();

  const active = assignmentTypes.filter((at) => !at.archivedAt);
  const archived = assignmentTypes.filter((at) => at.archivedAt);

  return (
    <div className="flex flex-col gap-6 p-3 md:p-5">
      {/* Header + actions */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Assignment Pipelines</h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Each assignment type defines the full student lifecycle — from tutor
            modules through grading. Configure both in one place.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link to="/app/admin/grading-assistants/new">
              <ClipboardCheck className="mr-1.5 h-4 w-4" />
              New grading assistant
            </Link>
          </Button>
          <Button size="sm" asChild>
            <Link to="/app/admin/assignment-types">
              <Plus className="mr-1.5 h-4 w-4" />
              New assignment type
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Assignment types', value: stats.typeCount },
          { label: 'Active grading assistants', value: stats.activeGradingCount },
          {
            label: 'Types without active grading',
            value: stats.gapCount,
            alert: stats.gapCount > 0,
          },
        ].map(({ label, value, alert }) => (
          <div
            key={label}
            className={cn(
              'rounded-lg border bg-muted px-4 py-3',
              alert && 'border-amber-200 bg-amber-50'
            )}
          >
            <div
              className={cn(
                'text-2xl font-semibold tabular-nums',
                alert && 'text-amber-700'
              )}
            >
              {value}
            </div>
            <div
              className={cn(
                'text-xs text-muted-foreground',
                alert && 'text-amber-600'
              )}
            >
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* Pipeline cards */}
      {active.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center">
          <p className="font-medium text-muted-foreground">
            No assignment types yet.
          </p>
          <Button size="sm" className="mt-4" asChild>
            <Link to="/app/admin/assignment-types">
              <Plus className="mr-1.5 h-4 w-4" />
              Create one
            </Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {active.map((at) => {
            const hasActiveGrading = at.gradingAssistant?.status === 'active';
            return (
              <div
                key={at.id}
                className={cn(
                  'group flex flex-col overflow-hidden rounded-lg border bg-card shadow-sm ring-1 ring-black/5 transition-shadow hover:shadow-md',
                  !hasActiveGrading && 'ring-amber-200'
                )}
              >
                {/* Image band */}
                <div className="h-20 w-full shrink-0 overflow-hidden bg-gradient-to-br from-foreground/5 to-foreground/20">
                  {at.imageId ? (
                    <img
                      src={`/api/image/course/${at.imageId}`}
                      alt={at.title}
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </div>

                {/* Body */}
                <div className="flex flex-1 flex-col gap-3 p-4">
                  <div>
                    <p className="font-semibold leading-tight">{at.title}</p>
                    {at.description ? (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {at.description}
                      </p>
                    ) : null}
                  </div>

                  {/* Lifecycle row */}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span
                      className="flex items-center gap-1"
                      title={`${at.moduleCount} tutor module${at.moduleCount !== 1 ? 's' : ''}`}
                    >
                      <FilePen className="h-3 w-3" />
                      {at.moduleCount} {at.moduleCount === 1 ? 'module' : 'modules'}
                    </span>
                    <span className="text-muted-foreground/30">·</span>
                    <span>{at.orgCount} {at.orgCount === 1 ? 'org' : 'orgs'}</span>
                  </div>

                  {/* Grading assistant status */}
                  <div className="flex items-center gap-1.5">
                    <GradingStatusIcon template={at.gradingAssistant} />
                    <GradingStatusBadge template={at.gradingAssistant} />
                  </div>
                </div>

                {/* Actions */}
                <div className="grid grid-cols-2 divide-x divide-black/5 border-t border-black/5">
                  <Link
                    to={`/app/admin/assignment-types/${at.id}`}
                    className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <FilePen className="h-3.5 w-3.5" />
                    Edit type
                  </Link>
                  {at.gradingAssistant ? (
                    <Link
                      to={`/app/admin/grading-assistants/${at.gradingAssistant.id}`}
                      className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <ClipboardCheck className="h-3.5 w-3.5" />
                      Edit grading
                    </Link>
                  ) : (
                    <Link
                      to="/app/admin/grading-assistants/new"
                      className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium text-amber-600 transition-colors hover:bg-amber-50 hover:text-amber-700"
                    >
                      <ClipboardCheck className="h-3.5 w-3.5" />
                      Add grading
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Unlinked grading assistants */}
      {unlinkedTemplates.length > 0 ? (
        <section>
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
            Standalone grading assistants
          </h3>
          <div className="flex flex-wrap gap-2">
            {unlinkedTemplates.map((t) => (
              <Link
                key={t.id}
                to={`/app/admin/grading-assistants/${t.id}`}
                className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm shadow-sm transition-shadow hover:shadow-md"
              >
                {t.status === 'active' ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
                ) : (
                  <Circle className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                )}
                <span className="font-medium">{t.name}</span>
                <Badge variant="outline" className="text-[0.65rem]">
                  {t.status}
                </Badge>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* Archived types (collapsed) */}
      {archived.length > 0 ? (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
            Archived ({archived.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {archived.map((at) => (
              <Link
                key={at.id}
                to={`/app/admin/assignment-types/${at.id}`}
                className="rounded-md border bg-muted/50 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {at.title}
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
