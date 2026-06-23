import type { ReactNode } from 'react';
import { useState } from 'react';
import { Link } from 'react-router';
import { ChevronLeft, GripVertical, Plus, Trash2 } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Textarea } from '~/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import {
  NO_DEFAULT_ASSIGNMENT_TYPE,
  type PromptConfigData,
  type RubricCategory,
  type RubricData,
  type ScoringScaleData,
} from '~/utils/grading-assistant-template.shared';

const SCORING_SCALE_TYPES = [
  { value: 'weighted_1_5', label: 'Weighted 1–5' },
  { value: 'act_writing_2_12', label: 'ACT Writing 2–12' },
  { value: 'rubric_points', label: 'Rubric points' },
];

type RubricCategoryRow = RubricCategory & { id: string };

function labelToKey(label: string) {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function createRubricCategoryRow(
  category: Partial<RubricCategory> = {}
): RubricCategoryRow {
  return {
    id: crypto.randomUUID(),
    key: category.key ?? '',
    label: category.label ?? '',
    weight: category.weight ?? 0,
    description: category.description ?? '',
  };
}

function rowsFromCategories(categories: RubricCategory[]): RubricCategoryRow[] {
  return categories.map((category) => createRubricCategoryRow(category));
}

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
        <div className="grid grid-cols-2 gap-3 pt-1">
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

function SortableRubricCategory({
  cat,
  index,
  namePrefix,
  onUpdate,
  onRemove,
}: {
  cat: RubricCategoryRow;
  index: number;
  namePrefix: string;
  onUpdate: (patch: Partial<RubricCategory>) => void;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: cat.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  const pct = (w: number) => Math.round(w * 100);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-[8px] border bg-muted/40 p-3 space-y-2.5 ${isDragging ? 'shadow-sm' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="cursor-grab touch-none active:cursor-grabbing"
            aria-label={`Reorder category ${index + 1}`}
          >
            <GripVertical className="h-4 w-4 shrink-0" />
          </button>
          Category {index + 1}
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="text-muted-foreground hover:text-destructive"
          aria-label="Remove category"
        >
          <Trash2 className="h-3.5 w-3.5 shrink-0" />
        </button>
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${namePrefix}catLabel${cat.id}`}>Label</Label>
          <Input
            id={`${namePrefix}catLabel${cat.id}`}
            value={cat.label}
            placeholder="e.g. Thesis & Content"
            onChange={(e) => onUpdate({ label: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${namePrefix}catWeight${cat.id}`}>Weight %</Label>
          <Input
            id={`${namePrefix}catWeight${cat.id}`}
            type="number"
            min={0}
            max={100}
            className="w-20 tabular-nums"
            value={pct(cat.weight)}
            onChange={(e) =>
              onUpdate({ weight: Number(e.target.value) / 100 })
            }
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${namePrefix}catDesc${cat.id}`}>Description</Label>
        <Textarea
          id={`${namePrefix}catDesc${cat.id}`}
          value={cat.description}
          rows={2}
          placeholder="What does good performance look like?"
          onChange={(e) => onUpdate({ description: e.target.value })}
        />
      </div>
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
  const [cats, setCats] = useState<RubricCategoryRow[]>(() =>
    rowsFromCategories(initial.categories)
  );
  const totalWeight = cats.reduce((s, c) => s + (c.weight || 0), 0);
  const weightOk = Math.abs(totalWeight - 1) < 0.001;

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function addCat() {
    setCats((prev) => [...prev, createRubricCategoryRow()]);
  }

  function removeCat(id: string) {
    setCats((prev) => prev.filter((cat) => cat.id !== id));
  }

  function updateCat(id: string, patch: Partial<RubricCategory>) {
    setCats((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const next = { ...c, ...patch };
        if ('label' in patch) {
          next.key = labelToKey(patch.label ?? '');
        }
        return next;
      })
    );
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setCats((items) => {
      const oldIndex = items.findIndex((item) => item.id === active.id);
      const newIndex = items.findIndex((item) => item.id === over.id);
      return arrayMove(items, oldIndex, newIndex);
    });
  }

  const pct = (w: number) => Math.round(w * 100);

  return (
    <div className="space-y-3">
      {cats.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          No categories yet. Add one below.
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={cats.map((cat) => cat.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-3">
              {cats.map((cat, i) => (
                <SortableRubricCategory
                  key={cat.id}
                  cat={cat}
                  index={i}
                  namePrefix={namePrefix}
                  onUpdate={(patch) => updateCat(cat.id, patch)}
                  onRemove={() => removeCat(cat.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

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
        value={JSON.stringify({
          categories: cats.map(({ id: _id, label, weight, description }) => ({
            key: labelToKey(label),
            label,
            weight,
            description,
          })),
        })}
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
  const usesBuiltInPreset = Boolean(cfg.instructionsPreset?.trim());

  return (
    <div className="space-y-3">
      {usesBuiltInPreset && (
        <p className="text-xs text-muted-foreground text-pretty">
          This grading assistant uses built-in instructions. Add custom instructions
          below to override them.
        </p>
      )}
      <div className="space-y-1.5">
        <Textarea
          id={`${namePrefix}gradingInstr`}
          rows={8}
          value={cfg.gradingInstructions ?? ''}
          placeholder="Tell the AI how to grade this assignment. Include scoring rules, tone, and how to interpret each rubric category."
          onChange={(e) =>
            setCfg((c) => ({ ...c, gradingInstructions: e.target.value }))
          }
        />
      </div>

      <input
        type="hidden"
        name="promptConfigJson"
        value={JSON.stringify(serializePromptConfig(cfg))}
      />
    </div>
  );
}

function serializePromptConfig(cfg: PromptConfigData): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (cfg.gradingInstructions?.trim()) {
    result.gradingInstructions = cfg.gradingInstructions.trim();
  }
  // Legacy records may still carry a preset; preserve it on save without exposing it in the UI.
  if (cfg.instructionsPreset?.trim()) {
    result.instructionsPreset = cfg.instructionsPreset.trim();
  }
  return result;
}

// ─── section wrapper ───────────────────────────────────────────────────────

function StepRailSection({
  step,
  title,
  description,
  isLast = false,
  children,
}: {
  step: number;
  title: string;
  description?: string;
  isLast?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-4">
      <div className="flex flex-col items-center">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
          {step}
        </div>
        {!isLast && <div className="my-2 w-px flex-1 bg-border/80" />}
      </div>
      <div className={`space-y-3 ${isLast ? '' : 'pb-6'}`}>
        <div>
          <p className="text-sm font-medium leading-none">{title}</p>
          {description && (
            <p className="mt-1 text-xs text-muted-foreground text-pretty">{description}</p>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

type GradingAssistantFormSectionsProps = {
  mode: 'create' | 'edit';
  namePrefix: string;
  assignmentTypes: Array<{ id: string; title: string }>;
  nameDefaultValue?: string;
  scoringScale: ScoringScaleData;
  rubric: RubricData;
  promptConfig: PromptConfigData;
};

function GradingAssistantNameField({
  namePrefix,
  defaultValue = '',
}: {
  namePrefix: string;
  defaultValue?: string;
}) {
  const id = `${namePrefix}name`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Name</Label>
      <Input
        id={id}
        name="name"
        defaultValue={defaultValue}
        placeholder="e.g. ACT Writing four-domain"
        required
      />
    </div>
  );
}

function GradingAssistantAssignmentLinkField({
  assignmentTypes,
}: {
  assignmentTypes: Array<{ id: string; title: string }>;
}) {
  return (
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
          {assignmentTypes.map((assignmentType) => (
            <SelectItem key={assignmentType.id} value={assignmentType.id}>
              {assignmentType.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground text-pretty">
        Draft grading assistants won&apos;t become runtime defaults until activated.
      </p>
    </div>
  );
}

function GradingAssistantFormSections({
  mode,
  namePrefix,
  assignmentTypes,
  nameDefaultValue,
  scoringScale,
  rubric,
  promptConfig,
}: GradingAssistantFormSectionsProps) {
  return {
    identity: (
      <GradingAssistantNameField
        namePrefix={namePrefix}
        defaultValue={nameDefaultValue}
      />
    ),
    assignmentLink:
      mode === 'create' ? (
        <GradingAssistantAssignmentLinkField assignmentTypes={assignmentTypes} />
      ) : null,
    scoring: (
      <ScoringScaleEditor initial={scoringScale} namePrefix={namePrefix} />
    ),
    rubric: <RubricEditor initial={rubric} namePrefix={namePrefix} />,
    instructions: (
      <PromptConfigEditor initial={promptConfig} namePrefix={namePrefix} />
    ),
  };
}

export function GradingAssistantFormLayouts(props: GradingAssistantFormSectionsProps) {
  const sections = GradingAssistantFormSections(props);

  return (
    <div className="space-y-1">
      <StepRailSection
        step={1}
        title="Identity & setup"
        description="Name this grading assistant and optionally link an assignment."
      >
        <div className="space-y-4">
          {sections.identity}
          {sections.assignmentLink}
        </div>
      </StepRailSection>
      <StepRailSection
        step={2}
        title="Scoring scale"
        description="Numeric range for each rubric category."
      >
        {sections.scoring}
      </StepRailSection>
      <StepRailSection
        step={3}
        title="Rubric categories"
        description="Weighted criteria. Weights must total 100%."
      >
        {sections.rubric}
      </StepRailSection>
      <StepRailSection
        step={4}
        title="Grading instructions"
        description="Tell the AI how to grade. Rubric categories are sent automatically."
        isLast
      >
        {sections.instructions}
      </StepRailSection>
    </div>
  );
}

export type GradingAssistantTemplateEditorProps = {
  mode: 'create' | 'edit';
  title: string;
  description: string;
  assignmentTypes: Array<{ id: string; title: string }>;
  nameDefaultValue?: string;
  scoringScale: ScoringScaleData;
  rubric: RubricData;
  promptConfig: PromptConfigData;
  submitLabel: string;
  savingLabel: string;
  isSubmitting: boolean;
  headerExtra?: ReactNode;
};

export function GradingAssistantTemplateEditor({
  mode,
  title,
  description,
  assignmentTypes,
  nameDefaultValue,
  scoringScale,
  rubric,
  promptConfig,
  submitLabel,
  savingLabel,
  isSubmitting,
  headerExtra,
}: GradingAssistantTemplateEditorProps) {
  const namePrefix = mode === 'create' ? 'c-' : 'e-';

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6 p-3 pb-28 md:p-5">
      <Button variant="ghost" size="sm" className="w-fit px-0" asChild>
        <Link to="/app/admin/grading-assistants">
          <ChevronLeft className="mr-1 h-4 w-4" />
          Back to grading assistants
        </Link>
      </Button>

      <header className="space-y-2 border-b border-border/60 pb-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-2xl font-semibold text-pretty">{title}</h2>
          {headerExtra}
        </div>
        <p className="text-sm text-muted-foreground text-pretty">{description}</p>
      </header>

      <GradingAssistantFormLayouts
        mode={mode}
        namePrefix={namePrefix}
        assignmentTypes={assignmentTypes}
        nameDefaultValue={nameDefaultValue}
        scoringScale={scoringScale}
        rubric={rubric}
        promptConfig={promptConfig}
      />

      <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-background/95 px-3 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-5">
        <div className="mx-auto flex w-full max-w-3xl">
          <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto sm:min-w-40">
            {isSubmitting ? savingLabel : submitLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
