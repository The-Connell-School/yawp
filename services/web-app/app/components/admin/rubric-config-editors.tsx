import { useCallback, useEffect, useRef, useState } from 'react';
import { useFetcher } from 'react-router';
import {
  ChevronRight,
  ClipboardPaste,
  Copy,
  FileUp,
  GripVertical,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
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
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent } from '~/components/ui/card';
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
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '~/components/ui/collapsible';
import {
  DEFAULT_SCORING_SCALE,
  prepareRubricForSave,
  rubricCategoryLabelToKey,
  type PromptConfigData,
  type RubricCategory,
  type RubricData,
  type ScoringScaleData,
} from '~/domain/assignment-types/assignment-type-rubric.shared';
import { getGradingAssistantStrictnessLabel } from '~/domain/grading/grading-assistant-strictness';
import type { CompiledGradingAssistantInvocation } from '~/domain/grading/grading-assistant-invocation';
import type { GradingAssistantStrictnessLevel } from '~/domain/grading/grading-assistant-strictness';
import type {
  AssignmentTypeEvaluationHistory,
  AssignmentTypeEvaluationStatus,
} from '~/domain/ai-evaluation/assignment-type-evaluation.shared';

const SCORING_SCALE_TYPES = [
  { value: 'weighted_1_5', label: 'Weighted 1–5' },
  { value: 'act_writing_2_12', label: 'ACT Writing 2–12' },
  { value: 'rubric_points', label: 'Rubric points' },
];

// Keep the underlying sheets wired for an easy rollback while the main admin
// flow stays focused on instructions and saved evaluation runs.
const SHOW_PROMPT_INSPECTION_CONTROLS = false;

type RubricCategoryRow = RubricCategory & { id: string };

const labelToKey = rubricCategoryLabelToKey;

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

function pct(weight: number) {
  return Math.round(weight * 100);
}

