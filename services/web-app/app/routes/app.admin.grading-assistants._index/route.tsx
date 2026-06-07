import {
  data as dataResponse,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  useFetcher,
  useLoaderData,
} from 'react-router';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import {
  Archive,
  AlertTriangle,
  CheckCircle2,
  Link2,
  Pencil,
  Plus,
} from 'lucide-react';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Badge } from '~/components/ui/badge';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '~/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import { Textarea } from '~/components/ui/textarea';
import { requireAdmin, requireProfile, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';

const ALLOWED_TEMPLATE_STATUSES = new Set(['draft', 'active', 'archived']);

const DEFAULT_SCORING_SCALE_JSON =
  '{\n  "type": "weighted_1_5",\n  "minScore": 1,\n  "maxScore": 5\n}';
const DEFAULT_RUBRIC_JSON = '{\n  "categories": []\n}';
const DEFAULT_PROMPT_CONFIG_JSON = '{\n  "systemInstructions": ""\n}';
const DEFAULT_OUTPUT_SCHEMA_JSON = '{\n  "schemaVersion": 1\n}';

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);

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

function parseJsonField(formData: FormData, name: string) {
  const raw = formData.get(name)?.toString().trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Response(`${name} must be valid JSON.`, { status: 400 });
  }
}

function requireString(formData: FormData, name: string) {
  const value = formData.get(name)?.toString().trim();
  if (!value) {
    throw new Response(`${name} is required.`, { status: 400 });
  }
  return value;
}

