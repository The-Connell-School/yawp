import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Link, useFetcher } from 'react-router';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ClipboardPaste,
  Copy,
  FileUp,
  FlaskConical,
  GripVertical,
  Loader2,
  Pencil,
  Plus,
  Sprout,
  Trash2,
  X,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/components/ui/alert-dialog';
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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '~/components/ui/accordion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { Tooltip } from '~/components/ui/tooltip';
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
import {
  computePromptVersionLabels,
  formatPromptDate,
} from '~/domain/ai-evaluation/assignment-type-evaluation.shared';
import type {
  AssignmentTypeEvaluationHistory,
  AssignmentTypeEvaluationStatus,
  EvaluationCopySourceCatalog,
} from '~/domain/ai-evaluation/assignment-type-evaluation.shared';
import { cn } from '~/utils/misc';

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
                <JsonPreview
                  label="Grading output"
                  value={result.gradingOutput ?? result.rawGradingOutput}
                />
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

const JSON_PREVIEW_COLLAPSED_HEIGHT_PX = 112;

// Truncates long JSON (or other pre-formatted text) to a few rows, with a
// toggle to expand up to a taller height before it starts scrolling. Never
// scrolls while collapsed.
function JsonPreview({ value, label }: { value: unknown; label?: string }) {
  const text =
    typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);
  const preRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const node = preRef.current;
    if (!node) return;
    setCanExpand(node.scrollHeight > JSON_PREVIEW_COLLAPSED_HEIGHT_PX + 1);
  }, [text]);

  return (
    <div className="space-y-1.5">
      {label ? <p className="font-medium">{label}</p> : null}
      <div className="relative">
        <pre
          ref={preRef}
          className={cn(
            'max-w-full overflow-x-hidden whitespace-pre-wrap break-words rounded-md bg-muted/40 p-3 text-xs',
            expanded
              ? 'max-h-96 overflow-y-auto'
              : 'max-h-28 overflow-hidden',
            canExpand && !expanded && 'pb-8'
          )}
        >
          {text}
        </pre>
        {canExpand && !expanded ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center rounded-b-md bg-gradient-to-t from-muted via-muted/90 to-transparent pb-1.5 pt-6">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="pointer-events-auto h-6 gap-1 rounded-full bg-background px-2.5 text-xs font-semibold shadow-sm"
              onClick={() => setExpanded(true)}
            >
              <ChevronDown className="size-3.5 shrink-0" />
              Show more
            </Button>
          </div>
        ) : null}
      </div>
      {expanded ? (
        <div className="flex justify-center">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-6 gap-1 rounded-full px-2.5 text-xs font-semibold shadow-sm"
            onClick={() => setExpanded(false)}
          >
            <ChevronUp className="size-3.5 shrink-0" />
            Show less
          </Button>
        </div>
      ) : null}
    </div>
  );
}

// Two-tab underline switcher for expected vs. actual output. The tabs are
// always equal width, so the active indicator can just slide between the
// left and right half instead of measuring anything.
function OutputTabs({
  expectedOutput,
  actualOutput,
}: {
  expectedOutput: unknown;
  actualOutput: unknown;
}) {
  const [activeTab, setActiveTab] = useState<'expected' | 'actual'>(
    'expected'
  );

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => setActiveTab(value as 'expected' | 'actual')}
    >
      <TabsList className="relative grid h-auto w-full grid-cols-2 rounded-none border-b bg-transparent p-0">
        <TabsTrigger
          value="expected"
          className="rounded-none border-0 bg-transparent px-1 pb-2 text-xs font-medium text-muted-foreground shadow-none data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
        >
          Expected output
        </TabsTrigger>
        <TabsTrigger
          value="actual"
          className="rounded-none border-0 bg-transparent px-1 pb-2 text-xs font-medium text-muted-foreground shadow-none data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
        >
          Actual output
        </TabsTrigger>
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute bottom-0 left-0 h-0.5 w-1/2 bg-primary transition-transform duration-200 ease-out',
            activeTab === 'actual' && 'translate-x-full'
          )}
        />
      </TabsList>
      <TabsContent value="expected" className="mt-3">
        <JsonPreview value={expectedOutput} />
      </TabsContent>
      <TabsContent value="actual" className="mt-3">
        <JsonPreview value={actualOutput} />
      </TabsContent>
    </Tabs>
  );
}

function evaluationStatusLabel(status: AssignmentTypeEvaluationStatus) {
  if (status === 'pass') return 'Pass';
  if (status === 'fail') return 'Fail';
  if (status === 'blocked') return 'Blocked';
  return 'Needs review';
}

function evaluationStatusSynopsis(status: AssignmentTypeEvaluationStatus) {
  if (status === 'pass') return 'Pass';
  if (status === 'fail') return 'Fail';
  return 'Partial';
}

function evaluationStatusTextClass(status: AssignmentTypeEvaluationStatus) {
  if (status === 'pass') return 'text-green-700 dark:text-green-400';
  if (status === 'fail') return 'text-destructive';
  return 'text-orange-700 dark:text-orange-400';
}

function evaluationStatusCellClass(status: AssignmentTypeEvaluationStatus) {
  if (status === 'pass') {
    return 'bg-green-100 text-green-900 hover:bg-green-200 dark:bg-green-950 dark:text-green-100 dark:hover:bg-green-900';
  }
  if (status === 'fail') {
    return 'bg-destructive text-destructive-foreground hover:bg-destructive/90';
  }
  return 'bg-orange-100 text-orange-700 hover:bg-orange-200 hover:text-orange-800 dark:bg-orange-950 dark:text-orange-100 dark:hover:bg-orange-900';
}

function columnSummaryStatus(
  passed: number,
  total: number
): AssignmentTypeEvaluationStatus {
  if (total > 0 && passed === total) return 'pass';
  if (total > 0 && passed === 0) return 'fail';
  return 'needs_review';
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
  expanded?: boolean;
};

