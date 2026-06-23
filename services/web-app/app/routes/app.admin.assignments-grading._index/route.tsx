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
          include: {
            assignmentType: { select: { id: true, title: true } },
          },
          orderBy: { activeFrom: 'desc' },
        },
      },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    }),
  ]);

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
    gradingTemplates: gradingTemplates.map((t) => ({
      id: t.id,
      name: t.name,
      status: t.status,
      linkedTypes: t.assignmentTypeLinks.map((l) => l.assignmentType),
    })),
  });
}

function GradingStatusCell({
  template,
}: {
  template: { id: string; status: string; name: string } | null;
}) {
  if (!template) {
    return (
      <Link
        to="/app/admin/grading-assistants/new"
        className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
      >
        <Circle className="size-4 shrink-0" />
        <span>None</span>
      </Link>
    );
  }
  return (
    <Link
      to={`/app/admin/grading-assistants/${template.id}`}
      className="flex items-center gap-1.5 hover:underline"
    >
      {template.status === 'active' ? (
        <CheckCircle2 className="size-4 shrink-0 text-green-600" />
      ) : (
        <Circle className="size-4 shrink-0 text-muted-foreground/40" />
      )}
      <span>{template.name}</span>
      {template.status !== 'active' && (
        <Badge variant="outline" className="ml-1">{template.status}</Badge>
      )}
    </Link>
  );
}