export function ScoringScaleEditor({
  initial = DEFAULT_SCORING_SCALE,
  value,
  onChange,
  namePrefix = '',
}: {
  initial?: ScoringScaleData;
  value?: ScoringScaleData;
  onChange?: (value: ScoringScaleData) => void;
  namePrefix?: string;
}) {
  const [internalScale, setInternalScale] = useState<ScoringScaleData>(initial);
  const scale = value ?? internalScale;
  const setScale = (
    next: ScoringScaleData | ((current: ScoringScaleData) => ScoringScaleData)
  ) => {
    const resolved =
      typeof next === 'function' ? next(value ?? internalScale) : next;
    if (onChange) {
      onChange(resolved);
    } else {
      setInternalScale(resolved);
    }
  };
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
          <p className="col-span-2 text-sm text-muted-foreground">
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

function RubricImportPanel({
  onExtracted,
  excludeAssignmentTypeId,
}: {
  onExtracted: (result: {
    scoringScale: ScoringScaleData;
    rubric: RubricData;
  }) => void;
  excludeAssignmentTypeId?: string | null;
}) {
  const extractFetcher = useFetcher<{ success?: boolean; message?: string }>();
  const sourcesFetcher = useFetcher<{
    success?: boolean;
    sources?: Array<{
      id: string;
      title: string;
      categoryCount: number;
      scoringScale: ScoringScaleData;
      rubric: RubricData;
    }>;
    message?: string;
  }>();
  const handledResponseRef = useRef<unknown>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState('');
  const [activeMode, setActiveMode] = useState<'paste' | 'pdf' | null>(null);
  const isExtracting = extractFetcher.state !== 'idle';
  const isLoadingSources = sourcesFetcher.state !== 'idle';
  const extractError =
    extractFetcher.data && !extractFetcher.data.success
      ? (extractFetcher.data.message ?? 'Failed to extract rubric.')
      : null;
  const copySources = sourcesFetcher.data?.sources ?? [];
  const copyLoadError =
    sourcesFetcher.data?.success === false
      ? (sourcesFetcher.data.message ?? 'Could not load assignment types.')
      : null;
  const selectedSource =
    copySources.find((source) => source.id === selectedSourceId) ?? null;

  useEffect(() => {
    if (!copyOpen) {
      setSelectedSourceId('');
      return;
    }

    const params = new URLSearchParams();
    if (excludeAssignmentTypeId) {
      params.set('excludeId', excludeAssignmentTypeId);
    }
    const query = params.toString();
    sourcesFetcher.load(
      `/api/domain/rubric-copy-sources${query ? `?${query}` : ''}`
    );
  }, [copyOpen, excludeAssignmentTypeId]);

  useEffect(() => {
    const data = extractFetcher.data as
      | {
          success?: boolean;
          scoringScale?: ScoringScaleData;
          rubric?: RubricData;
        }
      | undefined;
    if (!data?.success || !data.scoringScale || !data.rubric) return;
    if (handledResponseRef.current === data) return;
    handledResponseRef.current = data;
    onExtracted({ scoringScale: data.scoringScale, rubric: data.rubric });
    setPasteOpen(false);
    setPdfOpen(false);
    setImportText('');
    setPdfFile(null);
    setActiveMode(null);
  }, [extractFetcher.data, onExtracted]);

  function handleExtract(mode: 'paste' | 'pdf') {
    const formData = new FormData();
    if (mode === 'pdf') {
      if (!pdfFile) return;
      formData.append('file', pdfFile);
      if (importText.trim()) {
        formData.append('text', importText.trim());
      }
    } else if (importText.trim()) {
      formData.append('text', importText.trim());
    } else {
      return;
    }

    setActiveMode(mode);
    extractFetcher.submit(formData, {
      method: 'POST',
      action: '/api/domain/rubric-extract',
      encType: 'multipart/form-data',
    });
  }

  const canExtractPaste = importText.trim().length > 0;
  const canExtractPdf = Boolean(pdfFile);

  function handleCopyRubric() {
    if (!selectedSource) return;
    onExtracted({
      scoringScale: selectedSource.scoringScale,
      rubric: selectedSource.rubric,
    });
    setCopyOpen(false);
    setSelectedSourceId('');
  }

  return (
    <>
      <div className="space-y-2">
        <Card className="bg-white shadow-sm">
          <CardContent className="space-y-3 p-4">
            <div>
              <p className="text-sm font-medium">Import rubric</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Paste text, upload a PDF, or copy from another assignment type.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPasteOpen(true)}
                disabled={isExtracting}
              >
                <ClipboardPaste className="mr-2 size-4 shrink-0" />
                Paste text
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPdfOpen(true)}
                disabled={isExtracting}
              >
                <FileUp className="mr-2 size-4 shrink-0" />
                Upload PDF
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCopyOpen(true)}
                disabled={isExtracting}
              >
                <Copy className="mr-2 size-4 shrink-0" />
                Copy from
              </Button>
            </div>
          </CardContent>
        </Card>

        {isExtracting ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 shrink-0 animate-spin" />
            Extracting rubric...
          </p>
        ) : null}
        {extractError ? (
          <p className="text-sm text-destructive">{extractError}</p>
        ) : null}
      </div>

      <Sheet open={pasteOpen} onOpenChange={setPasteOpen}>
        <SheetContent aria-describedby={undefined}>
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <ClipboardPaste className="size-4 shrink-0" />
              Paste rubric
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            <Textarea
              id="rubric-import-text"
              rows={12}
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
              placeholder="Paste rubric categories, weights, and descriptions..."
              disabled={isExtracting}
            />
            <Button
              type="button"
              className="w-full"
              onClick={() => handleExtract('paste')}
              disabled={!canExtractPaste || isExtracting}
            >
              {isExtracting && activeMode === 'paste' ? (
                <>
                  <Loader2 className="mr-2 size-4 shrink-0 animate-spin" />
                  Extracting...
                </>
              ) : (
                'Extract rubric'
              )}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={pdfOpen} onOpenChange={setPdfOpen}>
        <SheetContent aria-describedby={undefined}>
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <FileUp className="size-4 shrink-0" />
              Upload PDF
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rubric-import-pdf">Rubric PDF</Label>
              <Input
                id="rubric-import-pdf"
                type="file"
                accept="application/pdf,.pdf"
                onChange={(event) =>
                  setPdfFile(event.target.files?.[0] ?? null)
                }
                disabled={isExtracting}
              />
              {pdfFile ? (
                <p className="truncate text-sm text-muted-foreground">
                  {pdfFile.name}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="rubric-import-notes">Optional notes</Label>
              <Textarea
                id="rubric-import-notes"
                rows={4}
                value={importText}
                onChange={(event) => setImportText(event.target.value)}
                placeholder="Add context or paste extra rubric text..."
                disabled={isExtracting}
              />
            </div>
            <Button
              type="button"
              className="w-full"
              onClick={() => handleExtract('pdf')}
              disabled={!canExtractPdf || isExtracting}
            >
              {isExtracting && activeMode === 'pdf' ? (
                <>
                  <Loader2 className="mr-2 size-4 shrink-0 animate-spin" />
                  Extracting...
                </>
              ) : (
                'Extract rubric'
              )}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={copyOpen} onOpenChange={setCopyOpen}>
        <SheetContent aria-describedby={undefined}>
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Copy className="size-4 shrink-0" />
              Copy rubric from
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            {isLoadingSources ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 shrink-0 animate-spin" />
                Loading assignment types...
              </p>
            ) : copyLoadError ? (
              <p className="text-sm text-destructive">{copyLoadError}</p>
            ) : copySources.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No other assignment types have a rubric to copy yet.
              </p>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="rubric-copy-source">Assignment type</Label>
                  <Select
                    value={selectedSourceId}
                    onValueChange={setSelectedSourceId}
                  >
                    <SelectTrigger id="rubric-copy-source">
                      <SelectValue placeholder="Select an assignment type" />
                    </SelectTrigger>
                    <SelectContent>
                      {copySources.map((source) => (
                        <SelectItem key={source.id} value={source.id}>
                          {source.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {selectedSource ? (
                  <p className="text-sm text-muted-foreground">
                    Copies {selectedSource.categoryCount}{' '}
                    {selectedSource.categoryCount === 1
                      ? 'category'
                      : 'categories'}{' '}
                    and the scoring scale from {selectedSource.title}.
                  </p>
                ) : null}
                <Button
                  type="button"
                  className="w-full"
                  onClick={handleCopyRubric}
                  disabled={!selectedSource}
                >
                  Copy rubric
                </Button>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function CategoryEditSheet({
  category,
  open,
  onOpenChange,
  onSave,
  onRemove,
}: {
  category: RubricCategoryRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (patch: Partial<RubricCategory>) => void;
  onRemove: () => void;
}) {
  const [draft, setDraft] = useState<RubricCategoryRow | null>(category);

  useEffect(() => {
    setDraft(category);
  }, [category]);

  if (!draft) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
      <SheetContent
        includeOverlay={false}
        aria-describedby={undefined}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <SheetHeader>
          <SheetTitle>Edit category</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="category-edit-label">Label</Label>
            <Input
              id="category-edit-label"
              value={draft.label}
              placeholder="e.g. Thesis & Content"
              onChange={(event) =>
                setDraft((current) =>
                  current ? { ...current, label: event.target.value } : current
                )
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="category-edit-weight">Weight %</Label>
            <Input
              id="category-edit-weight"
              type="number"
              min={0}
              max={100}
              className="tabular-nums"
              value={pct(draft.weight)}
              onChange={(event) =>
                setDraft((current) =>
                  current
                    ? { ...current, weight: Number(event.target.value) / 100 }
                    : current
                )
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="category-edit-description">Description</Label>
            <Textarea
              id="category-edit-description"
              rows={5}
              value={draft.description}
              placeholder="What does good performance look like?"
              onChange={(event) =>
                setDraft((current) =>
                  current
                    ? { ...current, description: event.target.value }
                    : current
                )
              }
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="destructive-outline"
              onClick={() => {
                onRemove();
                onOpenChange(false);
              }}
            >
              <Trash2 className="mr-2 size-4 shrink-0" />
              Remove category
            </Button>
            <Button
              type="button"
              onClick={() => {
                onSave({
                  label: draft.label,
                  weight: draft.weight,
                  description: draft.description,
                });
                onOpenChange(false);
              }}
            >
              Done
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SortableRubricCategoryRow({
  cat,
  index,
  onOpen,
  onRemove,
}: {
  cat: RubricCategoryRow;
  index: number;
  onOpen: () => void;
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

  return (
    <Card
      ref={setNodeRef}
      style={style}
      data-testid={`rubric-category-row-${index}`}
      className={`bg-white ${isDragging ? 'shadow-md' : 'shadow-sm'}`}
    >
      <CardContent className="flex items-center gap-2 p-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none active:cursor-grabbing"
          aria-label={`Reorder category ${index + 1}`}
        >
          <GripVertical className="size-4 shrink-0 text-muted-foreground" />
        </button>
        <button
          type="button"
          onClick={onOpen}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span className="min-w-0 flex-1 truncate font-medium">
            {cat.label.trim() || `Category ${index + 1}`}
          </span>
          <span className="shrink-0 tabular-nums text-sm text-muted-foreground">
            {pct(cat.weight)}%
          </span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="text-muted-foreground hover:text-destructive"
          aria-label="Remove category"
        >
          <Trash2 className="size-4 shrink-0" />
        </button>
      </CardContent>
    </Card>
  );
}

export function RubricEditor({
  initial,
  categories: controlledCategories,
  onCategoriesChange,
  namePrefix = '',
}: {
  initial?: RubricData;
  categories?: RubricCategoryRow[];
  onCategoriesChange?: (categories: RubricCategoryRow[]) => void;
  namePrefix?: string;
}) {
  const [internalCats, setInternalCats] = useState<RubricCategoryRow[]>(() =>
    rowsFromCategories(initial?.categories ?? [])
  );
  const cats = controlledCategories ?? internalCats;
  const setCats = (
    next:
      | RubricCategoryRow[]
      | ((current: RubricCategoryRow[]) => RubricCategoryRow[])
  ) => {
    const resolved = typeof next === 'function' ? next(cats) : next;
    if (onCategoriesChange) {
      onCategoriesChange(resolved);
    } else {
      setInternalCats(resolved);
    }
  };
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(
    null
  );
  const totalWeight = cats.reduce((sum, cat) => sum + (cat.weight || 0), 0);
  const weightOk = Math.abs(totalWeight - 1) < 0.001;
  const editingCategory =
    cats.find((cat) => cat.id === editingCategoryId) ?? null;

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function addCat() {
    const next = createRubricCategoryRow();
    setCats((prev) => [...prev, next]);
  }

  function removeCat(id: string) {
    setCats((prev) => prev.filter((cat) => cat.id !== id));
    if (editingCategoryId === id) {
      setEditingCategoryId(null);
    }
  }

  function updateCat(id: string, patch: Partial<RubricCategory>) {
    setCats((prev) =>
      prev.map((cat) => {
        if (cat.id !== id) return cat;
        const next = { ...cat, ...patch };
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

  return (
    <div className="space-y-3">
      {cats.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">
          No categories yet. Add one below or import a rubric above.
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
            <div className="space-y-2">
              {cats.map((cat, index) => (
                <SortableRubricCategoryRow
                  key={cat.id}
                  cat={cat}
                  index={index}
                  onOpen={() => setEditingCategoryId(cat.id)}
                  onRemove={() => removeCat(cat.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {cats.length > 0 && (
        <div
          className={`flex items-center gap-2 text-sm ${weightOk ? 'text-green-700' : 'text-amber-700'}`}
        >
          <div
            className={`h-1.5 flex-1 overflow-hidden rounded-full ${weightOk ? 'bg-green-200' : 'bg-amber-200'}`}
          >
            <div
              className={`h-full rounded-full ${weightOk ? 'bg-green-600' : 'bg-amber-500'}`}
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
        data-testid="rubric-add-category"
        className="w-full"
      >
        <Plus className="mr-1.5 size-4 shrink-0" />
        Add category
      </Button>

      <CategoryEditSheet
        category={editingCategory}
        open={Boolean(editingCategory)}
        onOpenChange={(open) => {
          if (!open) setEditingCategoryId(null);
        }}
        onSave={(patch) => {
          if (editingCategoryId) {
            updateCat(editingCategoryId, patch);
          }
        }}
        onRemove={() => {
          if (editingCategoryId) {
            removeCat(editingCategoryId);
          }
        }}
      />

      <input
        type="hidden"
        name="rubricJson"
        value={JSON.stringify(prepareRubricForSave({ categories: cats }))}
      />
    </div>
  );
}

function categoriesToRubric(categories: RubricCategoryRow[]): RubricData {
  return prepareRubricForSave({ categories });
}

export function RubricConfigurationEditor({
  initialScoringScale = DEFAULT_SCORING_SCALE,
  initialRubric = { categories: [] },
  namePrefix = '',
  showImport = true,
  excludeAssignmentTypeId = null,
  onScoringScaleChange,
  onRubricChange,
}: {
  initialScoringScale?: ScoringScaleData;
  initialRubric?: RubricData;
  namePrefix?: string;
  showImport?: boolean;
  excludeAssignmentTypeId?: string | null;
  onScoringScaleChange?: (scale: ScoringScaleData) => void;
  onRubricChange?: (rubric: RubricData) => void;
}) {
  const [scoringScale, setScoringScale] =
    useState<ScoringScaleData>(initialScoringScale);
  const [categories, setCategories] = useState<RubricCategoryRow[]>(() =>
    rowsFromCategories(initialRubric.categories)
  );

  function updateScoringScale(next: ScoringScaleData) {
    setScoringScale(next);
    onScoringScaleChange?.(next);
  }

  function updateCategories(
    next:
      | RubricCategoryRow[]
      | ((current: RubricCategoryRow[]) => RubricCategoryRow[])
  ) {
    setCategories((current) => {
      const resolved = typeof next === 'function' ? next(current) : next;
      onRubricChange?.(categoriesToRubric(resolved));
      return resolved;
    });
  }

  const handleExtracted = useCallback(
    ({
      scoringScale: nextScale,
      rubric,
    }: {
      scoringScale: ScoringScaleData;
      rubric: RubricData;
    }) => {
      updateScoringScale(nextScale);
      updateCategories(rowsFromCategories(rubric.categories));
    },
    []
  );

  return (
    <div className="space-y-5">
      {showImport ? (
        <RubricImportPanel
          onExtracted={handleExtracted}
          excludeAssignmentTypeId={excludeAssignmentTypeId}
        />
      ) : null}
      <ScoringScaleEditor
        initial={initialScoringScale}
        value={scoringScale}
        onChange={updateScoringScale}
        namePrefix={namePrefix}
      />
      <RubricEditor
        initial={initialRubric}
        categories={categories}
        onCategoriesChange={updateCategories}
        namePrefix={namePrefix}
      />
    </div>
  );
}

export type GradingAssistantPromptPreview =
  CompiledGradingAssistantInvocation & {
    version: number;
    source: string;
    previewInputs: {
      studentFirstName: string;
      strictnessLevel: GradingAssistantStrictnessLevel;
      documentText: string;
    };
  };

function CompiledPromptSheet({
  open,
  onOpenChange,
  preview,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: GradingAssistantPromptPreview;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        aria-describedby={undefined}
        className="w-full max-w-full sm:max-w-xl md:max-w-2xl"
      >
        <SheetHeader>
          <SheetTitle>Compiled prompt</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground text-pretty">
            This is the primary grading request sent to the AI. Recovery and
            grammar-check requests run as separate follow-up calls only when
            needed.
          </p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">Version</dt>
              <dd className="font-medium tabular-nums">{preview.version}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Source</dt>
              <dd className="font-medium">{preview.source}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Preview student</dt>
              <dd className="font-medium">
                {preview.previewInputs.studentFirstName}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Strictness</dt>
              <dd className="font-medium">
                {getGradingAssistantStrictnessLabel(
                  preview.previewInputs.strictnessLevel
                )}
              </dd>
            </div>
          </dl>
          <p className="text-sm text-muted-foreground text-pretty">
            The placeholder document text below stands in for the student&apos;s
            actual case or submission, which is substituted in at grading time.
          </p>
          <div className="space-y-2">
            <p className="text-sm font-medium">System message</p>
            <pre className="max-w-full overflow-x-hidden whitespace-pre-wrap break-words rounded-md border bg-muted/40 p-3 text-sm">
              {preview.system}
            </pre>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">User message</p>
            <pre className="max-w-full overflow-x-hidden whitespace-pre-wrap break-words rounded-md border bg-muted/40 p-3 text-sm">
              {preview.userMessage}
            </pre>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

type ScratchEvaluationCheck = {
  status: 'pass' | 'fail' | 'blocked';
  evidence: string;
};

type ScratchEvaluationResult = {
  status: 'pass' | 'fail' | 'needs_review';
  gradingOutput: {
    categories: Array<{ key: string; score: number; comment: string }>;
    overallComment: string;
  } | null;
  rawGradingOutput: string;
  responseContract: ScratchEvaluationCheck;
  criterion: ScratchEvaluationCheck;
};

function scratchCheckBadgeVariant(
  status: ScratchEvaluationCheck['status']
): 'success' | 'destructive' | 'warning-soft' {
  if (status === 'pass') return 'success';
  if (status === 'fail') return 'destructive';
  return 'warning-soft';
}

function scratchCheckBadgeLabel(status: ScratchEvaluationCheck['status']) {
  if (status === 'pass') return 'Pass';
  if (status === 'fail') return 'Fail';
  return 'Blocked';
}

function ScratchTestSheet({
  open,
  onOpenChange,
  assignmentTypeId,
  title,
  scoringScale,
  rubric,
  promptConfig,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignmentTypeId: string;
  title: string;
  scoringScale: ScoringScaleData;
  rubric: RubricData;
  promptConfig: PromptConfigData;
}) {
  const fetcher = useFetcher<{
    success?: boolean;
    result?: ScratchEvaluationResult;
    message?: string;
  }>();
  const [documentText, setDocumentText] = useState('');
  const [criterion, setCriterion] = useState('');
  const isRunning = fetcher.state !== 'idle';
  const result =
    fetcher.data?.success && fetcher.data.result ? fetcher.data.result : null;
  const errorMessage =
    fetcher.data && fetcher.data.success === false
      ? (fetcher.data.message ?? 'The scratch test could not run.')
      : null;
  const canRun =
    documentText.trim().length > 0 && criterion.trim().length > 0 && !isRunning;

  function handleRun() {
    if (!canRun) return;
    const formData = new FormData();
    formData.set('assignmentTypeId', assignmentTypeId);
    formData.set('title', title);
    formData.set('scoringScaleJson', scoringScaleSnapshot(scoringScale));
    formData.set('rubricJson', rubricSnapshot(rubric));
    formData.set('promptConfigJson', promptConfigSnapshot(promptConfig));
    formData.set('documentText', documentText);
    formData.set('criterion', criterion);
    formData.set('strictnessLevel', 'intermediate');
    fetcher.submit(formData, {
      method: 'POST',
      action: '/api/domain/grading-assistant-test',
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        aria-describedby={undefined}
        className="flex w-full max-w-full flex-col overflow-y-auto sm:max-w-xl md:max-w-2xl"
      >
        <SheetHeader>
          <SheetTitle>Test prompt</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground text-pretty">
            Scratch test — not saved. Uses your current draft instructions and
            rubric.
          </p>
          <div className="space-y-2">
            <Label htmlFor="scratch-test-document">Case document</Label>
            <Textarea
              id="scratch-test-document"
              rows={10}
              value={documentText}
              onChange={(event) => setDocumentText(event.target.value)}
              placeholder="Paste or write a sample student submission..."
              disabled={isRunning}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="scratch-test-criterion">Evaluation criterion</Label>
            <Textarea
              id="scratch-test-criterion"
              rows={3}
              value={criterion}
              onChange={(event) => setCriterion(event.target.value)}
              placeholder="What should the AI check for? e.g. Does the thesis take a clear position?"
              disabled={isRunning}
            />
          </div>
          <Button
            type="button"
            className="w-full"
            onClick={handleRun}
            disabled={!canRun}
          >
            {isRunning ? (
              <>
                <Loader2 className="mr-2 size-4 shrink-0 animate-spin" />
                Running...
              </>
            ) : (
              'Run test'
            )}
          </Button>

          {errorMessage ? (
            <p className="text-sm text-destructive">{errorMessage}</p>
          ) : null}

          {result ? (
            <div className="space-y-4 border-t pt-4">
              <div className="space-y-2">
                <p className="text-sm font-medium">Grading output</p>
                <pre className="max-w-full overflow-x-hidden whitespace-pre-wrap break-words rounded-md border bg-muted/40 p-3 text-sm">
                  {result.gradingOutput
                    ? JSON.stringify(result.gradingOutput, null, 2)
                    : result.rawGradingOutput}
                </pre>
                {result.responseContract.status !== 'pass' ? (
                  <p className="text-sm text-destructive">
                    {result.responseContract.evidence}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">Evaluator result</p>
                  <Badge
                    variant={scratchCheckBadgeVariant(result.criterion.status)}
                    aria-label={`Evaluator result: ${scratchCheckBadgeLabel(result.criterion.status)}`}
                  >
                    {scratchCheckBadgeLabel(result.criterion.status)}
                  </Badge>
                </div>
                <p className="text-sm text-pretty">
                  {result.criterion.evidence}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function pluralizeCases(count: number) {
  return `${count} case${count === 1 ? '' : 's'}`;
}

function evaluationStatusLabel(status: AssignmentTypeEvaluationStatus) {
  if (status === 'pass') return 'Pass';
  if (status === 'fail') return 'Fail';
  if (status === 'blocked') return 'Blocked';
  return 'Needs review';
}

function evaluationStatusBadgeVariant(
  status: AssignmentTypeEvaluationStatus
): 'success' | 'destructive' | 'warning-soft' {
  if (status === 'pass') return 'success';
  if (status === 'fail') return 'destructive';
  return 'warning-soft';
}

function runSummaryStatus(
  run: AssignmentTypeEvaluationHistory['runs'][number]
): AssignmentTypeEvaluationStatus {
  if (run.totalCases > 0 && run.passedCases === run.totalCases) return 'pass';
  if (run.passedCases === 0 && run.failedCases > 0) return 'fail';
  return 'needs_review';
}

function runSummaryTextClass(status: AssignmentTypeEvaluationStatus) {
  if (status === 'pass') return 'text-green-700 dark:text-green-400';
  if (status === 'fail') return 'text-destructive';
  return 'text-amber-700 dark:text-amber-400';
}

function buildEvaluationColumns(
  evaluationHistory: AssignmentTypeEvaluationHistory
) {
  const groupedCases = new Map<
    string,
    AssignmentTypeEvaluationHistory['cases']
  >();
  for (const evaluationCase of evaluationHistory.cases) {
    if (!evaluationCase.evaluationId) continue;
    const bucket = groupedCases.get(evaluationCase.evaluationId) ?? [];
    bucket.push(evaluationCase);
    groupedCases.set(evaluationCase.evaluationId, bucket);
  }

  const namedColumns = evaluationHistory.evaluations
    .filter((evaluation) => groupedCases.has(evaluation.id))
    .map((evaluation) => ({
      key: evaluation.id,
      evaluationId: evaluation.id,
      label: evaluation.title,
      description: evaluation.description,
      archived: evaluation.archived,
      cases: groupedCases.get(evaluation.id)!,
    }));
  const legacyColumns = evaluationHistory.cases
    .filter((evaluationCase) => !evaluationCase.evaluationId)
    .map((evaluationCase) => ({
      key: `legacy:${evaluationCase.id}`,
      evaluationId: null,
      label: evaluationCase.title,
      description: evaluationCase.criterion,
      archived: evaluationCase.archived,
      cases: [evaluationCase],
    }));

  return [...namedColumns, ...legacyColumns];
}

type GeneratedEvaluationCaseDraft = {
  title: string;
  documentText: string;
  expectedOutputText: string;
  selected: boolean;
};

type EvaluationFetcherData = {
  success?: boolean;
  message?: string;
  evaluationId?: string;
  evaluation?: {
    title: string;
    description: string;
    cases: Array<{
      title: string;
      documentText: string;
      expectedOutput: unknown;
    }>;
  };
};

function CaseFieldsBody({
  idPrefix,
  labelTitle,
  title,
  documentText,
  expectedOutputText,
  disabled,
  onTitleChange,
  onDocumentChange,
  onOutputChange,
}: {
  idPrefix: string;
  labelTitle: string;
  title: string;
  documentText: string;
  expectedOutputText: string;
  disabled: boolean;
  onTitleChange: (value: string) => void;
  onDocumentChange: (value: string) => void;
  onOutputChange: (value: string) => void;
}) {
  return (
    <div className="mt-3 space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-name`}>Case name</Label>
        <Input
          id={`${idPrefix}-name`}
          aria-label={`${labelTitle} case name`}
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
          disabled={disabled}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-document`}>Input document</Label>
        <Textarea
          id={`${idPrefix}-document`}
          aria-label={`${labelTitle} input document`}
          rows={6}
          value={documentText}
          onChange={(event) => onDocumentChange(event.target.value)}
          disabled={disabled}
        />
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">
          Edit full expected output
        </summary>
        <div className="mt-2 space-y-1.5">
          <Label htmlFor={`${idPrefix}-output`}>Full expected output</Label>
          <Textarea
            id={`${idPrefix}-output`}
            aria-label={`${labelTitle} full expected output`}
            rows={10}
            value={expectedOutputText}
            onChange={(event) => onOutputChange(event.target.value)}
            disabled={disabled}
            className="font-mono text-xs"
          />
        </div>
      </details>
    </div>
  );
}

function AddEvaluationSheet({
  open,
  onOpenChange,
  assignmentTypeId,
  fetcher,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignmentTypeId: string;
  fetcher: ReturnType<typeof useFetcher<EvaluationFetcherData>>;
}) {
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [genPrompt, setGenPrompt] = useState('');
  const [description, setDescription] = useState('');
  const [evaluationTitle, setEvaluationTitle] = useState('');
  const [cases, setCases] = useState<GeneratedEvaluationCaseDraft[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);
  const isWorking = fetcher.state !== 'idle';
  const errorMessage =
    fetcher.data && fetcher.data.success === false
      ? (fetcher.data.message ?? 'Could not save the case.')
      : localError;
  const handledResponseRef = useRef<unknown>(null);

  useEffect(() => {
    if (!open) {
      setGeneratorOpen(false);
      setGenPrompt('');
      setDescription('');
      setEvaluationTitle('');
      setCases([]);
      setLocalError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!fetcher.data?.success) return;
    if (handledResponseRef.current === fetcher.data) return;
    handledResponseRef.current = fetcher.data;
    if (fetcher.data.evaluation) {
      setEvaluationTitle(fetcher.data.evaluation.title);
      setDescription(fetcher.data.evaluation.description);
      setCases(
        fetcher.data.evaluation.cases.map((evaluationCase) => ({
          title: evaluationCase.title,
          documentText: evaluationCase.documentText,
          expectedOutputText: JSON.stringify(
            evaluationCase.expectedOutput,
            null,
            2
          ),
          selected: true,
        }))
      );
      setGeneratorOpen(false);
      return;
    }
    if (fetcher.data.evaluationId) onOpenChange(false);
  }, [fetcher.data, onOpenChange]);

  const selectedCount = cases.filter(
    (evaluationCase) => evaluationCase.selected
  ).length;
  const canGenerate = genPrompt.trim().length > 0 && !isWorking;
  const canSave =
    evaluationTitle.trim().length > 0 &&
    description.trim().length > 0 &&
    selectedCount > 0 &&
    !isWorking;

  function handleGenerate() {
    if (!canGenerate) return;
    setLocalError(null);
    const formData = new FormData();
    formData.set('intent', 'generateEvaluation');
    formData.set('assignmentTypeId', assignmentTypeId);
    formData.set('description', genPrompt.trim());
    fetcher.submit(formData, {
      method: 'POST',
      action: '/api/domain/assignment-type-evaluations',
    });
  }

  function updateCase(
    index: number,
    update: Partial<GeneratedEvaluationCaseDraft>
  ) {
    setCases((current) =>
      current.map((evaluationCase, caseIndex) =>
        caseIndex === index ? { ...evaluationCase, ...update } : evaluationCase
      )
    );
  }

  function handleSave() {
    if (!canSave) return;
    setLocalError(null);
    let selectedCases: Array<{
      title: string;
      documentText: string;
      expectedOutput: unknown;
    }>;
    try {
      selectedCases = cases
        .filter((evaluationCase) => evaluationCase.selected)
        .map((evaluationCase) => ({
          title: evaluationCase.title.trim(),
          documentText: evaluationCase.documentText.trim(),
          expectedOutput: JSON.parse(evaluationCase.expectedOutputText),
        }));
    } catch {
      setLocalError('Fix the expected output JSON before saving.');
      return;
    }
    if (
      selectedCases.some(
        (evaluationCase) =>
          !evaluationCase.title || !evaluationCase.documentText
      )
    ) {
      setLocalError('Every selected case needs an input and a short title.');
      return;
    }
    const formData = new FormData();
    formData.set('intent', 'createEvaluation');
    formData.set('assignmentTypeId', assignmentTypeId);
    formData.set('title', evaluationTitle.trim());
    formData.set('description', description.trim());
    formData.set('casesJson', JSON.stringify(selectedCases));
    fetcher.submit(formData, {
      method: 'POST',
      action: '/api/domain/assignment-type-evaluations',
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        aria-describedby={undefined}
        className="flex max-h-screen flex-col overflow-y-auto sm:max-w-xl"
      >
        <SheetHeader>
          <SheetTitle>Add evaluation</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          <Collapsible open={generatorOpen} onOpenChange={setGeneratorOpen}>
            <CollapsibleTrigger asChild>
              <Button type="button" variant="outline" size="sm">
                <Sparkles className="mr-1.5 size-4 shrink-0" />
                Generate with AI
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 space-y-3">
              <div className="space-y-2">
                <Label htmlFor="evaluation-generate-prompt">
                  Describe what good looks like
                </Label>
                <Textarea
                  id="evaluation-generate-prompt"
                  rows={5}
                  value={genPrompt}
                  onChange={(event) => setGenPrompt(event.target.value)}
                  placeholder="e.g. Always begin the final feedback with a brief, positive greeting."
                  disabled={isWorking}
                />
                <p className="text-sm text-muted-foreground text-pretty">
                  AI will suggest varied inputs and a complete ideal output for
                  each one, and fill in the name and description below.
                </p>
              </div>
              <Button
                type="button"
                className="w-full"
                onClick={handleGenerate}
                disabled={!canGenerate}
              >
                {isWorking ? (
                  <>
                    <Loader2 className="mr-2 size-4 shrink-0 animate-spin" />
                    Generating...
                  </>
                ) : (
                  'Generate evaluations'
                )}
              </Button>
            </CollapsibleContent>
          </Collapsible>

          <div className="space-y-2">
            <Label htmlFor="evaluation-title">Evaluation name</Label>
            <Input
              id="evaluation-title"
              value={evaluationTitle}
              onChange={(event) => setEvaluationTitle(event.target.value)}
              disabled={isWorking}
            />
            <p className="text-sm text-muted-foreground">
              This becomes one column in the history table.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="evaluation-description">
              Evaluation description
            </Label>
            <Textarea
              id="evaluation-description"
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={isWorking}
            />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">
              {pluralizeCases(cases.length)}
            </p>
            {cases.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No cases yet. Use Generate with AI above, and they&apos;ll
                appear here for review.
              </p>
            ) : (
              cases.map((evaluationCase, index) => (
                <div
                  key={`${evaluationCase.title}-${index}`}
                  className="flex items-start gap-2 rounded-md border p-3"
                >
                  <input
                    type="checkbox"
                    aria-label={`Use ${evaluationCase.title}`}
                    checked={evaluationCase.selected}
                    onChange={(event) =>
                      updateCase(index, { selected: event.target.checked })
                    }
                    disabled={isWorking}
                    className="mt-1 size-4 shrink-0"
                  />
                  <details className="min-w-0 flex-1 text-sm">
                    <summary className="cursor-pointer font-medium">
                      {evaluationCase.title || `Case ${index + 1}`}
                    </summary>
                    <CaseFieldsBody
                      idPrefix={`generated-case-${index}`}
                      labelTitle={evaluationCase.title}
                      title={evaluationCase.title}
                      documentText={evaluationCase.documentText}
                      expectedOutputText={evaluationCase.expectedOutputText}
                      disabled={isWorking}
                      onTitleChange={(value) =>
                        updateCase(index, { title: value })
                      }
                      onDocumentChange={(value) =>
                        updateCase(index, { documentText: value })
                      }
                      onOutputChange={(value) =>
                        updateCase(index, { expectedOutputText: value })
                      }
                    />
                  </details>
                </div>
              ))
            )}
          </div>

          {errorMessage ? (
            <p className="text-sm text-destructive">{errorMessage}</p>
          ) : null}
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isWorking}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={!canSave}>
              {isWorking ? (
                <>
                  <Loader2 className="mr-2 size-4 shrink-0 animate-spin" />
                  Saving...
                </>
              ) : (
                `Save ${selectedCount} ${selectedCount === 1 ? 'case' : 'cases'}`
              )}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

type EvaluationColumn = ReturnType<typeof buildEvaluationColumns>[number];

type EvaluationCaseDraft = {
  id: string;
  title: string;
  documentText: string;
  expectedOutputText: string;
};

type UpdateEvaluationFetcherData = { success?: boolean; message?: string };

function EvaluationDetailSheet({
  evaluation,
  assignmentTypeId,
  open,
  onOpenChange,
  onRemoveCase,
  isRemoving,
}: {
  evaluation: EvaluationColumn | null;
  assignmentTypeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRemoveCase: (caseId: string) => void;
  isRemoving: boolean;
}) {
  const updateFetcher = useFetcher<UpdateEvaluationFetcherData>();
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCases, setEditCases] = useState<EvaluationCaseDraft[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);
  const handledResponseRef = useRef<unknown>(null);
  const isSaving = updateFetcher.state !== 'idle';
  const isBusy = isSaving || isRemoving;

  useEffect(() => {
    setLocalError(null);
    if (!evaluation) return;
    const editable =
      Boolean(evaluation.evaluationId) &&
      !evaluation.key.startsWith('legacy:') &&
      !evaluation.archived;
    if (!editable) return;
    const active = evaluation.cases.filter(
      (evaluationCase) => !evaluationCase.archived
    );
    setEditTitle(evaluation.label);
    setEditDescription(evaluation.description);
    setEditCases(
      active.map((evaluationCase) => ({
        id: evaluationCase.id,
        title: evaluationCase.title,
        documentText: evaluationCase.documentText,
        expectedOutputText: JSON.stringify(
          evaluationCase.expectedOutput,
          null,
          2
        ),
      }))
    );
  }, [evaluation?.key]);

  useEffect(() => {
    if (isSaving || !updateFetcher.data) return;
    if (handledResponseRef.current === updateFetcher.data) return;
    handledResponseRef.current = updateFetcher.data;
    if (updateFetcher.data.success) {
      onOpenChange(false);
    } else {
      setLocalError(updateFetcher.data.message ?? 'Could not save changes.');
    }
  }, [isSaving, onOpenChange, updateFetcher.data]);

  if (!evaluation) return null;

  const isLegacy = evaluation.key.startsWith('legacy:');
  const activeCases = evaluation.cases.filter(
    (evaluationCase) => !evaluationCase.archived
  );
  const canEdit =
    Boolean(evaluation.evaluationId) &&
    !isLegacy &&
    !evaluation.archived &&
    activeCases.length > 0;
  const archivedCases = evaluation.cases.filter(
    (evaluationCase) => evaluationCase.archived
  );

  function updateEditCase(id: string, patch: Partial<EvaluationCaseDraft>) {
    setEditCases((current) =>
      current.map((evaluationCase) =>
        evaluationCase.id === id
          ? { ...evaluationCase, ...patch }
          : evaluationCase
      )
    );
  }

  function removeEditCase(id: string) {
    setEditCases((current) =>
      current.filter((evaluationCase) => evaluationCase.id !== id)
    );
    onRemoveCase(id);
  }

  function handleSaveChanges() {
    if (!evaluation) return;
    setLocalError(null);
    if (!evaluation.evaluationId) {
      setLocalError('This older evaluation cannot be edited here yet.');
      return;
    }
    if (!editTitle.trim() || !editDescription.trim()) {
      setLocalError('Evaluation name and description are required.');
      return;
    }
    if (editCases.length === 0) {
      setLocalError('Keep at least one case in this evaluation.');
      return;
    }
    let parsedCases: Array<{
      id: string;
      title: string;
      documentText: string;
      expectedOutput: unknown;
    }>;
    try {
      parsedCases = editCases.map((evaluationCase) => ({
        id: evaluationCase.id,
        title: evaluationCase.title.trim(),
        documentText: evaluationCase.documentText.trim(),
        expectedOutput: JSON.parse(evaluationCase.expectedOutputText),
      }));
    } catch {
      setLocalError('Fix the expected output JSON before saving.');
      return;
    }
    if (
      parsedCases.some(
        (evaluationCase) =>
          !evaluationCase.title || !evaluationCase.documentText
      )
    ) {
      setLocalError('Every case needs a name and an input document.');
      return;
    }
    const formData = new FormData();
    formData.set('intent', 'updateEvaluation');
    formData.set('assignmentTypeId', assignmentTypeId);
    formData.set('evaluationId', evaluation.evaluationId);
    formData.set('title', editTitle.trim());
    formData.set('description', editDescription.trim());
    formData.set('casesJson', JSON.stringify(parsedCases));
    updateFetcher.submit(formData, {
      method: 'POST',
      action: '/api/domain/assignment-type-evaluations',
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        aria-describedby={undefined}
        className="flex max-h-screen flex-col overflow-y-auto sm:max-w-xl"
      >
        <SheetHeader>
          <SheetTitle>{evaluation.label}</SheetTitle>
        </SheetHeader>
        {canEdit ? (
          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="evaluation-edit-title">Evaluation name</Label>
              <Input
                id="evaluation-edit-title"
                value={editTitle}
                onChange={(event) => setEditTitle(event.target.value)}
                disabled={isBusy}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="evaluation-edit-description">
                Evaluation description
              </Label>
              <Textarea
                id="evaluation-edit-description"
                rows={4}
                value={editDescription}
                onChange={(event) => setEditDescription(event.target.value)}
                disabled={isBusy}
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">
                {pluralizeCases(editCases.length)}
              </p>
              {editCases.map((evaluationCase, index) => (
                <details
                  key={evaluationCase.id}
                  className="rounded-md border p-3 text-sm"
                >
                  <summary className="cursor-pointer font-medium">
                    {evaluationCase.title || `Case ${index + 1}`}
                  </summary>
                  <CaseFieldsBody
                    idPrefix={`evaluation-case-${evaluationCase.id}`}
                    labelTitle={
                      activeCases[index]?.title ?? evaluationCase.title
                    }
                    title={evaluationCase.title}
                    documentText={evaluationCase.documentText}
                    expectedOutputText={evaluationCase.expectedOutputText}
                    disabled={isBusy}
                    onTitleChange={(value) =>
                      updateEditCase(evaluationCase.id, { title: value })
                    }
                    onDocumentChange={(value) =>
                      updateEditCase(evaluationCase.id, {
                        documentText: value,
                      })
                    }
                    onOutputChange={(value) =>
                      updateEditCase(evaluationCase.id, {
                        expectedOutputText: value,
                      })
                    }
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive-outline"
                    onClick={() => removeEditCase(evaluationCase.id)}
                    disabled={isBusy}
                    className="mt-3"
                  >
                    <Trash2 className="mr-2 size-4 shrink-0" />
                    {isRemoving ? 'Removing...' : 'Remove case'}
                  </Button>
                </details>
              ))}
            </div>
            {localError ? (
              <p className="text-sm text-destructive">{localError}</p>
            ) : null}
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isBusy}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSaveChanges}
                disabled={isBusy || editCases.length === 0}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 size-4 shrink-0 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save changes'
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {evaluation.archived ? (
              <Badge variant="warning-soft">Archived</Badge>
            ) : null}
            <p className="text-sm text-pretty">{evaluation.description}</p>
            <p className="text-sm font-medium">
              {pluralizeCases(evaluation.cases.length)}
            </p>
            {activeCases.map((evaluationCase) => (
              <details
                key={evaluationCase.id}
                className="rounded-md border p-3 text-sm"
              >
                <summary className="cursor-pointer font-medium">
                  {evaluationCase.title}
                </summary>
                <div className="mt-3 space-y-3">
                  <div className="space-y-1.5">
                    <p className="font-medium">Input document</p>
                    <pre className="max-w-full overflow-x-hidden whitespace-pre-wrap break-words rounded-md bg-muted/40 p-3 text-sm">
                      {evaluationCase.documentText}
                    </pre>
                  </div>
                  <div className="space-y-1.5">
                    <p className="font-medium">Full expected output</p>
                    <pre className="max-w-full overflow-x-hidden whitespace-pre-wrap break-words rounded-md bg-muted/40 p-3 text-xs">
                      {JSON.stringify(evaluationCase.expectedOutput, null, 2)}
                    </pre>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive-outline"
                    onClick={() => onRemoveCase(evaluationCase.id)}
                    disabled={isRemoving}
                  >
                    <Trash2 className="mr-2 size-4 shrink-0" />
                    {isRemoving ? 'Removing...' : 'Remove case'}
                  </Button>
                </div>
              </details>
            ))}
            {archivedCases.map((evaluationCase) => (
              <details
                key={evaluationCase.id}
                className="rounded-md border p-3 text-sm"
              >
                <summary className="cursor-pointer font-medium">
                  {evaluationCase.title}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    Archived
                  </span>
                </summary>
                <div className="mt-3 space-y-3">
                  <div className="space-y-1.5">
                    <p className="font-medium">Input document</p>
                    <pre className="max-w-full overflow-x-hidden whitespace-pre-wrap break-words rounded-md bg-muted/40 p-3 text-sm">
                      {evaluationCase.documentText}
                    </pre>
                  </div>
                  <div className="space-y-1.5">
                    <p className="font-medium">Full expected output</p>
                    <pre className="max-w-full overflow-x-hidden whitespace-pre-wrap break-words rounded-md bg-muted/40 p-3 text-xs">
                      {JSON.stringify(evaluationCase.expectedOutput, null, 2)}
                    </pre>
                  </div>
                </div>
              </details>
            ))}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function EvaluationResultDetailSheet({
  open,
  onOpenChange,
  runVersion,
  evaluation,
  results,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  runVersion: number | null;
  evaluation: EvaluationColumn | null;
  results: AssignmentTypeEvaluationHistory['runs'][number]['results'];
}) {
  if (!evaluation) return null;
  const resultsByCaseId = new Map(
    results.map((result) => [result.caseId, result])
  );
  const passed = evaluation.cases.filter(
    (evaluationCase) =>
      resultsByCaseId.get(evaluationCase.id)?.status === 'pass'
  ).length;
  const resultCount = evaluation.cases.filter((evaluationCase) =>
    resultsByCaseId.has(evaluationCase.id)
  ).length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        aria-describedby={undefined}
        className="flex max-h-screen flex-col overflow-y-auto sm:max-w-xl"
      >
        <SheetHeader>
          <SheetTitle className="flex flex-wrap items-center gap-2">
            {evaluation.label}
            <Badge
              variant={
                resultCount > 0 && passed === resultCount
                  ? 'success'
                  : passed === 0
                    ? 'destructive'
                    : 'warning-soft'
              }
            >
              {passed}/{resultCount}
            </Badge>
          </SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          {runVersion !== null ? (
            <p className="text-sm text-muted-foreground">
              Prompt version v{runVersion}
            </p>
          ) : null}
          {evaluation.cases.map((evaluationCase) => {
            const result = resultsByCaseId.get(evaluationCase.id);
            return (
              <details
                key={evaluationCase.id}
                className="rounded-md border p-3 text-sm"
              >
                <summary className="cursor-pointer font-medium">
                  {evaluationCase.title}
                  {result ? (
                    <Badge
                      variant={evaluationStatusBadgeVariant(result.status)}
                      className="ml-2"
                    >
                      {evaluationStatusLabel(result.status)}
                    </Badge>
                  ) : null}
                </summary>
                {result ? (
                  <div className="mt-3 space-y-3">
                    <div className="space-y-1.5">
                      <p className="font-medium">Judge evidence</p>
                      <p className="text-pretty">{result.evidence}</p>
                    </div>
                    <div className="space-y-1.5">
                      <p className="font-medium">Expected output</p>
                      <pre className="max-w-full overflow-x-hidden whitespace-pre-wrap break-words rounded-md bg-muted/40 p-3 text-xs">
                        {JSON.stringify(result.expectedOutput, null, 2)}
                      </pre>
                    </div>
                    <div className="space-y-1.5">
                      <p className="font-medium">Actual output</p>
                      <pre className="max-w-full overflow-x-hidden whitespace-pre-wrap break-words rounded-md bg-muted/40 p-3 text-xs">
                        {JSON.stringify(result.gradingOutput, null, 2)}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-muted-foreground">
                    This case was not part of the run.
                  </p>
                )}
              </details>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function historicalCompiledPrompt(snapshot: unknown) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const compiledPrompt = (snapshot as Record<string, unknown>).compiledPrompt;
  if (!compiledPrompt || typeof compiledPrompt !== 'object') return null;
  const { system, userMessage } = compiledPrompt as Record<string, unknown>;
  if (typeof system !== 'string' || typeof userMessage !== 'string') {
    return null;
  }
  return { system, userMessage };
}

function EvaluationRunDetailSheet({
  run,
  open,
  onOpenChange,
}: {
  run: AssignmentTypeEvaluationHistory['runs'][number] | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!run) return null;
  const compiledPrompt = historicalCompiledPrompt(run.promptSnapshot);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        aria-describedby={undefined}
        className="flex w-full max-w-full flex-col overflow-y-auto sm:max-w-xl md:max-w-2xl"
      >
        <SheetHeader>
          <SheetTitle>Prompt v{run.promptVersion}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            {run.createdAtLabel} · {run.passedCases}/{run.totalCases} passed
          </p>
          {compiledPrompt ? (
            <>
              <div className="space-y-2">
                <p className="text-sm font-medium">System message</p>
                <pre className="max-w-full overflow-x-hidden whitespace-pre-wrap break-words rounded-md border bg-muted/40 p-3 text-sm">
                  {compiledPrompt.system}
                </pre>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">User message template</p>
                <pre className="max-w-full overflow-x-hidden whitespace-pre-wrap break-words rounded-md border bg-muted/40 p-3 text-sm">
                  {compiledPrompt.userMessage}
                </pre>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              This run does not include a readable compiled prompt snapshot.
            </p>
          )}
        </div>
        <SheetFooter className="mt-4">
          <SheetClose asChild>
            <Button type="button">Close</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function EvaluationHistorySection({
  assignmentTypeId,
  evaluationHistory,
  isPromptPreviewStale,
}: {
  assignmentTypeId: string;
  evaluationHistory: AssignmentTypeEvaluationHistory;
  isPromptPreviewStale: boolean;
}) {
  const addCaseFetcher = useFetcher<EvaluationFetcherData>();
  const archiveFetcher = useFetcher<{ success?: boolean; message?: string }>();
  const runFetcher = useFetcher<{ success?: boolean; message?: string }>();

  const [addOpen, setAddOpen] = useState(false);
  const [detailColumnKey, setDetailColumnKey] = useState<string | null>(null);
  const [detailRunId, setDetailRunId] = useState<string | null>(null);
  const [detailResult, setDetailResult] = useState<{
    runVersion: number;
    columnKey: string;
    results: AssignmentTypeEvaluationHistory['runs'][number]['results'];
  } | null>(null);

  const isRunning = runFetcher.state !== 'idle';
  const isRemoving = archiveFetcher.state !== 'idle';
  const runErrorMessage =
    runFetcher.data && runFetcher.data.success === false
      ? (runFetcher.data.message ?? 'The evaluation suite could not run.')
      : null;

  const activeCaseCount = evaluationHistory.cases.filter(
    (evaluationCase) => !evaluationCase.archived
  ).length;
  const columns = buildEvaluationColumns(evaluationHistory);
  const activeEvaluationCount = columns.filter(
    (column) =>
      !column.archived &&
      column.cases.some((evaluationCase) => !evaluationCase.archived)
  ).length;
  const totalColumnCount = columns.length;
  const detailEvaluation = detailColumnKey
    ? (columns.find((column) => column.key === detailColumnKey) ?? null)
    : null;
  const detailResultEvaluation = detailResult
    ? (columns.find((column) => column.key === detailResult.columnKey) ?? null)
    : null;
  const evaluationSummary = `${activeEvaluationCount} ${
    activeEvaluationCount === 1 ? 'evaluation' : 'evaluations'
  } · ${pluralizeCases(activeCaseCount)}`;
  const detailRun = detailRunId
    ? (evaluationHistory.runs.find((run) => run.id === detailRunId) ?? null)
    : null;

  function handleRunAll() {
    const formData = new FormData();
    formData.set('intent', 'runSuite');
    formData.set('assignmentTypeId', assignmentTypeId);
    runFetcher.submit(formData, {
      method: 'POST',
      action: '/api/domain/assignment-type-evaluations',
    });
  }

  function handleRemoveCase(caseId: string) {
    const formData = new FormData();
    formData.set('intent', 'archiveCase');
    formData.set('assignmentTypeId', assignmentTypeId);
    formData.set('caseId', caseId);
    archiveFetcher.submit(formData, {
      method: 'POST',
      action: '/api/domain/assignment-type-evaluations',
    });
  }

  const canRunAll = activeCaseCount > 0 && !isPromptPreviewStale && !isRunning;

  return (
    <div className="space-y-3 border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Evaluation history</h3>
        <span className="text-sm text-muted-foreground">
          {evaluationSummary}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setAddOpen(true)}
        >
          <Plus className="mr-1.5 size-4 shrink-0" />
          Add evaluation
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={handleRunAll}
          disabled={!canRunAll}
          aria-busy={isRunning}
        >
          {isRunning ? (
            <>
              <Loader2 className="mr-2 size-4 shrink-0 animate-spin" />
              Running...
            </>
          ) : (
            'Run all cases'
          )}
        </Button>
        {isPromptPreviewStale ? (
          <p className="text-sm text-muted-foreground">
            Save prompt changes before running the full suite.
          </p>
        ) : null}
      </div>

      {runErrorMessage ? (
        <p className="text-sm text-destructive">{runErrorMessage}</p>
      ) : null}

      {columns.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No evaluations yet. Add one to start tracking prompt-version runs.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table
            className="w-full min-w-max border-collapse text-sm"
            aria-label="Evaluation history"
          >
            <caption className="sr-only">
              Rows are saved prompt-version runs. Columns are named evaluations
              containing one or more input and expected-output cases.
            </caption>
            <thead>
              <tr>
                <th
                  scope="col"
                  className="sticky left-0 z-10 min-w-[6rem] border-b bg-muted/60 p-2 text-left align-bottom font-medium"
                >
                  Version
                </th>
                {columns.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    className="min-w-[9rem] border-b border-l bg-muted/40 p-2 text-left font-medium"
                  >
                    <button
                      type="button"
                      onClick={() => setDetailColumnKey(column.key)}
                      aria-label={`View evaluation ${column.label}`}
                      className="flex max-w-[12rem] flex-col items-start text-left hover:underline"
                    >
                      <span>{column.label}</span>
                      <span className="text-[10px] font-normal text-muted-foreground">
                        {pluralizeCases(column.cases.length)}
                      </span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {evaluationHistory.runs.length === 0 ? (
                <tr>
                  <td
                    className="sticky left-0 bg-background p-2 text-sm text-muted-foreground"
                    colSpan={1 + totalColumnCount}
                  >
                    No runs yet. Run all cases to add the first row.
                  </td>
                </tr>
              ) : (
                evaluationHistory.runs.map((run) => {
                  const summaryStatus = runSummaryStatus(run);
                  const resultsByCaseId = new Map(
                    run.results.map((result) => [result.caseId, result])
                  );
                  return (
                    <tr key={run.id}>
                      <th
                        scope="row"
                        className="sticky left-0 z-10 border-t bg-background p-2 text-left align-top"
                      >
                        <button
                          type="button"
                          aria-label={`View prompt v${run.promptVersion}`}
                          onClick={() => setDetailRunId(run.id)}
                          className="text-left hover:underline"
                        >
                          <span className="block font-medium tabular-nums">
                            v{run.promptVersion}
                          </span>
                          <time className="block text-[10px] font-normal text-muted-foreground">
                            {run.createdAtLabel}
                          </time>
                        </button>
                        <div
                          className={`text-xs font-medium tabular-nums ${runSummaryTextClass(summaryStatus)}`}
                          data-status={summaryStatus}
                        >
                          {run.passedCases}/{run.totalCases}
                        </div>
                      </th>
                      {columns.map((column) => {
                        const columnResults = column.cases.flatMap(
                          (evaluationCase) => {
                            const result = resultsByCaseId.get(
                              evaluationCase.id
                            );
                            return result ? [result] : [];
                          }
                        );
                        const passed = columnResults.filter(
                          (result) => result.status === 'pass'
                        ).length;
                        const status: AssignmentTypeEvaluationStatus =
                          columnResults.length > 0 &&
                          passed === columnResults.length
                            ? 'pass'
                            : columnResults.length > 0 && passed === 0
                              ? 'fail'
                              : 'needs_review';
                        return (
                          <td
                            key={column.key}
                            className="border-t border-l p-2 align-top"
                          >
                            {columnResults.length > 0 ? (
                              <button
                                type="button"
                                className="inline-flex min-h-7 items-center justify-center"
                                onClick={() =>
                                  setDetailResult({
                                    runVersion: run.promptVersion,
                                    columnKey: column.key,
                                    results: run.results,
                                  })
                                }
                                aria-label={`${column.label}: ${passed}/${columnResults.length} passed`}
                              >
                                <Badge
                                  variant={evaluationStatusBadgeVariant(status)}
                                  data-status={status}
                                >
                                  {passed}/{columnResults.length}
                                </Badge>
                              </button>
                            ) : (
                              <span className="px-1 text-xs text-muted-foreground">
                                —
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      <AddEvaluationSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        assignmentTypeId={assignmentTypeId}
        fetcher={addCaseFetcher}
      />

      <EvaluationDetailSheet
        evaluation={detailEvaluation}
        assignmentTypeId={assignmentTypeId}
        open={Boolean(detailEvaluation)}
        onOpenChange={(open) => {
          if (!open) setDetailColumnKey(null);
        }}
        onRemoveCase={handleRemoveCase}
        isRemoving={isRemoving}
      />

      <EvaluationResultDetailSheet
        open={Boolean(detailResult)}
        onOpenChange={(open) => {
          if (!open) setDetailResult(null);
        }}
        runVersion={detailResult?.runVersion ?? null}
        evaluation={detailResultEvaluation}
        results={detailResult?.results ?? []}
      />

      <EvaluationRunDetailSheet
        run={detailRun}
        open={Boolean(detailRun)}
        onOpenChange={(open) => {
          if (!open) setDetailRunId(null);
        }}
      />
    </div>
  );
}

export function PromptConfigEditor({
  initial,
  namePrefix = '',
  onChange,
  gradingAssistantPromptPreview,
  gradingAssistantPromptPreviewUnavailableReason,
  isPromptPreviewStale = false,
  assignmentTypeId,
  title,
  scoringScale,
  rubric,
}: {
  initial: PromptConfigData;
  namePrefix?: string;
  onChange?: (config: PromptConfigData) => void;
  gradingAssistantPromptPreview?: GradingAssistantPromptPreview;
  gradingAssistantPromptPreviewUnavailableReason?: string;
  isPromptPreviewStale?: boolean;
  assignmentTypeId?: string | null;
  title?: string;
  scoringScale?: ScoringScaleData;
  rubric?: RubricData;
}) {
  const [cfg, setCfg] = useState<PromptConfigData>(initial);
  const [editOpen, setEditOpen] = useState(false);
  const [compiledOpen, setCompiledOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const usesBuiltInPreset = Boolean(cfg.instructionsPreset?.trim());
  const instructions = cfg.gradingInstructions?.trim() ?? '';
  const textareaId = `${namePrefix}gradingInstr`;
  const systemInstructionsId = `${namePrefix}systemInstr`;
  const canTestPrompt = Boolean(
    assignmentTypeId && gradingAssistantPromptPreview
  );

  function updateCfg(next: PromptConfigData) {
    setCfg(next);
    onChange?.(next);
  }

  return (
    <div className="space-y-3">
      {usesBuiltInPreset && (
        <p className="text-sm text-muted-foreground text-pretty">
          This grading assistant uses built-in instructions. Use{' '}
          <span className="font-medium text-foreground">Edit instructions</span>{' '}
          to add custom instructions that override them.
        </p>
      )}

      <p className="line-clamp-2 text-sm text-muted-foreground text-pretty">
        {instructions || 'No custom grading instructions yet.'}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setEditOpen(true)}
        >
          Edit instructions
        </Button>
        {SHOW_PROMPT_INSPECTION_CONTROLS && gradingAssistantPromptPreview ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={
                isPromptPreviewStale ? undefined : () => setCompiledOpen(true)
              }
              disabled={isPromptPreviewStale}
            >
              View compiled prompt
            </Button>
            {isPromptPreviewStale ? (
              <p className="text-sm text-muted-foreground">
                Save changes to preview the updated prompt.
              </p>
            ) : null}
          </>
        ) : SHOW_PROMPT_INSPECTION_CONTROLS ? (
          <p className="text-sm text-muted-foreground">
            {gradingAssistantPromptPreviewUnavailableReason ??
              'Save this assignment type to preview the compiled prompt.'}
          </p>
        ) : null}
        {SHOW_PROMPT_INSPECTION_CONTROLS && canTestPrompt ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setTestOpen(true)}
          >
            Test prompt
          </Button>
        ) : null}
      </div>

      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent
          aria-describedby={undefined}
          className="flex max-h-screen flex-col overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle>Edit instructions</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor={systemInstructionsId}>
                Custom system instructions
              </Label>
              <Textarea
                id={systemInstructionsId}
                rows={4}
                value={cfg.systemInstructions ?? ''}
                onChange={(e) =>
                  updateCfg({ ...cfg, systemInstructions: e.target.value })
                }
              />
              <p className="text-sm text-muted-foreground text-pretty">
                Sets tone or persona for the AI. Core grading rules — JSON
                output format, score range, feedback structure — always apply
                and aren&apos;t editable here.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor={textareaId}>Grading instructions</Label>
              <Textarea
                id={textareaId}
                rows={12}
                value={cfg.gradingInstructions ?? ''}
                onChange={(e) =>
                  updateCfg({ ...cfg, gradingInstructions: e.target.value })
                }
              />
              <p className="text-sm text-muted-foreground text-pretty">
                Tell the AI how to grade this assignment. Include scoring rules,
                tone, and how to interpret each rubric category.
              </p>
            </div>
          </div>
          <SheetFooter className="mt-4">
            <SheetClose asChild>
              <Button type="button">Done</Button>
            </SheetClose>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {gradingAssistantPromptPreview ? (
        <CompiledPromptSheet
          open={compiledOpen}
          onOpenChange={setCompiledOpen}
          preview={gradingAssistantPromptPreview}
        />
      ) : null}

      {canTestPrompt && assignmentTypeId ? (
        <ScratchTestSheet
          open={testOpen}
          onOpenChange={setTestOpen}
          assignmentTypeId={assignmentTypeId}
          title={title ?? ''}
          scoringScale={scoringScale ?? DEFAULT_SCORING_SCALE}
          rubric={rubric ?? { categories: [] }}
          promptConfig={cfg}
        />
      ) : null}

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
  if (cfg.systemInstructions?.trim()) {
    result.systemInstructions = cfg.systemInstructions.trim();
  }
  if (cfg.gradingInstructions?.trim()) {
    result.gradingInstructions = cfg.gradingInstructions.trim();
  }
  if (cfg.instructionsPreset?.trim()) {
    result.instructionsPreset = cfg.instructionsPreset.trim();
  }
  return result;
}

export function promptConfigSnapshot(cfg: PromptConfigData) {
  return JSON.stringify(serializePromptConfig(cfg));
}

export function rubricSnapshot(rubric: RubricData) {
  return JSON.stringify({
    categories: rubric.categories.map((category) => ({
      key: labelToKey(category.label) || category.key,
      label: category.label.trim(),
      weight: category.weight,
      description: category.description.trim(),
    })),
  });
}

export function scoringScaleSnapshot(scale: ScoringScaleData) {
  return JSON.stringify(scale);
}
