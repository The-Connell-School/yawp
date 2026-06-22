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
  CheckCircle2,
  GripVertical,
  Pencil,
  Plus,
  Trash2,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { requireAdmin, requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';

const ALLOWED_TEMPLATE_STATUSES = new Set(['draft', 'active', 'archived']);
const NO_DEFAULT_ASSIGNMENT_TYPE = '__no_default_assignment_type__';

// ─── JSON shape types ──────────────────────────────────────────────────────

type ScoringScaleData = {
  type: string;
  minScore: number;
  maxScore: number;
  compositeMin?: number;
  compositeMax?: number;
};

type RubricCategory = {
  key: string;
  label: string;
  weight: number;
  description: string;
};

type RubricData = {
  categories: RubricCategory[];
};

type PromptConfigData = {
  systemInstructions?: string;
  scoreInstructions?: string;
  rubricInstructions?: string;
  instructionsPreset?: string;
};

type OutputSchemaData = {
  responseShape: string;
  schemaVersion: number;
};

// ─── default values ────────────────────────────────────────────────────────

const DEFAULT_SCORING_SCALE: ScoringScaleData = {
  type: 'weighted_1_5',
  minScore: 1,
  maxScore: 5,
};

const DEFAULT_RUBRIC: RubricData = { categories: [] };

const DEFAULT_PROMPT_CONFIG: PromptConfigData = { systemInstructions: '' };

const DEFAULT_OUTPUT_SCHEMA: OutputSchemaData = {
  responseShape: 'categories_overall_comment',
  schemaVersion: 1,
};

const SCORING_SCALE_TYPES = [
  { value: 'weighted_1_5', label: 'Weighted 1–5' },
  { value: 'act_writing_2_12', label: 'ACT Writing 2–12' },
  { value: 'rubric_points', label: 'Rubric points' },
];

const RESPONSE_SHAPES = [
  { value: 'categories_overall_comment', label: 'Categories + overall comment' },
  { value: 'overall_score_comment', label: 'Overall score + comment only' },
];

function parseScoringScale(raw: unknown): ScoringScaleData {
  const d = raw as Partial<ScoringScaleData> | null;
  return {
    type: d?.type ?? 'weighted_1_5',
    minScore: d?.minScore ?? 1,
    maxScore: d?.maxScore ?? 5,
    compositeMin: d?.compositeMin,
    compositeMax: d?.compositeMax,
  };
}

function parseRubric(raw: unknown): RubricData {
  const d = raw as Partial<RubricData> | null;
  const cats = Array.isArray(d?.categories) ? d!.categories : [];
  return {
    categories: cats.map((c: any) => ({
      key: c.key ?? '',
      label: c.label ?? '',
      weight: typeof c.weight === 'number' ? c.weight : 0,
      description: c.description ?? '',
    })),
  };
}

function parsePromptConfig(raw: unknown): PromptConfigData {
  const d = raw as Partial<PromptConfigData> | null;
  return {
    systemInstructions: d?.systemInstructions ?? '',
    scoreInstructions: d?.scoreInstructions ?? '',
    rubricInstructions: d?.rubricInstructions ?? '',
    instructionsPreset: d?.instructionsPreset ?? '',
  };
}

function parseOutputSchema(raw: unknown): OutputSchemaData {
  const d = raw as Partial<OutputSchemaData> | null;
  return {
    responseShape: d?.responseShape ?? 'categories_overall_comment',
    schemaVersion: d?.schemaVersion ?? 1,
  };
}

function labelToKey(label: string) {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

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
  const profile = await requireMembership(request, userId);
  const formData = await request.formData();
  const intent = formData.get('intent');

  if (intent === 'createTemplate') {
    const name = requireString(formData, 'name');
    const slug =
      formData.get('slug')?.toString().trim() ||
      name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const assignmentTypeKind =
      formData.get('assignmentTypeKind')?.toString().trim() || null;
    const defaultAssignmentTypeIdRaw =
      formData.get('defaultAssignmentTypeId')?.toString().trim() || null;
    const defaultAssignmentTypeId =
      defaultAssignmentTypeIdRaw &&
      defaultAssignmentTypeIdRaw !== NO_DEFAULT_ASSIGNMENT_TYPE
        ? defaultAssignmentTypeIdRaw
        : null;
    const calibrationNotes =
      formData.get('calibrationNotes')?.toString().trim() || null;

    await prisma.$transaction(async (tx) => {
      const template = await tx.gradingAssistantTemplate.create({
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
          createdByMembershipId: profile.id,
          updatedByMembershipId: profile.id,
        },
      });

      if (!defaultAssignmentTypeId) return;

      const activeFrom = new Date();
      await tx.assignmentTypeGradingAssistant.create({
        data: {
          assignmentTypeId: defaultAssignmentTypeId,
          gradingAssistantTemplateId: template.id,
          isDefault: true,
          activeFrom,
        },
      });
    });

    return dataResponse({ status: 'success' });
  }

  if (intent === 'updateTemplate') {
    const templateId = requireString(formData, 'templateId');
    const name = requireString(formData, 'name');
    const slug =
      formData.get('slug')?.toString().trim() ||
      name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
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
        updatedByMembershipId: profile.id,
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
      data: { status, updatedByMembershipId: profile.id },
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

// ─── sub-editors ──────────────────────────────────────────────────────────

function ScoringScaleEditor({
  initial,
  namePrefix = '',
}: {
  initial: ScoringScaleData;
  namePrefix?: string;
}) {
  const [scale, setScale] = useState<ScoringScaleData>(initial);
  const isAct = scale.type === 'act_writing_2_12';

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={`${namePrefix}scoreType`}>Scoring type</Label>
        <Select
          value={scale.type}
          onValueChange={(v) => setScale((s) => ({ ...s, type: v }))}
        >
          <SelectTrigger id={`${namePrefix}scoreType`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SCORING_SCALE_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${namePrefix}minScore`}>Min score</Label>
          <Input
            id={`${namePrefix}minScore`}
            type="number"
            value={scale.minScore}
            min={0}
            onChange={(e) =>
              setScale((s) => ({ ...s, minScore: Number(e.target.value) }))
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${namePrefix}maxScore`}>Max score</Label>
          <Input
            id={`${namePrefix}maxScore`}
            type="number"
            value={scale.maxScore}
            min={1}
            onChange={(e) =>
              setScale((s) => ({ ...s, maxScore: Number(e.target.value) }))
            }
          />
        </div>
      </div>

      {isAct && (
        <div className="grid grid-cols-2 gap-3 rounded-[8px] border border-dashed p-3">
          <p className="col-span-2 text-xs text-muted-foreground">
            ACT composite range (domain averages are doubled)
          </p>
          <div className="space-y-1.5">
            <Label htmlFor={`${namePrefix}compositeMin`}>Composite min</Label>
            <Input
              id={`${namePrefix}compositeMin`}
              type="number"
              value={scale.compositeMin ?? 2}
              onChange={(e) =>
                setScale((s) => ({
                  ...s,
                  compositeMin: Number(e.target.value),
                }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${namePrefix}compositeMax`}>Composite max</Label>
            <Input
              id={`${namePrefix}compositeMax`}
              type="number"
              value={scale.compositeMax ?? 12}
              onChange={(e) =>
                setScale((s) => ({
                  ...s,
                  compositeMax: Number(e.target.value),
                }))
              }
            />
          </div>
        </div>
      )}

      <input type="hidden" name="scoringScale" value={JSON.stringify(scale)} />
    </div>
  );
}

function RubricEditor({
  initial,
  namePrefix = '',
}: {
  initial: RubricData;
  namePrefix?: string;
}) {
  const [cats, setCats] = useState<RubricCategory[]>(initial.categories);
  const totalWeight = cats.reduce((s, c) => s + (c.weight || 0), 0);
  const weightOk = Math.abs(totalWeight - 1) < 0.001;

  function addCat() {
    setCats((prev) => [
      ...prev,
      { key: '', label: '', weight: 0, description: '' },
    ]);
  }

  function removeCat(i: number) {
    setCats((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateCat(i: number, patch: Partial<RubricCategory>) {
    setCats((prev) =>
      prev.map((c, idx) => {
        if (idx !== i) return c;
        const next = { ...c, ...patch };
        if ('label' in patch && !patch.key) {
          next.key = labelToKey(patch.label ?? '');
        }
        return next;
      })
    );
  }

  const pct = (w: number) => Math.round(w * 100);

  return (
    <div className="space-y-3">
      {cats.length === 0 ? (
        <p className="rounded-[8px] border border-dashed py-5 text-center text-sm text-muted-foreground">
          No categories yet. Add one below.
        </p>
      ) : (
        <div className="space-y-3">
          {cats.map((cat, i) => (
            <div
              key={i}
              className="rounded-[8px] border bg-muted/40 p-3 space-y-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <GripVertical className="h-3.5 w-3.5 shrink-0" />
                  Category {i + 1}
                </span>
                <button
                  type="button"
                  onClick={() => removeCat(i)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Remove category"
                >
                  <Trash2 className="h-3.5 w-3.5 shrink-0" />
                </button>
              </div>

              <div className="grid grid-cols-[1fr_auto] gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`${namePrefix}catLabel${i}`}>Label</Label>
                  <Input
                    id={`${namePrefix}catLabel${i}`}
                    value={cat.label}
                    placeholder="e.g. Thesis & Content"
                    onChange={(e) =>
                      updateCat(i, {
                        label: e.target.value,
                        key: labelToKey(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${namePrefix}catWeight${i}`}>
                    Weight %
                  </Label>
                  <Input
                    id={`${namePrefix}catWeight${i}`}
                    type="number"
                    min={0}
                    max={100}
                    className="w-20 tabular-nums"
                    value={pct(cat.weight)}
                    onChange={(e) =>
                      updateCat(i, {
                        weight: Number(e.target.value) / 100,
                      })
                    }
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={`${namePrefix}catKey${i}`}>
                  Key{' '}
                  <span className="font-normal text-muted-foreground">
                    (auto)
                  </span>
                </Label>
                <Input
                  id={`${namePrefix}catKey${i}`}
                  value={cat.key}
                  className="font-mono text-xs"
                  placeholder="snake_case_key"
                  onChange={(e) => updateCat(i, { key: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={`${namePrefix}catDesc${i}`}>Description</Label>
                <Textarea
                  id={`${namePrefix}catDesc${i}`}
                  value={cat.description}
                  rows={2}
                  placeholder="What does good performance look like?"
                  onChange={(e) =>
                    updateCat(i, { description: e.target.value })
                  }
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* weight balance indicator */}
      {cats.length > 0 && (
        <div
          className={`flex items-center gap-2 text-xs ${weightOk ? 'text-green-700' : 'text-amber-700'}`}
        >
          <div
            className={`h-1.5 flex-1 overflow-hidden rounded-full ${weightOk ? 'bg-green-200' : 'bg-amber-200'}`}
          >
            <div
              className={`h-full rounded-full transition-all ${weightOk ? 'bg-green-600' : 'bg-amber-500'}`}
              style={{ width: `${Math.min(totalWeight * 100, 100)}%` }}
            />
          </div>
          <span className="tabular-nums">
            {pct(totalWeight)}% {weightOk ? '✓' : '— must total 100%'}
          </span>
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addCat}
        className="w-full"
      >
        <Plus className="mr-1.5 h-4 w-4" />
        Add category
      </Button>

      <input
        type="hidden"
        name="rubricJson"
        value={JSON.stringify({ categories: cats })}
      />
    </div>
  );
}

function PromptConfigEditor({
  initial,
  namePrefix = '',
}: {
  initial: PromptConfigData;
  namePrefix?: string;
}) {
  const [cfg, setCfg] = useState<PromptConfigData>(initial);

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={`${namePrefix}sysInstr`}>System instructions</Label>
        <Textarea
          id={`${namePrefix}sysInstr`}
          rows={4}
          value={cfg.systemInstructions ?? ''}
          placeholder="High-level system prompt for the grading assistant…"
          onChange={(e) =>
            setCfg((c) => ({ ...c, systemInstructions: e.target.value }))
          }
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${namePrefix}scoreInstr`}>Scoring instructions</Label>
        <Textarea
          id={`${namePrefix}scoreInstr`}
          rows={3}
          value={cfg.scoreInstructions ?? ''}
          placeholder="How scores should be assigned (e.g. 'Scores must be integers 1–6')…"
          onChange={(e) =>
            setCfg((c) => ({ ...c, scoreInstructions: e.target.value }))
          }
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${namePrefix}rubricInstr`}>Rubric instructions</Label>
        <Textarea
          id={`${namePrefix}rubricInstr`}
          rows={3}
          value={cfg.rubricInstructions ?? ''}
          placeholder="How to apply the rubric categories…"
          onChange={(e) =>
            setCfg((c) => ({ ...c, rubricInstructions: e.target.value }))
          }
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${namePrefix}preset`}>
          Instructions preset{' '}
          <span className="font-normal text-muted-foreground">
            (overrides the above when set)
          </span>
        </Label>
        <Input
          id={`${namePrefix}preset`}
          value={cfg.instructionsPreset ?? ''}
          className="font-mono text-sm"
          placeholder="e.g. legacy_thesis_driven_essay"
          onChange={(e) =>
            setCfg((c) => ({ ...c, instructionsPreset: e.target.value }))
          }
        />
        <p className="text-xs text-muted-foreground">
          Leave blank to use the instructions above. Fill in only if this
          template delegates to a hard-coded prompt preset.
        </p>
      </div>

      <input
        type="hidden"
        name="promptConfigJson"
        value={JSON.stringify(
          Object.fromEntries(
            Object.entries(cfg).filter(([, v]) => v !== '' && v != null)
          )
        )}
      />
    </div>
  );
}

function OutputSchemaEditor({
  initial,
  namePrefix = '',
}: {
  initial: OutputSchemaData;
  namePrefix?: string;
}) {
  const [schema, setSchema] = useState<OutputSchemaData>(initial);

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={`${namePrefix}responseShape`}>Response shape</Label>
        <Select
          value={schema.responseShape}
          onValueChange={(v) =>
            setSchema((s) => ({ ...s, responseShape: v }))
          }
        >
          <SelectTrigger id={`${namePrefix}responseShape`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RESPONSE_SHAPES.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Controls which fields the AI returns and how the app renders the grade.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${namePrefix}schemaVersion`}>Schema version</Label>
        <Input
          id={`${namePrefix}schemaVersion`}
          type="number"
          min={1}
          value={schema.schemaVersion}
          onChange={(e) =>
            setSchema((s) => ({ ...s, schemaVersion: Number(e.target.value) }))
          }
        />
      </div>

      <input
        type="hidden"
        name="outputSchemaJson"
        value={JSON.stringify(schema)}
      />
    </div>
  );
}

// ─── section wrapper ───────────────────────────────────────────────────────

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium leading-none">{title}</p>
        {description && (
          <p className="mt-1 text-xs text-muted-foreground text-pretty">{description}</p>
        )}
      </div>
      <div className="rounded-[8px] border bg-muted/30 p-3 space-y-3">
        {children}
      </div>
    </div>
  );
}

// ─── main route component ──────────────────────────────────────────────────

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
  const coveredAssignmentTypes = assignmentTypes.filter((assignmentType) =>
    hasActiveDefaultLink(assignmentType)
  );

  return (
    <div className="grid gap-4 p-3 md:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Grading assistant templates</h2>
        <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
          <SheetTrigger asChild>
            <Button size="sm">
              <Plus className="mr-1.5 h-4 w-4" />
              New template
            </Button>
          </SheetTrigger>
          <SheetContent className="overflow-y-auto sm:max-w-2xl">
            <SheetHeader>
              <SheetTitle>Create grading template</SheetTitle>
            </SheetHeader>
            <fetcher.Form method="post" className="mt-5 space-y-5">
              <input type="hidden" name="intent" value="createTemplate" />

              <FormSection title="Identity">
                <div className="space-y-1.5">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" name="name" placeholder="e.g. ACT Writing four-domain" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="assignmentTypeKind">
                    Assignment type kind{' '}
                    <span className="font-normal text-muted-foreground">(optional)</span>
                  </Label>
                  <Input id="assignmentTypeKind" name="assignmentTypeKind" className="font-mono text-sm" placeholder="act_writing" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="defaultAssignmentTypeId">Link to assignment</Label>
                  <Select name="defaultAssignmentTypeId" defaultValue={NO_DEFAULT_ASSIGNMENT_TYPE}>
                    <SelectTrigger id="defaultAssignmentTypeId">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_DEFAULT_ASSIGNMENT_TYPE}>
                        No link yet (link later from assignment page)
                      </SelectItem>
                      {assignmentTypes.map((at) => (
                        <SelectItem key={at.id} value={at.id}>
                          {at.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Draft templates won't become runtime defaults until activated.
                  </p>
                </div>
              </FormSection>

              <FormSection
                title="Scoring scale"
                description="Defines the numeric range used when scoring each rubric category."
              >
                <ScoringScaleEditor initial={DEFAULT_SCORING_SCALE} namePrefix="c-" />
              </FormSection>

              <FormSection
                title="Rubric categories"
                description="Weighted criteria the AI scores independently. Weights must total 100%."
              >
                <RubricEditor initial={DEFAULT_RUBRIC} namePrefix="c-" />
              </FormSection>

              <FormSection
                title="Prompt configuration"
                description="Instructions that shape how the AI grades. Preset overrides manual instructions."
              >
                <PromptConfigEditor initial={DEFAULT_PROMPT_CONFIG} namePrefix="c-" />
              </FormSection>

              <FormSection
                title="Output schema"
                description="Controls which fields the AI returns and how the app renders the result."
              >
                <OutputSchemaEditor initial={DEFAULT_OUTPUT_SCHEMA} namePrefix="c-" />
              </FormSection>

              <FormSection title="Calibration notes">
                <Textarea
                  id="calibrationNotes"
                  name="calibrationNotes"
                  rows={3}
                  placeholder="Notes for human reviewers — calibration samples, known edge cases, sign-off status…"
                />
              </FormSection>

              <Button type="submit" disabled={fetcher.state !== 'idle'} className="w-full">
                {fetcher.state !== 'idle' ? 'Creating…' : 'Create draft'}
              </Button>
            </fetcher.Form>
          </SheetContent>
        </Sheet>
      </div>

      {editingTemplate && (
        <Sheet
          open={editingTemplate != null}
          onOpenChange={(open) => { if (!open) setEditingTemplate(null); }}
        >
          <SheetContent className="overflow-y-auto sm:max-w-2xl">
            <SheetHeader>
              <SheetTitle>Edit template</SheetTitle>
            </SheetHeader>
            <fetcher.Form key={editingTemplate.id} method="post" className="mt-5 space-y-5">
              <input type="hidden" name="intent" value="updateTemplate" />
              <input type="hidden" name="templateId" value={editingTemplate.id} />

              <FormSection title="Identity">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-name">Name</Label>
                  <Input id="edit-name" name="name" defaultValue={editingTemplate.name} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-kind">Assignment type kind</Label>
                  <Input id="edit-kind" name="assignmentTypeKind" defaultValue={editingTemplate.assignmentTypeKind ?? ''} className="font-mono text-sm" />
                </div>
              </FormSection>

              <FormSection
                title="Scoring scale"
                description="Defines the numeric range used when scoring each rubric category."
              >
                <ScoringScaleEditor
                  initial={parseScoringScale(editingTemplate.scoringScale)}
                  namePrefix="e-"
                />
              </FormSection>

              <FormSection
                title="Rubric categories"
                description="Weighted criteria the AI scores independently. Weights must total 100%."
              >
                <RubricEditor
                  initial={parseRubric(editingTemplate.rubricJson)}
                  namePrefix="e-"
                />
              </FormSection>

              <FormSection
                title="Prompt configuration"
                description="Instructions that shape how the AI grades."
              >
                <PromptConfigEditor
                  initial={parsePromptConfig(editingTemplate.promptConfigJson)}
                  namePrefix="e-"
                />
              </FormSection>

              <FormSection
                title="Output schema"
                description="Controls which fields the AI returns and how the app renders the result."
              >
                <OutputSchemaEditor
                  initial={parseOutputSchema(editingTemplate.outputSchemaJson)}
                  namePrefix="e-"
                />
              </FormSection>

              <FormSection title="Calibration notes">
                <Textarea
                  id="edit-calibrationNotes"
                  name="calibrationNotes"
                  defaultValue={editingTemplate.calibrationNotes ?? ''}
                  rows={3}
                  placeholder="Notes for human reviewers…"
                />
              </FormSection>

              <Button type="submit" disabled={fetcher.state !== 'idle'} className="w-full">
                {fetcher.state !== 'idle' ? 'Saving…' : 'Save changes'}
              </Button>
            </fetcher.Form>
          </SheetContent>
        </Sheet>
      )}

      {/* Coverage summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[
          { label: 'Total templates', value: templates.length },
          { label: 'Active templates', value: activeTemplates.length },
          { label: 'Covered assignment types', value: coveredAssignmentTypes.length },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-[8px] border bg-muted px-4 py-3">
            <div className="text-2xl font-semibold tabular-nums">{value}</div>
            <div className="text-xs text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>

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
                <TableHead className="whitespace-nowrap">Ver.</TableHead>
                <TableHead className="whitespace-nowrap">Kind</TableHead>
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
                      <button
                        type="button"
                        className="text-left hover:underline"
                        onClick={() => setEditingTemplate(template)}
                      >
                        {template.name}
                      </button>
                    </TableCell>
                    <TableCell>{statusBadge(template.status)}</TableCell>
                    <TableCell>v{template.version}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {template.assignmentTypeKind ?? '—'}
                    </TableCell>
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