function AssignmentsTable({
  active,
  archived,
}: {
  active: ReturnType<typeof useLoaderData<typeof loader>>['assignmentTypes'];
  archived: ReturnType<typeof useLoaderData<typeof loader>>['assignmentTypes'];
}) {
  if (active.length === 0) {
    return <p className="text-sm text-muted-foreground">No assignment types yet.</p>;
  }
  return (
    <>
      <div className="-mx-3 -my-2 overflow-x-auto whitespace-nowrap md:-mx-5">
        <div className="inline-block min-w-full px-3 py-2 align-middle md:px-5">
          <Table className="w-full">
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">Name</TableHead>
                <TableHead className="whitespace-nowrap">Modules</TableHead>
                <TableHead className="whitespace-nowrap">Orgs</TableHead>
                <TableHead className="whitespace-nowrap">Grading assistant</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {active.map((at) => (
                <TableRow key={at.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-12 shrink-0 overflow-hidden rounded bg-linear-to-br from-foreground/5 to-foreground/20">
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
                          <p className="line-clamp-1 text-sm text-muted-foreground text-pretty">
                            {at.description}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <FilePen className="size-4 shrink-0" />
                      {at.moduleCount}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{at.orgCount}</TableCell>
                  <TableCell>
                    <GradingStatusCell template={at.gradingAssistant} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="ghost" asChild>
                        <Link to={`/app/admin/assignment-types/${at.id}`}>
                          <FilePen className="size-4 shrink-0" />
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
                          <ClipboardCheck className="size-4 shrink-0" />
                        </Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
      {archived.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          <span className="text-sm text-muted-foreground">Archived:</span>
          {archived.map((at) => (
            <Link
              key={at.id}
              to={`/app/admin/assignment-types/${at.id}`}
              className="text-sm text-muted-foreground hover:text-foreground hover:underline"
            >
              {at.title}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

function GradingTable({
  templates,
}: {
  templates: ReturnType<typeof useLoaderData<typeof loader>>['gradingTemplates'];
}) {
  if (templates.length === 0) {
    return <p className="text-sm text-muted-foreground">No grading assistants yet.</p>;
  }
  return (
    <div className="-mx-3 -my-2 overflow-x-auto whitespace-nowrap md:-mx-5">
      <div className="inline-block min-w-full px-3 py-2 align-middle md:px-5">
        <Table className="w-full">
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap">Name</TableHead>
              <TableHead className="whitespace-nowrap">Status</TableHead>
              <TableHead className="whitespace-nowrap">Linked to</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates.map((t) => (
              <TableRow key={t.id}>
                <TableCell>
                  <Link
                    to={`/app/admin/grading-assistants/${t.id}`}
                    className="font-medium hover:underline"
                  >
                    {t.name}
                  </Link>
                </TableCell>
                <TableCell>
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    {t.status === 'active' ? (
                      <CheckCircle2 className="size-4 shrink-0 text-green-600" />
                    ) : (
                      <Circle className="size-4 shrink-0 text-muted-foreground/40" />
                    )}
                    {t.status}
                  </span>
                </TableCell>
                <TableCell>
                  {t.linkedTypes.length === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {t.linkedTypes.map((lt) => (
                        <Link
                          key={lt.id}
                          to={`/app/admin/assignment-types/${lt.id}`}
                          className="text-sm hover:underline"
                        >
                          {lt.title}
                        </Link>
                      ))}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end">
                    <Button size="sm" variant="ghost" asChild>
                      <Link to={`/app/admin/grading-assistants/${t.id}`}>
                        <FilePen className="size-4 shrink-0" />
                      </Link>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default function AssignmentsAndGradingRoute() {
  const { assignmentTypes, gradingTemplates } = useLoaderData<typeof loader>();

  const active = assignmentTypes.filter((at) => !at.archivedAt);
  const archived = assignmentTypes.filter((at) => at.archivedAt);

  return (
    <div data-uidotsh-pick="Page layout" className="contents">

      {/* ── Option A: Stacked (current) ───────────────────────────────── */}
      <div data-uidotsh-option="Stacked (current)" className="contents">
        <div className="flex flex-col gap-10 p-3 md:p-5">
          <section className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-base font-semibold text-balance">Assignments</h2>
              <Button size="sm" asChild>
                <Link to="/app/admin/assignment-types">
                  <Plus className="size-4 shrink-0" />
                  New assignment type
                </Link>
              </Button>
            </div>
            <AssignmentsTable active={active} archived={archived} />
          </section>

          <div className="border-t border-black/5" />

          <section className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-base font-semibold text-balance">Grading</h2>
              <Button size="sm" variant="outline" asChild>
                <Link to="/app/admin/grading-assistants/new">
                  <Plus className="size-4 shrink-0" />
                  New grading assistant
                </Link>
              </Button>
            </div>
            <GradingTable templates={gradingTemplates} />
          </section>
        </div>
      </div>

      {/* ── Option B: Counts in headings + larger type ────────────────── */}
      <div data-uidotsh-option="Section headers with counts" className="contents" hidden>
        <div className="flex flex-col gap-12 p-3 md:p-5">
          <section className="flex flex-col gap-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-balance">
                  Assignments
                  <span className="ml-2 text-sm font-normal tabular-nums text-muted-foreground">
                    {active.length}
                  </span>
                </h2>
                <p className="mt-0.5 text-sm text-muted-foreground text-pretty">
                  Assignment types define modules and the tutor experience.
                </p>
              </div>
              <Button size="sm" asChild>
                <Link to="/app/admin/assignment-types">
                  <Plus className="size-4 shrink-0" />
                  New
                </Link>
              </Button>
            </div>
            <AssignmentsTable active={active} archived={archived} />
          </section>

          <div className="border-t border-black/10" />

          <section className="flex flex-col gap-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-balance">
                  Grading
                  <span className="ml-2 text-sm font-normal tabular-nums text-muted-foreground">
                    {gradingTemplates.length}
                  </span>
                </h2>
                <p className="mt-0.5 text-sm text-muted-foreground text-pretty">
                  Grading assistants score submissions against rubrics.
                </p>
              </div>
              <Button size="sm" variant="outline" asChild>
                <Link to="/app/admin/grading-assistants/new">
                  <Plus className="size-4 shrink-0" />
                  New
                </Link>
              </Button>
            </div>
            <GradingTable templates={gradingTemplates} />
          </section>
        </div>
      </div>

      {/* ── Option C: Side-by-side columns ───────────────────────────── */}
      <div data-uidotsh-option="Side by side" className="contents" hidden>
        <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr]">
          {/* Left — Assignments */}
          <div className="flex flex-col gap-4 p-3 md:p-5 lg:border-r lg:border-black/5">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-base font-semibold text-balance">Assignments</h2>
              <Button size="sm" asChild>
                <Link to="/app/admin/assignment-types">
                  <Plus className="size-4 shrink-0" />
                  New
                </Link>
              </Button>
            </div>
            <AssignmentsTable active={active} archived={archived} />
          </div>

          {/* Right — Grading */}
          <div className="flex flex-col gap-4 border-t border-black/5 p-3 md:p-5 lg:border-t-0">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-base font-semibold text-balance">Grading</h2>
              <Button size="sm" variant="outline" asChild>
                <Link to="/app/admin/grading-assistants/new">
                  <Plus className="size-4 shrink-0" />
                  New
                </Link>
              </Button>
            </div>
            <GradingTable templates={gradingTemplates} />
          </div>
        </div>
      </div>

    </div>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