export async function action({ request }: ActionFunctionArgs) {
  await requireAdmin(request);
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);
  const formData = await request.formData();
  const intent = formData.get('intent');

  if (intent === 'createTemplate') {
    const name = requireString(formData, 'name');
    const slug = requireString(formData, 'slug');
    const assignmentTypeKind =
      formData.get('assignmentTypeKind')?.toString().trim() || null;
    const calibrationNotes =
      formData.get('calibrationNotes')?.toString().trim() || null;

    await prisma.gradingAssistantTemplate.create({
      data: {
        name,
        slug,
        status: 'draft',
        version: 1,
        assignmentTypeKind,
        scoringScale: parseJsonField(formData, 'scoringScale'),
        rubricJson: parseJsonField(formData, 'rubricJson'),
        promptConfigJson: parseJsonField(formData, 'promptConfigJson'),
        outputSchemaJson: parseJsonField(formData, 'outputSchemaJson'),
        calibrationNotes,
        createdById: profile.id,
        updatedById: profile.id,
      },
    });

    return dataResponse({ status: 'success' });
  }

  if (intent === 'updateTemplate') {
    const templateId = requireString(formData, 'templateId');
    const name = requireString(formData, 'name');
    const slug = requireString(formData, 'slug');
    const assignmentTypeKind =
      formData.get('assignmentTypeKind')?.toString().trim() || null;
    const calibrationNotes =
      formData.get('calibrationNotes')?.toString().trim() || null;

    await prisma.gradingAssistantTemplate.update({
      where: { id: templateId },
      data: {
        name,
        slug,
        assignmentTypeKind,
        scoringScale: parseJsonField(formData, 'scoringScale'),
        rubricJson: parseJsonField(formData, 'rubricJson'),
        promptConfigJson: parseJsonField(formData, 'promptConfigJson'),
        outputSchemaJson: parseJsonField(formData, 'outputSchemaJson'),
        calibrationNotes,
        version: { increment: 1 },
        updatedById: profile.id,
      },
    });

    return dataResponse({ status: 'success' });
  }

  if (intent === 'setStatus') {
    const templateId = requireString(formData, 'templateId');
    const status = requireString(formData, 'status');
    if (!ALLOWED_TEMPLATE_STATUSES.has(status)) {
      return dataResponse({ status: 'error' }, { status: 400 });
    }

    await prisma.gradingAssistantTemplate.update({
      where: { id: templateId },
      data: { status, updatedById: profile.id },
    });

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

export default function GradingAssistantsRoute() {
  const { templates, assignmentTypes } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<
    (typeof templates)[number] | null
  >(null);

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data) {
      setIsSheetOpen(false);
      setEditingTemplate(null);
    }
  }, [fetcher.state, fetcher.data]);

  const activeTemplates = templates.filter((t) => t.status === 'active');
  const uncoveredAssignmentTypes = assignmentTypes.filter(
    (assignmentType) => !hasActiveDefaultLink(assignmentType)
  );
  const coveredAssignmentTypes = assignmentTypes.filter((assignmentType) =>
    hasActiveDefaultLink(assignmentType)
  );

  return (
    <div className="grid gap-4 p-3 md:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Grading assistant templates</h2>
        <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
          <SheetTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Template
            </Button>
          </SheetTrigger>
          <SheetContent className="overflow-y-auto sm:max-w-xl">
            <SheetHeader>
              <SheetTitle>Create Grading Assistant Template</SheetTitle>
            </SheetHeader>
            <fetcher.Form method="post" className="mt-4 space-y-4">
              <input type="hidden" name="intent" value="createTemplate" />
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug">Slug</Label>
                <Input id="slug" name="slug" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="assignmentTypeKind">Assignment Type Kind</Label>
                <Input id="assignmentTypeKind" name="assignmentTypeKind" />
              </div>
              <JsonTextarea
                id="scoringScale"
                label="Scoring Scale JSON"
                defaultValue={DEFAULT_SCORING_SCALE_JSON}
              />
              <JsonTextarea
                id="rubricJson"
                label="Rubric JSON"
                defaultValue={DEFAULT_RUBRIC_JSON}
              />
              <JsonTextarea
                id="promptConfigJson"
                label="Prompt Config JSON"
                defaultValue={DEFAULT_PROMPT_CONFIG_JSON}
              />
              <JsonTextarea
                id="outputSchemaJson"
                label="Output Schema JSON"
                defaultValue={DEFAULT_OUTPUT_SCHEMA_JSON}
              />
              <div className="space-y-2">
                <Label htmlFor="calibrationNotes">Calibration Notes</Label>
                <Textarea id="calibrationNotes" name="calibrationNotes" />
              </div>
              <Button disabled={fetcher.state !== 'idle'} className="w-full">
                Create Draft
              </Button>
            </fetcher.Form>
          </SheetContent>
        </Sheet>
      </div>

      {editingTemplate && (
        <Sheet
          open={editingTemplate != null}
          onOpenChange={(open) => {
            if (!open) setEditingTemplate(null);
          }}
        >
          <SheetContent className="overflow-y-auto sm:max-w-xl">
            <SheetHeader>
              <SheetTitle>Edit Grading Assistant Template</SheetTitle>
            </SheetHeader>
            <fetcher.Form
              key={editingTemplate.id}
              method="post"
              className="mt-4 space-y-4"
            >
              <input type="hidden" name="intent" value="updateTemplate" />
              <input
                type="hidden"
                name="templateId"
                value={editingTemplate.id}
              />
              <div className="space-y-2">
                <Label htmlFor="edit-name">Name</Label>
                <Input
                  id="edit-name"
                  name="name"
                  defaultValue={editingTemplate.name}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-slug">Slug</Label>
                <Input
                  id="edit-slug"
                  name="slug"
                  defaultValue={editingTemplate.slug}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-assignmentTypeKind">
                  Assignment Type Kind
                </Label>
                <Input
                  id="edit-assignmentTypeKind"
                  name="assignmentTypeKind"
                  defaultValue={editingTemplate.assignmentTypeKind ?? ''}
                />
              </div>
              <JsonTextarea
                id="edit-scoringScale"
                name="scoringScale"
                label="Scoring Scale JSON"
                defaultValue={formatJsonField(editingTemplate.scoringScale)}
              />
              <JsonTextarea
                id="edit-rubricJson"
                name="rubricJson"
                label="Rubric JSON"
                defaultValue={formatJsonField(editingTemplate.rubricJson)}
              />
              <JsonTextarea
                id="edit-promptConfigJson"
                name="promptConfigJson"
                label="Prompt Config JSON"
                defaultValue={formatJsonField(editingTemplate.promptConfigJson)}
              />
              <JsonTextarea
                id="edit-outputSchemaJson"
                name="outputSchemaJson"
                label="Output Schema JSON"
                defaultValue={formatJsonField(editingTemplate.outputSchemaJson)}
              />
              <div className="space-y-2">
                <Label htmlFor="edit-calibrationNotes">
                  Calibration Notes
                </Label>
                <Textarea
                  id="edit-calibrationNotes"
                  name="calibrationNotes"
                  defaultValue={editingTemplate.calibrationNotes ?? ''}
                />
              </div>
              <Button
                type="submit"
                disabled={fetcher.state !== 'idle'}
                className="w-full"
              >
                {fetcher.state !== 'idle' ? 'Saving...' : 'Save Changes'}
              </Button>
            </fetcher.Form>
          </SheetContent>
        </Sheet>
      )}

      {/* Coverage summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Total templates', value: templates.length },
          { label: 'Active templates', value: activeTemplates.length },
          {
            label: 'Covered assignment types',
            value: coveredAssignmentTypes.length,
          },
          {
            label: 'Uncovered assignment types',
            value: uncoveredAssignmentTypes.length,
            warn: uncoveredAssignmentTypes.length > 0,
          },
        ].map(({ label, value, warn }) => (
          <div
            key={label}
            className={`rounded-[8px] border px-4 py-3 ${
              warn ? 'border-yellow-400 bg-yellow-50' : 'bg-muted'
            }`}
          >
            <div
              className={`text-2xl font-semibold tabular-nums ${
                warn ? 'text-yellow-800' : ''
              }`}
            >
              {value}
            </div>
            <div
              className={`text-xs ${
                warn ? 'text-yellow-700' : 'text-muted-foreground'
              }`}
            >
              {label}
            </div>
          </div>
        ))}
      </div>

      {uncoveredAssignmentTypes.length > 0 && (
        <Card className="border-yellow-400 bg-yellow-50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-yellow-800 text-base">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Assignment types not production covered
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-yellow-200">
              {uncoveredAssignmentTypes.map((assignmentType) => (
                <div
                  key={assignmentType.id}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <div>
                    <div className="font-medium text-sm">{assignmentType.title}</div>
                    <div className="text-xs text-yellow-700">
                      <span className="font-mono">
                        {assignmentType.kind || 'no stable kind'}
                      </span>
                      <span className="mx-2">/</span>
                      {coverageReason(assignmentType)}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-yellow-400 text-yellow-800 hover:bg-yellow-100"
                    asChild
                  >
                    <a href={`/app/admin/assignment-types/${assignmentType.id}`}>
                      <Link2 className="mr-1.5 h-3.5 w-3.5" />
                      Link
                    </a>
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="bg-muted">
        <CardHeader>
          <CardTitle>Templates</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ver.</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Scoring type</TableHead>
                <TableHead>Default links</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((template) => {
                const scoringScale = template.scoringScale as Record<
                  string,
                  unknown
                > | null;
                const scoringType =
                  typeof scoringScale?.type === 'string'
                    ? scoringScale.type
                    : '-';
                return (
                  <TableRow key={template.id}>
                    <TableCell className="font-medium">
                      <button
                        type="button"
                        className="text-left hover:underline"
                        onClick={() => setEditingTemplate(template)}
                      >
                        {template.name}
                      </button>
                      <div className="text-xs text-muted-foreground font-mono">{template.slug}</div>
                    </TableCell>
                    <TableCell>{statusBadge(template.status)}</TableCell>
                    <TableCell>v{template.version}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {template.assignmentTypeKind ?? '-'}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{scoringType}</TableCell>
                    <TableCell>
                      {template.assignmentTypeLinks.length === 0
                        ? <span className="text-sm text-muted-foreground">None</span>
                        : template.assignmentTypeLinks
                            .map((link) => link.assignmentType.title)
                            .join(', ')}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingTemplate(template)}
                        >
                          <Pencil className="h-4 w-4" />
                          Edit
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

function hasActiveDefaultLink(assignmentType: {
  gradingAssistantLinks: Array<{
    gradingAssistantTemplate: { status: string };
  }>;
}) {
  return assignmentType.gradingAssistantLinks.some(
    (link) => link.gradingAssistantTemplate.status === 'active'
  );
}

function coverageReason(assignmentType: {
  gradingAssistantLinks: Array<{
    gradingAssistantTemplate: { name: string; status: string };
  }>;
}) {
  const link = assignmentType.gradingAssistantLinks[0];
  if (!link) return 'No default link';
  return `${link.gradingAssistantTemplate.name} is ${link.gradingAssistantTemplate.status}`;
}

function JsonTextarea({
  id,
  name = id,
  label,
  defaultValue,
}: {
  id: string;
  name?: string;
  label: string;
  defaultValue: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        name={name}
        defaultValue={defaultValue}
        rows={6}
        className="font-mono text-xs"
        required
      />
    </div>
  );
}

function formatJsonField(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
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
