import {
  data as dataResponse,
  Link,
  redirect,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  useFetcher,
  useLoaderData,
} from 'react-router';
import type { ReactNode } from 'react';
import { Archive, CheckCircle2, Pencil, Plus } from 'lucide-react';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Badge } from '~/components/ui/badge';
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
import { setGradingAssistantTemplateStatus } from '~/utils/grading-assistant-template-admin.server';
import {
  parseRubric,
  parseScoringScale,
} from '~/utils/grading-assistant-template.shared';

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);
  return redirect('/app/admin/assignments-grading');

  const [templates, assignmentTypes] = await Promise.all([
    prisma.gradingAssistantTemplate.findMany({
      include: {
        assignmentTypeLinks: {
          where: { isDefault: true, activeTo: null },
          include: {
            assignmentType: { select: { id: true, title: true, kind: true } },
          },
          orderBy: { activeFrom: 'desc' },
        },
      },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    }),
    prisma.assignmentType.findMany({
      select: {
        id: true,
        title: true,
        kind: true,
        gradingAssistantLinks: {
          where: { isDefault: true, activeTo: null },
          select: {
            id: true,
            gradingAssistantTemplate: {
              select: { name: true, status: true },
            },
          },
        },
      },
      orderBy: { title: 'asc' },
    }),
  ]);

  return dataResponse({ templates, assignmentTypes });
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const intent = formData.get('intent');

  if (intent === 'setStatus') {
    const templateId = formData.get('templateId')?.toString().trim();
    const status = formData.get('status')?.toString().trim();
    if (!templateId || !status) {
      return dataResponse({ status: 'error' }, { status: 400 });
    }

    await setGradingAssistantTemplateStatus(request, templateId, status);
    return dataResponse({ status: 'success' });
  }

  return dataResponse({ status: 'error' }, { status: 400 });
}

function statusBadge(status: string) {
  if (status === 'active') {
    return (
      <Badge className="border-green-200 bg-green-100 text-green-800 hover:bg-green-100">
        active
      </Badge>
    );
  }
  if (status === 'archived') {
    return <Badge variant="secondary">archived</Badge>;
  }
  return <Badge variant="outline">draft</Badge>;
}

function hasActiveDefaultLink(assignmentType: {
  gradingAssistantLinks: Array<{
    gradingAssistantTemplate: { status: string };
  }>;
}) {
  return assignmentType.gradingAssistantLinks.some(
    (link) => link.gradingAssistantTemplate.status === 'active'
  );
}

export default function GradingAssistantsRoute() {
  const { templates, assignmentTypes } = useLoaderData<typeof loader>();

  const activeTemplates = templates.filter((t) => t.status === 'active');
  const coveredAssignmentTypes = assignmentTypes.filter((assignmentType) =>
    hasActiveDefaultLink(assignmentType)
  );

  return (
    <div className="grid gap-4 p-3 md:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Grading assistants</h2>
        <Button size="sm" asChild>
          <Link to="/app/admin/grading-assistants/new">
            <Plus className="mr-1.5 h-4 w-4" />
            New grading assistant
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[
          { label: 'All grading assistants', value: templates.length },
          { label: 'Active', value: activeTemplates.length },
          { label: 'Covered assignments', value: coveredAssignmentTypes.length },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-[8px] border bg-muted px-4 py-3">
            <div className="text-2xl font-semibold tabular-nums">{value}</div>
            <div className="text-xs text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>

      <Card className="bg-muted">
        <CardHeader>
          <CardTitle>All grading assistants</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="whitespace-nowrap">Ver.</TableHead>
                <TableHead className="whitespace-nowrap">Scoring</TableHead>
                <TableHead>Linked to</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((template) => {
                const scale = parseScoringScale(template.scoringScale);
                const rubric = parseRubric(template.rubricJson);
                return (
                  <TableRow key={template.id}>
                    <TableCell className="font-medium">
                      <Link
                        to={`/app/admin/grading-assistants/${template.id}`}
                        className="hover:underline"
                      >
                        {template.name}
                      </Link>
                    </TableCell>
                    <TableCell>{statusBadge(template.status)}</TableCell>
                    <TableCell>v{template.version}</TableCell>
                    <TableCell className="text-xs">
                      <span className="font-mono">{scale.type}</span>
                      <span className="ml-1 text-muted-foreground">
                        {scale.minScore}–{scale.maxScore}
                      </span>
                      {rubric.categories.length > 0 && (
                        <span className="ml-1 text-muted-foreground">
                          · {rubric.categories.length} cat.
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {template.assignmentTypeLinks.length === 0 ? (
                        <span className="text-sm text-muted-foreground">None</span>
                      ) : (
                        template.assignmentTypeLinks
                          .map((l) => l.assignmentType.title)
                          .join(', ')
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="outline" asChild>
                          <Link to={`/app/admin/grading-assistants/${template.id}`}>
                            <Pencil className="h-4 w-4" />
                            Edit
                          </Link>
                        </Button>
                        {template.status !== 'active' && (
                          <TemplateStatusButton
                            templateId={template.id}
                            status="active"
                            label="Activate"
                            icon={<CheckCircle2 className="h-4 w-4" />}
                          />
                        )}
                        {template.status !== 'archived' && (
                          <TemplateStatusButton
                            templateId={template.id}
                            status="archived"
                            label="Archive"
                            icon={<Archive className="h-4 w-4" />}
                          />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function TemplateStatusButton({
  templateId,
  status,
  label,
  icon,
}: {
  templateId: string;
  status: string;
  label: string;
  icon: ReactNode;
}) {
  const fetcher = useFetcher();
  return (
    <fetcher.Form method="post">
      <input type="hidden" name="intent" value="setStatus" />
      <input type="hidden" name="templateId" value={templateId} />
      <input type="hidden" name="status" value={status} />
      <Button
        type="submit"
        size="sm"
        variant="outline"
        disabled={fetcher.state !== 'idle'}
      >
        {icon}
        {label}
      </Button>
    </fetcher.Form>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