type EvaluationFetcherData = {
  success?: boolean;
  message?: string;
  evaluationId?: string;
  copiedEvaluations?: number;
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
  copySourceCatalog = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignmentTypeId: string;
  fetcher: ReturnType<typeof useFetcher<EvaluationFetcherData>>;
  copySourceCatalog?: EvaluationCopySourceCatalog;
}) {
  const [description, setDescription] = useState('');
  const [evaluationTitle, setEvaluationTitle] = useState('');
  const [cases, setCases] = useState<GeneratedEvaluationCaseDraft[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copySourceAssignmentTypeId, setCopySourceAssignmentTypeId] =
    useState('');
  const [copySourceSuiteId, setCopySourceSuiteId] = useState('');
  const isWorking = fetcher.state !== 'idle';
  const errorMessage =
    fetcher.data && fetcher.data.success === false
      ? (fetcher.data.message ?? 'Could not save the case.')
      : localError;
  const handledResponseRef = useRef<unknown>(null);
  const copySourceAssignmentType =
    copySourceCatalog.find(
      (source) => source.assignmentTypeId === copySourceAssignmentTypeId
    ) ?? null;
  const copySourceSuite =
    copySourceAssignmentType?.suites.find(
      (suite) => suite.id === copySourceSuiteId
    ) ?? null;

  useEffect(() => {
    if (!open) {
      setDescription('');
      setEvaluationTitle('');
      setCases([]);
      setLocalError(null);
      setCopyOpen(false);
      setCopySourceAssignmentTypeId('');
      setCopySourceSuiteId('');
    }
  }, [open]);

  useEffect(() => {
    if (!fetcher.data?.success) return;
    if (handledResponseRef.current === fetcher.data) return;
    handledResponseRef.current = fetcher.data;
    if (fetcher.data.evaluation) {
      setCases((current) => [
        ...current,
        ...fetcher.data!.evaluation!.cases.map((evaluationCase) => ({
          title: evaluationCase.title,
          documentText: evaluationCase.documentText,
          expectedOutputText: JSON.stringify(
            evaluationCase.expectedOutput,
            null,
            2
          ),
          selected: true,
        })),
      ]);
      return;
    }
    if (
      fetcher.data.evaluationId ||
      fetcher.data.copiedEvaluations !== undefined
    ) {
      onOpenChange(false);
    }
  }, [fetcher.data, onOpenChange]);

  const selectedCount = cases.filter(
    (evaluationCase) => evaluationCase.selected
  ).length;
  const hasEvaluationBasics =
    evaluationTitle.trim().length > 0 && description.trim().length > 0;
  const canGenerate = hasEvaluationBasics && !isWorking;
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
    formData.set('description', description.trim());
    fetcher.submit(formData, {
      method: 'POST',
      action: '/api/domain/assignment-type-evaluations',
    });
  }

  function handleCopyEvaluation(sourceEvaluationId: string) {
    if (!copySourceSuiteId || isWorking) return;
    setLocalError(null);
    const formData = new FormData();
    formData.set('intent', 'copyEvaluation');
    formData.set('assignmentTypeId', assignmentTypeId);
    formData.set('sourceSuiteVersionId', copySourceSuiteId);
    formData.set('sourceEvaluationId', sourceEvaluationId);
    fetcher.submit(formData, {
      method: 'POST',
      action: '/api/domain/assignment-type-evaluations',
    });
  }

  function handleCopySuite() {
    if (!copySourceSuiteId || isWorking) return;
    setLocalError(null);
    const formData = new FormData();
    formData.set('intent', 'copyEvaluationSuite');
    formData.set('assignmentTypeId', assignmentTypeId);
    formData.set('sourceSuiteVersionId', copySourceSuiteId);
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

  function handleAddManualCase() {
    setCases((current) => [
      ...current,
      {
        title: '',
        documentText: '',
        expectedOutputText: '{}',
        selected: true,
        expanded: true,
      },
    ]);
  }

  function removeCase(index: number) {
    setCases((current) =>
      current.filter((_, caseIndex) => caseIndex !== index)
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
          {copySourceCatalog.length > 0 ? (
            <div className="rounded-md border p-3">
              {!copyOpen ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setCopyOpen(true)}
                  disabled={isWorking}
                >
                  <Copy className="mr-1.5 size-4 shrink-0" />
                  Copy from another suite
                </Button>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">
                      Copy from another suite
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setCopyOpen(false)}
                      aria-label="Close copy from another suite"
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Adds evaluations to this suite — nothing here is removed
                    or changed.
                  </p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="copy-source-assignment-type">
                        Source assignment type
                      </Label>
                      <Select
                        value={copySourceAssignmentTypeId}
                        onValueChange={(value) => {
                          setCopySourceAssignmentTypeId(value);
                          setCopySourceSuiteId('');
                        }}
                      >
                        <SelectTrigger id="copy-source-assignment-type">
                          <SelectValue placeholder="Select assignment type" />
                        </SelectTrigger>
                        <SelectContent>
                          {copySourceCatalog.map((source) => (
                            <SelectItem
                              key={source.assignmentTypeId}
                              value={source.assignmentTypeId}
                            >
                              {source.assignmentTypeTitle}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="copy-source-suite">
                        Source evaluation suite
                      </Label>
                      <Select
                        value={copySourceSuiteId}
                        onValueChange={setCopySourceSuiteId}
                        disabled={!copySourceAssignmentType}
                      >
                        <SelectTrigger id="copy-source-suite">
                          <SelectValue placeholder="Select suite" />
                        </SelectTrigger>
                        <SelectContent>
                          {(copySourceAssignmentType?.suites ?? []).map(
                            (suite) => (
                              <SelectItem key={suite.id} value={suite.id}>
                                {`Suite v${suite.version}`}
                              </SelectItem>
                            )
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {copySourceSuite ? (
                    <div className="space-y-2">
                      <ul role="list" className="divide-y rounded-md border">
                        {copySourceSuite.evaluations.map((evaluation) => (
                          <li
                            key={evaluation.id}
                            className="flex items-center justify-between gap-2 p-2"
                          >
                            <span className="min-w-0 flex-1 truncate text-sm">
                              {evaluation.title}
                            </span>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="shrink-0"
                              onClick={() =>
                                handleCopyEvaluation(evaluation.id)
                              }
                              disabled={isWorking}
                              aria-label={`Copy evaluation ${evaluation.title}`}
                            >
                              Copy
                            </Button>
                          </li>
                        ))}
                      </ul>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={handleCopySuite}
                        disabled={isWorking}
                      >
                        Copy entire suite
                      </Button>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}
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

          <div className="space-y-3 border-t pt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-medium">
                {pluralizeCases(cases.length)}
              </p>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddManualCase}
                  disabled={isWorking}
                >
                  <Plus className="mr-1.5 size-4 shrink-0" />
                  Add case
                </Button>
                <Tooltip
                  text={
                    hasEvaluationBasics
                      ? 'Suggest a few cases from the description above'
                      : 'Add an evaluation name and description first'
                  }
                >
                  <span className="inline-flex">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleGenerate}
                      disabled={!canGenerate}
                    >
                      {isWorking ? (
                        <Loader2 className="mr-1.5 size-4 shrink-0 animate-spin" />
                      ) : (
                        <Sprout className="mr-1.5 size-4 shrink-0" />
                      )}
                      Generate
                    </Button>
                  </span>
                </Tooltip>
              </div>
            </div>

            {cases.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No cases yet. Add one by hand, or generate a few from the
                description above.
              </p>
            ) : (
              <Accordion
                type="multiple"
                value={cases.flatMap((evaluationCase, index) =>
                  evaluationCase.expanded ? [String(index)] : []
                )}
                onValueChange={(openValues) =>
                  setCases((current) =>
                    current.map((evaluationCase, index) => ({
                      ...evaluationCase,
                      expanded: openValues.includes(String(index)),
                    }))
                  )
                }
              >
                {cases.map((evaluationCase, index) => (
                  <AccordionItem
                    key={`case-${index}`}
                    value={String(index)}
                    className="last:border-b-0"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        aria-label={`Use ${evaluationCase.title || `case ${index + 1}`}`}
                        checked={evaluationCase.selected}
                        onChange={(event) =>
                          updateCase(index, {
                            selected: event.target.checked,
                          })
                        }
                        disabled={isWorking}
                        className="size-4 shrink-0"
                      />
                      <AccordionTrigger className="min-w-0 flex-1 py-3 text-sm hover:no-underline">
                        <span className="truncate">
                          {evaluationCase.title || `Case ${index + 1}`}
                        </span>
                      </AccordionTrigger>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="shrink-0"
                        onClick={() => removeCase(index)}
                        disabled={isWorking}
                        aria-label={`Remove ${evaluationCase.title || `case ${index + 1}`}`}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    <AccordionContent>
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
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
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

type EvaluationDetailSelection =
  | { kind: 'evaluation'; columnKey: string }
  | { kind: 'run'; runId: string }
  | { kind: 'result'; runId: string; columnKey: string };

function evaluationDetailPanelHeader({
  title,
  onClose,
  subtitle,
}: {
  title: ReactNode;
  onClose: () => void;
  subtitle?: ReactNode;
}) {
  return (
    // Negative margins cancel the detail pane's own padding so this
    // border-b spans the full width of the pane, touching its edges.
    <div className="-mx-4 border-b px-4 pb-4 md:-mx-6 md:px-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 className="text-lg font-semibold leading-tight">{title}</h2>
          {subtitle ? (
            <div className="text-sm text-muted-foreground">{subtitle}</div>
          ) : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0"
          onClick={onClose}
          aria-label="Close details"
        >
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function toggleEvaluationSelection(
  current: EvaluationDetailSelection | null,
  next: EvaluationDetailSelection
): EvaluationDetailSelection | null {
  if (
    current?.kind === next.kind &&
    current.kind === 'evaluation' &&
    next.kind === 'evaluation' &&
    current.columnKey === next.columnKey
  ) {
    return null;
  }
  if (
    current?.kind === next.kind &&
    current.kind === 'run' &&
    next.kind === 'run' &&
    current.runId === next.runId
  ) {
    return null;
  }
  if (
    current?.kind === next.kind &&
    current.kind === 'result' &&
    next.kind === 'result' &&
    current.runId === next.runId &&
    current.columnKey === next.columnKey
  ) {
    return null;
  }
  return next;
}

type EvaluationCaseDraft = {
  id: string;
  title: string;
  documentText: string;
  expectedOutputText: string;
};

type UpdateEvaluationFetcherData = { success?: boolean; message?: string };

function EvaluationDetailPanel({
  evaluation,
  assignmentTypeId,
  onClose,
  onRemoveCase,
  isRemoving,
  allowChanges = true,
}: {
  evaluation: EvaluationColumn;
  assignmentTypeId: string;
  onClose: () => void;
  onRemoveCase: (caseId: string) => void;
  isRemoving: boolean;
  allowChanges?: boolean;
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
      setLocalError(null);
    } else {
      setLocalError(updateFetcher.data.message ?? 'Could not save changes.');
    }
  }, [isSaving, updateFetcher.data]);

  const isLegacy = evaluation.key.startsWith('legacy:');
  const activeCases = evaluation.cases.filter(
    (evaluationCase) => !evaluationCase.archived
  );
  const canEdit =
    allowChanges &&
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
    <div className="space-y-4">
      {evaluationDetailPanelHeader({
        title: evaluation.label,
        onClose,
      })}
      {canEdit ? (
        <div className="space-y-4">
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
            <Accordion type="multiple">
              {editCases.map((evaluationCase, index) => (
                <AccordionItem
                  key={evaluationCase.id}
                  value={evaluationCase.id}
                  className="last:border-b-0"
                >
                  <AccordionTrigger className="py-3 text-sm hover:no-underline">
                    {evaluationCase.title || `Case ${index + 1}`}
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3">
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
                    >
                      <Trash2 className="mr-2 size-4 shrink-0" />
                      {isRemoving ? 'Removing...' : 'Remove case'}
                    </Button>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
          {localError ? (
            <p className="text-sm text-destructive">{localError}</p>
          ) : null}
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
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
        <div className="space-y-4">
          {evaluation.archived ? (
            <Badge variant="warning-soft">Archived</Badge>
          ) : null}
          <p className="text-sm text-pretty">{evaluation.description}</p>
          <p className="text-sm font-medium">
            {pluralizeCases(evaluation.cases.length)}
          </p>
          <Accordion type="multiple">
            {activeCases.map((evaluationCase) => (
              <AccordionItem
                key={evaluationCase.id}
                value={evaluationCase.id}
                className="last:border-b-0"
              >
                <AccordionTrigger className="py-3 text-sm hover:no-underline">
                  {evaluationCase.title}
                </AccordionTrigger>
                <AccordionContent className="space-y-3">
                  <div className="space-y-1.5">
                    <p className="font-medium">Input document</p>
                    <pre className="max-w-full overflow-x-hidden whitespace-pre-wrap break-words rounded-md bg-muted/40 p-3 text-sm">
                      {evaluationCase.documentText}
                    </pre>
                  </div>
                  <JsonPreview
                    label="Full expected output"
                    value={evaluationCase.expectedOutput}
                  />
                  {allowChanges ? (
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
                  ) : null}
                </AccordionContent>
              </AccordionItem>
            ))}
            {archivedCases.map((evaluationCase) => (
              <AccordionItem
                key={evaluationCase.id}
                value={evaluationCase.id}
                className="last:border-b-0"
              >
                <AccordionTrigger className="py-3 text-sm hover:no-underline">
                  {evaluationCase.title}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    Archived
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-3">
                  <div className="space-y-1.5">
                    <p className="font-medium">Input document</p>
                    <pre className="max-w-full overflow-x-hidden whitespace-pre-wrap break-words rounded-md bg-muted/40 p-3 text-sm">
                      {evaluationCase.documentText}
                    </pre>
                  </div>
                  <JsonPreview
                    label="Full expected output"
                    value={evaluationCase.expectedOutput}
                  />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      )}
    </div>
  );
}

function EvaluationResultDetailPanel({
  promptLabel,
  evaluation,
  results,
  onClose,
}: {
  promptLabel: string | null;
  evaluation: EvaluationColumn;
  results: AssignmentTypeEvaluationHistory['runs'][number]['results'];
  onClose: () => void;
}) {
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
    <div className="space-y-4">
      {evaluationDetailPanelHeader({
        title: (
          <span className="flex flex-wrap items-center gap-2">
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
          </span>
        ),
        onClose,
        subtitle: promptLabel ? <p>Prompt version {promptLabel}</p> : undefined,
      })}
      <div className="divide-y">
        {evaluation.cases.map((evaluationCase) => {
          const result = resultsByCaseId.get(evaluationCase.id);
          return (
            <div
              key={evaluationCase.id}
              data-testid="evaluation-case-result"
              className="space-y-2 py-3 first:pt-0"
            >
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <p className="text-sm font-semibold">
                  {evaluationCase.title}
                </p>
                {result ? (
                  <p
                    className={cn(
                      'text-sm font-bold uppercase tracking-wide',
                      evaluationStatusTextClass(result.status)
                    )}
                  >
                    {evaluationStatusLabel(result.status)}
                  </p>
                ) : null}
              </div>
              {result ? (
                <div className="space-y-3">
                  <p className="text-sm text-pretty">{result.evidence}</p>
                  <OutputTabs
                    expectedOutput={result.expectedOutput}
                    actualOutput={result.gradingOutput}
                  />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  This case was not part of the run.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
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

function EvaluationRunDetailPanel({
  run,
  promptLabel,
  onClose,
}: {
  run: AssignmentTypeEvaluationHistory['runs'][number];
  promptLabel: string;
  onClose: () => void;
}) {
  const compiledPrompt = historicalCompiledPrompt(run.promptSnapshot);

  return (
    <div className="space-y-4">
      {evaluationDetailPanelHeader({
        title: `Prompt ${promptLabel}`,
        onClose,
        subtitle: (
          <p>
            {run.createdAtLabel} · {run.passedCases}/{run.totalCases} passed
          </p>
        ),
      })}
      <div className="space-y-4">
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
    </div>
  );
}

function resolveRunPromptLabel(
  run: { promptVersionId: string | null; promptVersion: number },
  promptLabels: Map<string, string>
): string {
  const label = run.promptVersionId ? promptLabels.get(run.promptVersionId) : undefined;
  return label ?? `v${run.promptVersion}`;
}

function EvaluationMatrixSection({
  assignmentTypeId,
  evaluationHistory,
  isPromptPreviewStale,
  layout = 'embedded',
  assignmentTypeTitle,
  promptVersionId,
  evaluationSuiteVersionId,
  allowEvaluationChanges = true,
  pageTitle = 'Evaluations',
  pageMeta,
  pageBackControl,
  toolbarLeading,
  emptyRunMessage = 'No runs yet. Run all cases to add the first row.',
  copySourceCatalog = [],
}: {
  assignmentTypeId: string;
  evaluationHistory: AssignmentTypeEvaluationHistory;
  isPromptPreviewStale: boolean;
  layout?: 'embedded' | 'page';
  assignmentTypeTitle?: string;
  promptVersionId?: string;
  evaluationSuiteVersionId?: string;
  allowEvaluationChanges?: boolean;
  pageTitle?: string;
  pageMeta?: ReactNode;
  pageBackControl?: ReactNode;
  toolbarLeading?: ReactNode;
  emptyRunMessage?: string;
  copySourceCatalog?: EvaluationCopySourceCatalog;
}) {
  const addCaseFetcher = useFetcher<EvaluationFetcherData>();
  const archiveFetcher = useFetcher<{ success?: boolean; message?: string }>();
  const runFetcher = useFetcher<{ success?: boolean; message?: string }>();

  const [addOpen, setAddOpen] = useState(false);
  const [detailSelection, setDetailSelection] =
    useState<EvaluationDetailSelection | null>(null);

  const isRunning = runFetcher.state !== 'idle';
  const isRemoving = archiveFetcher.state !== 'idle';
  const runErrorMessage =
    runFetcher.data && runFetcher.data.success === false
      ? (runFetcher.data.message ?? 'The evaluation suite could not run.')
      : null;

  const promptLabels = useMemo(
    () => computePromptVersionLabels(evaluationHistory.promptVersions),
    [evaluationHistory.promptVersions]
  );
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
  const isDetailOpen = detailSelection !== null;
  const detailEvaluation =
    detailSelection?.kind === 'evaluation'
      ? (columns.find((column) => column.key === detailSelection.columnKey) ??
        null)
      : null;
  const detailRun =
    detailSelection?.kind === 'run' || detailSelection?.kind === 'result'
      ? (evaluationHistory.runs.find((run) =>
          detailSelection.kind === 'run'
            ? run.id === detailSelection.runId
            : run.id === detailSelection.runId
        ) ?? null)
      : null;
  const detailResultEvaluation =
    detailSelection?.kind === 'result'
      ? (columns.find((column) => column.key === detailSelection.columnKey) ??
        null)
      : null;
  const evaluationSummary = `${activeEvaluationCount} ${
    activeEvaluationCount === 1 ? 'evaluation' : 'evaluations'
  } · ${pluralizeCases(activeCaseCount)}`;

  function closeDetailPanel() {
    setDetailSelection(null);
  }

  function handleRunAll() {
    const formData = new FormData();
    formData.set('intent', 'runSuite');
    formData.set('assignmentTypeId', assignmentTypeId);
    if (promptVersionId) formData.set('promptVersionId', promptVersionId);
    if (evaluationSuiteVersionId) {
      formData.set('evaluationSuiteVersionId', evaluationSuiteVersionId);
    }
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
  const isPageLayout = layout === 'page';
  const splitClassName = cn(
    'grid min-h-0',
    isPageLayout ? 'h-full flex-1' : 'overflow-hidden rounded-md border',
    isDetailOpen
      ? 'grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]'
      : 'grid-cols-[minmax(0,1fr)]'
  );
  const leftPaneClassName = cn(
    'min-h-0 min-w-0',
    isPageLayout ? 'flex flex-col overflow-hidden' : 'overflow-auto'
  );
  const tableScrollClassName = cn(
    'min-h-0 min-w-0 overflow-auto',
    isPageLayout ? 'flex-1 px-3 py-4 md:px-6' : ''
  );
  const detailPaneClassName = cn(
    'min-h-0 min-w-0 overflow-y-auto border-l p-4 md:p-6',
    isPageLayout ? 'h-full bg-muted/15' : ''
  );
  // Keep the left pane from stretching edge-to-edge when the detail panel
  // is closed, so it doesn't feel like an overly wide, empty page.
  const leftContentWidthClassName = cn(
    !isDetailOpen && 'mx-auto w-full max-w-5xl'
  );

  const toolbarContent = (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Evaluation history</h3>
        <span className="text-sm text-muted-foreground">
          {evaluationSummary}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {toolbarLeading}
        {allowEvaluationChanges ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAddOpen(true)}
          >
            <Plus className="mr-1.5 size-4 shrink-0" />
            Add evaluation
          </Button>
        ) : null}
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
    </>
  );

  const detailAside = isDetailOpen ? (
    <aside aria-label="Evaluation details" className={detailPaneClassName}>
      {detailSelection?.kind === 'evaluation' && detailEvaluation ? (
        <EvaluationDetailPanel
          evaluation={detailEvaluation}
          assignmentTypeId={assignmentTypeId}
          onClose={closeDetailPanel}
          onRemoveCase={handleRemoveCase}
          isRemoving={isRemoving}
          allowChanges={allowEvaluationChanges}
        />
      ) : null}
      {detailSelection?.kind === 'result' &&
      detailRun &&
      detailResultEvaluation ? (
        <EvaluationResultDetailPanel
          promptLabel={resolveRunPromptLabel(detailRun, promptLabels)}
          evaluation={detailResultEvaluation}
          results={detailRun.results}
          onClose={closeDetailPanel}
        />
      ) : null}
      {detailSelection?.kind === 'run' && detailRun ? (
        <EvaluationRunDetailPanel
          run={detailRun}
          promptLabel={resolveRunPromptLabel(detailRun, promptLabels)}
          onClose={closeDetailPanel}
        />
      ) : null}
    </aside>
  ) : null;

  const evaluationHistoryTable =
    columns.length > 0 ? (
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
              Run
            </th>
            {columns.map((column) => {
              const isColumnSelected =
                detailSelection?.kind === 'evaluation' &&
                detailSelection.columnKey === column.key;
              return (
                <th
                  key={column.key}
                  scope="col"
                  className="min-w-[9rem] border-b border-l bg-muted/40 p-0 text-left font-medium"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setDetailSelection((current) =>
                        toggleEvaluationSelection(current, {
                          kind: 'evaluation',
                          columnKey: column.key,
                        })
                      )
                    }
                    aria-label={`View evaluation ${column.label}`}
                    aria-pressed={isColumnSelected}
                    className={cn(
                      'flex max-w-[12rem] flex-col items-start p-2 text-left hover:bg-muted/50',
                      isColumnSelected &&
                        'bg-muted/70 ring-2 ring-inset ring-yellow-500 dark:ring-yellow-400'
                    )}
                  >
                    <span>{column.label}</span>
                    <span className="text-[10px] font-normal text-muted-foreground">
                      {pluralizeCases(column.cases.length)}
                    </span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {evaluationHistory.runs.length === 0 ? (
            <tr>
              <td
                className="sticky left-0 bg-background p-2 text-sm text-muted-foreground"
                colSpan={1 + totalColumnCount}
              >
                {emptyRunMessage}
              </td>
            </tr>
          ) : (
            evaluationHistory.runs.map((run) => {
              const isRunSelected =
                detailSelection?.kind === 'run' &&
                detailSelection.runId === run.id;
              const resultsByCaseId = new Map(
                run.results.map((result) => [result.caseId, result])
              );
              return (
                <tr key={run.id}>
                  <th
                    scope="row"
                    className="sticky left-0 z-10 h-px border-t bg-background p-0 text-left align-stretch"
                  >
                    <button
                      type="button"
                      aria-label={`View prompt v${run.promptVersion} from ${run.createdAtLabel}`}
                      aria-pressed={isRunSelected}
                      onClick={() =>
                        setDetailSelection((current) =>
                          toggleEvaluationSelection(current, {
                            kind: 'run',
                            runId: run.id,
                          })
                        )
                      }
                      className={cn(
                        'group flex h-full w-full items-center justify-between gap-2 px-2 py-3 text-left hover:bg-muted/60',
                        isRunSelected &&
                          'bg-muted/70 ring-2 ring-inset ring-yellow-500 dark:ring-yellow-400'
                      )}
                    >
                      <time className="whitespace-nowrap text-sm">
                        {run.createdAtLabel}
                      </time>
                      <ChevronRight
                        className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground"
                        aria-hidden="true"
                      />
                    </button>
                  </th>
                  {columns.map((column) => {
                    const columnResults = column.cases.flatMap(
                      (evaluationCase) => {
                        const result = resultsByCaseId.get(evaluationCase.id);
                        return result ? [result] : [];
                      }
                    );
                    const passed = columnResults.filter(
                      (result) => result.status === 'pass'
                    ).length;
                    const status = columnSummaryStatus(
                      passed,
                      columnResults.length
                    );
                    const synopsis = evaluationStatusSynopsis(status);
                    const isResultSelected =
                      detailSelection?.kind === 'result' &&
                      detailSelection.runId === run.id &&
                      detailSelection.columnKey === column.key;
                    return (
                      <td
                        key={column.key}
                        className={cn(
                          'h-px border-t border-l p-0 align-stretch',
                          columnResults.length > 0
                            ? evaluationStatusCellClass(status)
                            : ''
                        )}
                      >
                        {columnResults.length > 0 ? (
                          <button
                            type="button"
                            className={cn(
                              'flex h-full w-full items-center justify-center px-2 py-3 text-inherit text-xs font-semibold tabular-nums',
                              isResultSelected &&
                                'ring-2 ring-inset ring-yellow-500 dark:ring-yellow-400'
                            )}
                            onClick={() =>
                              setDetailSelection((current) =>
                                toggleEvaluationSelection(current, {
                                  kind: 'result',
                                  runId: run.id,
                                  columnKey: column.key,
                                })
                              )
                            }
                            aria-label={`${column.label}: ${passed}/${columnResults.length} ${synopsis}`}
                            aria-pressed={isResultSelected}
                            data-status={status}
                          >
                            {passed}/{columnResults.length} {synopsis}
                          </button>
                        ) : (
                          <span className="flex h-full w-full items-center justify-center px-2 py-3 text-xs text-muted-foreground">
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
    ) : null;

  return (
    <div className={cn(isPageLayout && 'flex h-full min-h-0 w-full flex-col')}>
      {isPageLayout ? (
        <div className={splitClassName}>
          <div className={leftPaneClassName}>
            <header className="shrink-0 border-b px-3 py-5 md:px-6 md:py-6">
              <div className={cn('space-y-5', leftContentWidthClassName)}>
                {pageBackControl ?? (
                  <Button variant="outline" size="sm" asChild>
                    <Link
                      to={`/app/admin/assignment-types/${assignmentTypeId}`}
                      className="w-fit"
                    >
                      <ArrowLeft className="mr-1.5 size-4 shrink-0" />
                      Back to assignment type
                    </Link>
                  </Button>
                )}

                <div className="space-y-1">
                  <h1 className="text-3xl font-semibold tracking-tight">
                    {pageTitle}
                  </h1>
                  {pageMeta ??
                    (assignmentTypeTitle ? (
                      <p className="text-sm text-muted-foreground">
                        {assignmentTypeTitle}
                      </p>
                    ) : null)}
                </div>
              </div>
            </header>

            <div className="shrink-0 px-3 py-4 md:px-6">
              <div className={cn('space-y-3', leftContentWidthClassName)}>
                {toolbarContent}
                {columns.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No evaluations yet. Add one to start tracking prompt-version
                    runs.
                  </p>
                ) : null}
              </div>
            </div>

            <div className={tableScrollClassName}>
              <div className={leftContentWidthClassName}>
                <div className="overflow-x-auto rounded-md border">
                  {evaluationHistoryTable}
                </div>
              </div>
            </div>
          </div>

          {detailAside}
        </div>
      ) : (
        <>
          <div className="space-y-3 border-t pt-4">
            {toolbarContent}
            {columns.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No evaluations yet. Add one to start tracking prompt-version
                runs.
              </p>
            ) : null}
          </div>

          {columns.length > 0 ? (
            <div className={splitClassName}>
              <div className={leftPaneClassName}>{evaluationHistoryTable}</div>
              {detailAside}
            </div>
          ) : null}
        </>
      )}

      <AddEvaluationSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        assignmentTypeId={assignmentTypeId}
        fetcher={addCaseFetcher}
        copySourceCatalog={copySourceCatalog}
      />
    </div>
  );
}

type ManagedPromptVersion =
  AssignmentTypeEvaluationHistory['promptVersions'][number];

type PromptVersionFetcherData = {
  success?: boolean;
  message?: string;
  promptVersionId?: string;
  revision?: number;
  status?: string;
};

function promptStatusBadgeVariant(status: ManagedPromptVersion['status']) {
  if (status === 'production') return 'success' as const;
  if (status === 'draft') return 'warning-soft' as const;
  return 'outline' as const;
}

function promptStatusLabel(status: ManagedPromptVersion['status']) {
  if (status === 'production') return 'Production';
  if (status === 'draft') return 'Draft';
  return 'Previous';
}

function PromptVersionEditorSheet({
  assignmentTypeId,
  promptVersion,
  promptLabel,
  open,
  onOpenChange,
}: {
  assignmentTypeId: string;
  promptVersion: ManagedPromptVersion;
  promptLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const fetcher = useFetcher<PromptVersionFetcherData>();
  const [systemMessage, setSystemMessage] = useState(
    promptVersion.systemMessageTemplate
  );
  const [userMessage, setUserMessage] = useState(
    promptVersion.userMessageTemplate
  );
  const handledResponseRef = useRef<unknown>(null);
  const isSaving = fetcher.state !== 'idle';
  const errorMessage =
    fetcher.data?.success === false
      ? (fetcher.data.message ?? 'The prompt could not be saved.')
      : null;

  useEffect(() => {
    setSystemMessage(promptVersion.systemMessageTemplate);
    setUserMessage(promptVersion.userMessageTemplate);
  }, [
    promptVersion.id,
    promptVersion.revision,
    promptVersion.systemMessageTemplate,
    promptVersion.userMessageTemplate,
  ]);

  useEffect(() => {
    if (isSaving || !fetcher.data || fetcher.data.success !== true) return;
    if (handledResponseRef.current === fetcher.data) return;
    handledResponseRef.current = fetcher.data;
    onOpenChange(false);
  }, [fetcher.data, isSaving, onOpenChange]);

  function handleSave() {
    const formData = new FormData();
    formData.set('intent', 'updatePromptDraft');
    formData.set('assignmentTypeId', assignmentTypeId);
    formData.set('promptVersionId', promptVersion.id);
    formData.set('systemMessageTemplate', systemMessage);
    formData.set('userMessageTemplate', userMessage);
    fetcher.submit(formData, {
      method: 'POST',
      action: '/api/domain/assignment-type-evaluations',
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        aria-describedby={undefined}
        className="flex max-h-screen w-full max-w-full flex-col overflow-y-auto sm:max-w-2xl"
      >
        <SheetHeader>
          <SheetTitle>Edit prompt {promptLabel}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="managed-system-message">
              System message template
            </Label>
            <Textarea
              id="managed-system-message"
              rows={10}
              value={systemMessage}
              onChange={(event) => setSystemMessage(event.target.value)}
              disabled={isSaving}
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="managed-user-message">User message template</Label>
            <Textarea
              id="managed-user-message"
              rows={16}
              value={userMessage}
              onChange={(event) => setUserMessage(event.target.value)}
              disabled={isSaving}
              className="font-mono text-sm"
            />
          </div>
          <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Available variables</p>
            <p className="mt-1 break-words font-mono">
              {
                '{{assignment_type}} · {{rubric}} · {{document}} · {{student_first_name}} · {{grading_instructions}} · {{score_instructions}} · {{strictness}}'
              }
            </p>
            <p className="mt-2">
              The user message must keep {'{{rubric}}'} and {'{{document}}'}.
            </p>
          </div>
          {errorMessage ? (
            <p className="text-sm text-destructive">{errorMessage}</p>
          ) : null}
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={
                isSaving || !systemMessage.trim() || !userMessage.trim()
              }
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save prompt'
              )}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function PromptVersionsOverview({
  assignmentTypeId,
  assignmentTypeTitle,
  evaluationHistory,
  promptLabels,
  onOpenPrompt,
}: {
  assignmentTypeId: string;
  assignmentTypeTitle?: string;
  evaluationHistory: AssignmentTypeEvaluationHistory;
  promptLabels: Map<string, string>;
  onOpenPrompt: (promptVersionId: string) => void;
}) {
  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <header className="shrink-0 px-3 py-5 md:px-6 md:py-6">
        <div className="mx-auto w-full max-w-3xl space-y-5">
          <Button variant="outline" size="sm" asChild>
            <Link to={`/app/admin/assignment-types/${assignmentTypeId}`}>
              <ArrowLeft className="mr-1.5 size-4" />
              Back to assignment type
            </Link>
          </Button>
          <div className="space-y-1">
            <h1 className="text-3xl font-semibold tracking-tight">
              Prompts
            </h1>
            {assignmentTypeTitle ? (
              <p className="text-sm text-muted-foreground">
                {assignmentTypeTitle}
              </p>
            ) : null}
          </div>
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto px-3 py-6 md:px-6">
        <div className="mx-auto w-full max-w-3xl">
          <div className="divide-y rounded-md border">
            {evaluationHistory.promptVersions.map((promptVersion) => (
              <button
                key={promptVersion.id}
                type="button"
                onClick={() => onOpenPrompt(promptVersion.id)}
                className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-muted/50"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="font-medium tabular-nums">
                    {promptLabels.get(promptVersion.id) ??
                      formatPromptDate(promptVersion.createdAt)}
                  </span>
                  <Badge
                    size="sm"
                    variant={promptStatusBadgeVariant(promptVersion.status)}
                  >
                    {promptStatusLabel(promptVersion.status)}
                  </Badge>
                </span>
                <ChevronRight
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              </button>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

export function EvaluationHistorySection({
  assignmentTypeId,
  evaluationHistory,
  isPromptPreviewStale,
  layout = 'embedded',
  assignmentTypeTitle,
  promptVersionControlEnabled = false,
  copySourceCatalog = [],
}: {
  assignmentTypeId: string;
  evaluationHistory: AssignmentTypeEvaluationHistory;
  isPromptPreviewStale: boolean;
  layout?: 'embedded' | 'page';
  assignmentTypeTitle?: string;
  promptVersionControlEnabled?: boolean;
  copySourceCatalog?: EvaluationCopySourceCatalog;
}) {
  const createDraftFetcher = useFetcher<PromptVersionFetcherData>();
  const promoteFetcher = useFetcher<PromptVersionFetcherData>();
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [selectedSuiteId, setSelectedSuiteId] = useState<string | null>(null);
  const [editPromptOpen, setEditPromptOpen] = useState(false);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const latestSuite = evaluationHistory.suiteVersions[0] ?? null;
  const previousLatestSuiteIdRef = useRef<string | null>(
    latestSuite?.id ?? null
  );
  const managed =
    promptVersionControlEnabled &&
    layout === 'page' &&
    evaluationHistory.promptVersions.length > 0;
  const promptLabels = useMemo(
    () => computePromptVersionLabels(evaluationHistory.promptVersions),
    [evaluationHistory.promptVersions]
  );

  useEffect(() => {
    const createdPromptId = createDraftFetcher.data?.promptVersionId;
    if (createDraftFetcher.data?.success && createdPromptId) {
      setSelectedPromptId(createdPromptId);
      setSelectedSuiteId(latestSuite?.id ?? null);
    }
  }, [
    createDraftFetcher.data,
    evaluationHistory.promptVersions,
    latestSuite?.id,
  ]);

  useEffect(() => {
    const latestSuiteId = latestSuite?.id ?? null;
    if (
      !selectedSuiteId ||
      previousLatestSuiteIdRef.current !== latestSuiteId
    ) {
      setSelectedSuiteId(latestSuiteId);
    }
    previousLatestSuiteIdRef.current = latestSuiteId;
  }, [latestSuite?.id, selectedSuiteId]);

  useEffect(() => {
    if (promoteFetcher.data?.success === false) setPromoteOpen(true);
  }, [promoteFetcher.data]);

  if (!managed) {
    return (
      <EvaluationMatrixSection
        assignmentTypeId={assignmentTypeId}
        assignmentTypeTitle={assignmentTypeTitle}
        evaluationHistory={evaluationHistory}
        isPromptPreviewStale={isPromptPreviewStale}
        layout={layout}
        copySourceCatalog={copySourceCatalog}
      />
    );
  }

  const selectedPrompt =
    evaluationHistory.promptVersions.find(
      (promptVersion) => promptVersion.id === selectedPromptId
    ) ?? null;
  const selectedSuite =
    evaluationHistory.suiteVersions.find(
      (suiteVersion) => suiteVersion.id === selectedSuiteId
    ) ?? latestSuite;

  if (!selectedPrompt || !selectedSuite) {
    return (
      <PromptVersionsOverview
        assignmentTypeId={assignmentTypeId}
        assignmentTypeTitle={assignmentTypeTitle}
        evaluationHistory={evaluationHistory}
        promptLabels={promptLabels}
        onOpenPrompt={(promptVersionId) => {
          setSelectedPromptId(promptVersionId);
          setSelectedSuiteId(latestSuite?.id ?? null);
        }}
      />
    );
  }

  const selectedRuns = evaluationHistory.runs.filter(
    (run) =>
      (run.promptVersionId === selectedPrompt.id &&
        run.promptRevision === selectedPrompt.revision &&
        run.evaluationSuiteVersionId === selectedSuite.id) ||
      (run.promptVersionId === null &&
        run.evaluationSuiteVersionId === null &&
        run.promptVersion === selectedPrompt.version &&
        selectedSuite.version ===
          Math.min(
            ...evaluationHistory.suiteVersions.map(
              (suiteVersion) => suiteVersion.version
            )
          ))
  );
  const selectedHistory: AssignmentTypeEvaluationHistory = {
    ...evaluationHistory,
    evaluations: selectedSuite.evaluations,
    cases: selectedSuite.cases,
    runs: selectedRuns,
  };
  const selectedPromptVersionId = selectedPrompt.id;
  const selectedPromptLabel =
    promptLabels.get(selectedPrompt.id) ?? `v${selectedPrompt.version}`;
  const isLatestSuite = selectedSuite.id === latestSuite?.id;
  const hasPromotionRun =
    selectedPrompt.status === 'draft' &&
    isLatestSuite &&
    selectedRuns.some((run) => run.status === 'completed');
  const createError =
    createDraftFetcher.data?.success === false
      ? createDraftFetcher.data.message
      : null;
  const promoteError =
    promoteFetcher.data?.success === false ? promoteFetcher.data.message : null;

  function createDraft() {
    const formData = new FormData();
    formData.set('intent', 'createPromptDraft');
    formData.set('assignmentTypeId', assignmentTypeId);
    formData.set('sourcePromptVersionId', selectedPromptVersionId);
    createDraftFetcher.submit(formData, {
      method: 'POST',
      action: '/api/domain/assignment-type-evaluations',
    });
  }

  function promoteDraft() {
    const formData = new FormData();
    formData.set('intent', 'promotePromptDraft');
    formData.set('assignmentTypeId', assignmentTypeId);
    formData.set('promptVersionId', selectedPromptVersionId);
    promoteFetcher.submit(formData, {
      method: 'POST',
      action: '/api/domain/assignment-type-evaluations',
    });
  }

  const suiteSelector = (
    <Select
      value={selectedSuite.id}
      onValueChange={(value) => setSelectedSuiteId(value)}
    >
      <SelectTrigger className="h-9 w-[8.5rem]" aria-label="Evaluation suite">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {evaluationHistory.suiteVersions.map((suiteVersion) => (
          <SelectItem key={suiteVersion.id} value={suiteVersion.id}>
            Suite v{suiteVersion.version}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const promptActions = (
    <>
      {suiteSelector}
      {selectedPrompt.status === 'draft' ? (
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setEditPromptOpen(true)}
          >
            <Pencil className="mr-1.5 size-4" />
            Edit prompt
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPromoteOpen(true)}
            disabled={!hasPromotionRun || promoteFetcher.state !== 'idle'}
          >
            <Check className="mr-1.5 size-4" />
            Promote to production
          </Button>
        </>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={createDraft}
          disabled={createDraftFetcher.state !== 'idle'}
        >
          {createDraftFetcher.state !== 'idle' ? (
            <Loader2 className="mr-1.5 size-4 animate-spin" />
          ) : (
            <Copy className="mr-1.5 size-4" />
          )}
          Create draft
        </Button>
      )}
      {createError || promoteError ? (
        <p className="text-sm text-destructive">
          {createError ?? promoteError}
        </p>
      ) : null}
    </>
  );

  return (
    <>
      <EvaluationMatrixSection
        key={`${selectedPrompt.id}:${selectedPrompt.revision}:${selectedSuite.id}`}
        assignmentTypeId={assignmentTypeId}
        assignmentTypeTitle={assignmentTypeTitle}
        evaluationHistory={selectedHistory}
        isPromptPreviewStale={false}
        layout={layout}
        promptVersionId={selectedPrompt.id}
        evaluationSuiteVersionId={selectedSuite.id}
        allowEvaluationChanges={isLatestSuite}
        copySourceCatalog={copySourceCatalog}
        pageTitle={`Prompt ${selectedPromptLabel}`}
        pageBackControl={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSelectedPromptId(null)}
          >
            <ArrowLeft className="mr-1.5 size-4" />
            Back to prompt versions
          </Button>
        }
        pageMeta={
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>{assignmentTypeTitle}</span>
            <Badge
              size="sm"
              variant={promptStatusBadgeVariant(selectedPrompt.status)}
            >
              {promptStatusLabel(selectedPrompt.status)}
            </Badge>
          </div>
        }
        toolbarLeading={promptActions}
        emptyRunMessage="No runs for this prompt and evaluation suite yet."
      />

      {selectedPrompt.status === 'draft' ? (
        <PromptVersionEditorSheet
          assignmentTypeId={assignmentTypeId}
          promptVersion={selectedPrompt}
          promptLabel={selectedPromptLabel}
          open={editPromptOpen}
          onOpenChange={setEditPromptOpen}
        />
      ) : null}

      <AlertDialog open={promoteOpen} onOpenChange={setPromoteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Promote prompt {selectedPromptLabel}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This prompt will replace the current production prompt used by the
              grading assistant. Its saved run history will remain.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {promoteError ? (
            <p className="text-sm text-destructive">{promoteError}</p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={promoteDraft}>
              Promote
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function PromptConfigEditor({
  initial,
  assignmentTypeId,
  currentPromptLabel,
}: {
  initial: PromptConfigData;
  namePrefix?: string;
  onChange?: (config: PromptConfigData) => void;
  gradingAssistantPromptPreview?: GradingAssistantPromptPreview;
  gradingAssistantPromptPreviewUnavailableReason?: string;
  isPromptPreviewStale?: boolean;
  assignmentTypeId?: string | null;
  currentPromptLabel?: string | null;
  title?: string;
  scoringScale?: ScoringScaleData;
  rubric?: RubricData;
}) {
  return (
    <div className="space-y-3">
      {assignmentTypeId ? (
        <>
          <p className="text-sm text-muted-foreground text-pretty">
            Prompt configuration and tests are managed with this assignment
            type&apos;s prompt.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" asChild>
              <Link
                to={`/app/admin/assignment-types/${assignmentTypeId}/prompt`}
                className="w-fit"
              >
                <FlaskConical className="mr-1.5 size-4 shrink-0" />
                Prompt
              </Link>
            </Button>
            {currentPromptLabel ? (
              <span className="text-sm text-muted-foreground">
                Production prompt: {currentPromptLabel}
              </span>
            ) : null}
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground text-pretty">
          Prompt setup and evaluation testing are available after this
          assignment type is created.
        </p>
      )}

      <input
        type="hidden"
        name="promptConfigJson"
        value={JSON.stringify(serializePromptConfig(initial))}
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
  if (cfg.systemMessageTemplate?.trim()) {
    result.systemMessageTemplate = cfg.systemMessageTemplate;
  }
  if (cfg.userMessageTemplate?.trim()) {
    result.userMessageTemplate = cfg.userMessageTemplate;
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
