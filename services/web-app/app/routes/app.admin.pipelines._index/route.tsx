import {
  data as dataResponse,
  Link,
  type LoaderFunctionArgs,
  useLoaderData,
} from 'react-router';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import { requireAdmin } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { CheckCircle2, Circle, ClipboardCheck, FilePen, Plus } from 'lucide-react';

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

function GradingCell({
  template,
  typeId,
}: {
  template: { id: string; status: string; name: string } | null;
  typeId: string;
}) {
  if (!template) {
    return (
      <Link
        to="/app/admin/grading-assistants/new"
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <Circle className="h-3.5 w-3.5 shrink-0" />
        <span>None</span>
      </Link>
    );
  }
  return (
    <Link
      to={`/app/admin/grading-assistants/${template.id}`}
      className="flex items-center gap-1.5 text-sm hover:underline"
    >
      {template.status === 'active' ? (
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600" />
      ) : (
        <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
      )}
      <span>{template.name}</span>
      {template.status !== 'active' && (
        <Badge variant="outline" className="text-[0.65rem]">{template.status}</Badge>
      )}
    </Link>
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
          { label: 'Types without active grading', value: stats.gapCount },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg border bg-muted px-4 py-3">
            <div className="text-2xl font-semibold tabular-nums">{value}</div>
            <div className="text-xs text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>

      {/* Pipeline table */}
      {active.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center">
          <p className="font-medium text-muted-foreground">No assignment types yet.</p>
          <Button size="sm" className="mt-4" asChild>
            <Link to="/app/admin/assignment-types">
              <Plus className="mr-1.5 h-4 w-4" />
              Create one
            </Link>
          </Button>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Assignment type</TableHead>
              <TableHead>Modules</TableHead>
              <TableHead>Orgs</TableHead>
              <TableHead>Grading assistant</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {active.map((at) => (
              <TableRow key={at.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-12 shrink-0 overflow-hidden rounded bg-gradient-to-br from-foreground/5 to-foreground/20">
                      {at.imageId ? (
                        <img
                          src={`/api/image/course/${at.imageId}`}
                          alt={at.title}
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                    </div>
                    <div>
                      <p className="font-medium leading-tight">{at.title}</p>
                      {at.description ? (
                        <p className="line-clamp-1 text-xs text-muted-foreground">
                          {at.description}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <FilePen className="h-3.5 w-3.5" />
                    {at.moduleCount}
                  </span>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {at.orgCount}
                </TableCell>
                <TableCell>
                  <GradingCell template={at.gradingAssistant} typeId={at.id} />
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-2">
                    <Button size="sm" variant="ghost" asChild>
                      <Link to={`/app/admin/assignment-types/${at.id}`}>
                        <FilePen className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                    <Button size="sm" variant="ghost" asChild>
                      <Link
                        to={
                          at.gradingAssistant
                            ? `/app/admin/grading-assistants/${at.gradingAssistant.id}`
                            : '/app/admin/grading-assistants/new'
                        }
                      >
                        <ClipboardCheck className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
