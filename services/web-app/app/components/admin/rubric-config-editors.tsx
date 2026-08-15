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
import { Button } from '~/components/ui/button';
import { Card, CardContent } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Switch } from '~/components/ui/switch';
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
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SHEET_SCROLL_BODY_CLASS_NAME,
  SHEET_STICKY_FOOTER_CLASS_NAME,
} from '~/components/ui/sheet';
import { UnsavedChangesDialog } from '~/components/unsaved-changes-dialog';
import { useUnsavedChangesGuard } from '~/hooks/useUnsavedChangesGuard';
import { cn } from '~/utils/misc';
import {
  DEFAULT_SCORING_SCALE,
  type PromptConfigData,
  type RubricCategory,
  type RubricData,
  type ScoringScaleData,
} from '~/domain/assignment-types/assignment-type-rubric.shared';
import { resolveGrammarHighlightingEnabled } from '~/domain/assignment-types/rubric-category-options';
import {
  DEFAULT_SCORE_STEP,
  buildScoreScaleValues,
  buildStepOptions,
  describeScoreScale,
  validateScoreScale,
} from '~/domain/assignment-types/score-scale-steps';

/** SheetContent override that lets the footer pin to the bottom while the
 * body scrolls — pairs with SHEET_SCROLL_BODY_CLASS_NAME / SHEET_STICKY_FOOTER_CLASS_NAME.
 * Mirrors ASSIGNMENT_SUMMARY_SHEET_CONTENT_CLASS_NAME. */
const PINNED_FOOTER_SHEET_CONTENT_CLASS_NAME =
  'flex h-full w-full flex-col gap-0 overflow-hidden p-0';

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
    ...(category.scoreLabels ? { scoreLabels: category.scoreLabels } : {}),
    ...(category.feedbackEnabled === undefined
      ? {}
      : { feedbackEnabled: category.feedbackEnabled }),
    ...(category.grammarHighlighting === undefined
      ? {}
      : { grammarHighlighting: category.grammarHighlighting }),
  };
}

function rowsFromCategories(categories: RubricCategory[]): RubricCategoryRow[] {
  return categories.map((category) => createRubricCategoryRow(category));
}

function pct(weight: number) {
  return Math.round(weight * 100);
}

/**
 * Serializes one category for storage. The optional per-category settings are
 * omitted entirely when unset, so a rubric that never touched them round-trips
 * byte-identically to how it was stored.
 */
function serializeCategory(category: RubricCategory): RubricCategory {
  const scoreLabels = category.scoreLabels?.filter((entry) =>
    entry.label.trim()
  );
  return {
    key: labelToKey(category.label) || category.key,
    label: category.label,
    weight: category.weight,
    description: category.description,
    ...(scoreLabels?.length
      ? {
          scoreLabels: scoreLabels.map((entry) => ({
            value: entry.value,
            label: entry.label.trim(),
          })),
        }
      : {}),
    ...(category.feedbackEnabled === undefined
      ? {}
      : { feedbackEnabled: category.feedbackEnabled }),
    ...(category.grammarHighlighting === undefined
      ? {}
      : { grammarHighlighting: category.grammarHighlighting }),
  };
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
  const stepOptions = buildStepOptions(scale);
  /**
   * Changing min or max can strip the configured step of its meaning — 10 is
   * fine over 0-30 and impossible over 0-6. Rather than leave an unreachable
   * max configured, the scale falls back to every value until the teacher
   * picks a step the new range supports.
   */
  const effectiveStep = stepOptions.includes(scale.step ?? DEFAULT_SCORE_STEP)
    ? (scale.step ?? DEFAULT_SCORE_STEP)
    : DEFAULT_SCORE_STEP;
  const scoreScaleDescription = describeScoreScale({
    ...scale,
    step: effectiveStep,
  });
  const scoreScaleError = validateScoreScale({
    ...scale,
    step: effectiveStep,
  });

  useEffect(() => {
    if ((scale.step ?? DEFAULT_SCORE_STEP) !== effectiveStep) {
      setScale((s) => ({ ...s, step: effectiveStep }));
    }
    // Only the mismatch matters; setScale is stable enough for this guard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveStep, scale.step]);

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

      {/* Three short numbers that describe one scale, so they read as one
          row rather than three stacked fields the width of the sheet. */}
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-24 space-y-1.5">
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
          <div className="w-24 space-y-1.5">
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
          <div className="w-24 space-y-1.5">
            <Label htmlFor={`${namePrefix}scoreStep`}>Step</Label>
            {/* A select rather than a number input: only steps that divide the
                range evenly can reach the max, so the invalid ones should be
                unpickable rather than typeable-then-rejected. */}
            <Select
              value={String(effectiveStep)}
              onValueChange={(v) => {
                // Radix reports an empty value when it clears a selection whose
                // option list no longer holds it, and Number('') is 0. Ignoring
                // that is what keeps an imported step from being wiped in the
                // render before its range arrives.
                const next = Number(v);
                if (!Number.isFinite(next) || next < 1) return;
                setScale((s) => ({ ...s, step: next }));
              }}
            >
              <SelectTrigger
                id={`${namePrefix}scoreStep`}
                data-testid="rubric-score-step"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {stepOptions.map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Scores go up in steps of this size. {scoreScaleDescription}
        </p>
        {scoreScaleError ? (
          <p
            className="text-sm text-destructive"
            data-testid="rubric-score-step-error"
          >
            {scoreScaleError}
          </p>
        ) : null}
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
        <SheetContent
          aria-describedby={undefined}
          className={PINNED_FOOTER_SHEET_CONTENT_CLASS_NAME}
        >
          <div className="p-6 pb-0">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <ClipboardPaste className="size-4 shrink-0" />
                Paste rubric
              </SheetTitle>
            </SheetHeader>
          </div>
          <div className={cn(SHEET_SCROLL_BODY_CLASS_NAME, 'space-y-4 p-6')}>
            <Textarea
              id="rubric-import-text"
              rows={12}
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
              placeholder="Paste rubric categories, weights, and descriptions..."
              disabled={isExtracting}
            />
          </div>
          <SheetFooter className={SHEET_STICKY_FOOTER_CLASS_NAME}>
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
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet open={pdfOpen} onOpenChange={setPdfOpen}>
        <SheetContent
          aria-describedby={undefined}
          className={PINNED_FOOTER_SHEET_CONTENT_CLASS_NAME}
        >
          <div className="p-6 pb-0">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <FileUp className="size-4 shrink-0" />
                Upload PDF
              </SheetTitle>
            </SheetHeader>
          </div>
          <div className={cn(SHEET_SCROLL_BODY_CLASS_NAME, 'space-y-4 p-6')}>
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
          </div>
          <SheetFooter className={SHEET_STICKY_FOOTER_CLASS_NAME}>
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
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet open={copyOpen} onOpenChange={setCopyOpen}>
        <SheetContent
          aria-describedby={undefined}
          className={PINNED_FOOTER_SHEET_CONTENT_CLASS_NAME}
        >
          <div className="p-6 pb-0">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <Copy className="size-4 shrink-0" />
                Copy rubric from
              </SheetTitle>
            </SheetHeader>
          </div>
          <div className={cn(SHEET_SCROLL_BODY_CLASS_NAME, 'space-y-4 p-6')}>
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
              </>
            )}
          </div>
          {!isLoadingSources && !copyLoadError && copySources.length > 0 ? (
            <SheetFooter className={SHEET_STICKY_FOOTER_CLASS_NAME}>
              <Button
                type="button"
                className="w-full"
                onClick={handleCopyRubric}
                disabled={!selectedSource}
              >
                Copy rubric
              </Button>
            </SheetFooter>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}

/**
 * True when the draft has diverged from the last-saved category. Drives the
 * unsaved-changes guard — compares every field `onSave` would persist, so a
 * change to score labels alone (no other field touched) still counts.
 */
function categoryDraftIsDirty(
  saved: RubricCategoryRow,
  draft: RubricCategoryRow
) {
  return (
    saved.label !== draft.label ||
    saved.weight !== draft.weight ||
    saved.description !== draft.description ||
    saved.feedbackEnabled !== draft.feedbackEnabled ||
    saved.grammarHighlighting !== draft.grammarHighlighting ||
    JSON.stringify(saved.scoreLabels ?? []) !==
      JSON.stringify(draft.scoreLabels ?? [])
  );
}

/**
 * The category editor's body, split out from the `<Sheet>`/`<SheetContent>`
 * Radix wrapper so it can render (and be tested) without the Dialog portal.
 * Mirrors `AssignmentSummarySheetContent`.
 */
export function CategoryEditSheetContent({
  category,
  minScore,
  maxScore,
  step,
  onSave,
  onRemove,
  onDirtyChange,
  renderSheet = true,
}: {
  category: RubricCategoryRow;
  minScore: number;
  maxScore: number;
  step?: number;
  onSave: (patch: Partial<RubricCategory>) => void;
  onRemove: () => void;
  /** Reports live dirty state up so the wrapper's close guard stays in sync. */
  onDirtyChange?: (isDirty: boolean) => void;
  renderSheet?: boolean;
}) {
  const [draft, setDraft] = useState<RubricCategoryRow>(category);

  useEffect(() => {
    setDraft(category);
  }, [category]);

  const isDirty = categoryDraftIsDirty(category, draft);
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const scoreValues = buildScoreScaleValues({ minScore, maxScore, step });

  function setScoreLabel(value: number, label: string) {
    setDraft((current) => {
      const rest = (current.scoreLabels ?? []).filter(
        (entry) => entry.value !== value
      );
      const next = label.trim()
        ? [...rest, { value, label }].sort((a, b) => a.value - b.value)
        : rest;
      return { ...current, scoreLabels: next };
    });
  }

  function currentScoreLabel(value: number) {
    return draft.scoreLabels?.find((entry) => entry.value === value)?.label ?? '';
  }

  function handleRemove() {
    onRemove();
  }

  function handleDone() {
    onSave({
      label: draft.label,
      weight: draft.weight,
      description: draft.description,
      scoreLabels: draft.scoreLabels,
      feedbackEnabled: draft.feedbackEnabled,
      grammarHighlighting: draft.grammarHighlighting,
    });
  }

  const header = renderSheet ? (
    <SheetHeader>
      <SheetTitle>Edit category</SheetTitle>
    </SheetHeader>
  ) : (
    <div>
      <h2>Edit category</h2>
    </div>
  );

  return (
    <>
      <div className="px-6 pt-6">{header}</div>
      <div className={cn(SHEET_SCROLL_BODY_CLASS_NAME, 'space-y-4 px-6 py-4')}>
        <div className="space-y-2">
          <Label htmlFor="category-edit-label">Label</Label>
          <Input
            id="category-edit-label"
            value={draft.label}
            placeholder="e.g. Thesis & Content"
            onChange={(event) =>
              setDraft((current) => ({ ...current, label: event.target.value }))
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
              setDraft((current) => ({
                ...current,
                weight: Number(event.target.value) / 100,
              }))
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
              setDraft((current) => ({
                ...current,
                description: event.target.value,
              }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label>Score labels</Label>
          <p className="text-sm text-muted-foreground text-pretty">
            The word shown for each score in this category. Leave a score blank
            to keep the shared label.
          </p>
          <div className="space-y-2">
            {scoreValues.map((value) => (
              <div key={value} className="flex items-center gap-2">
                <span className="w-6 shrink-0 tabular-nums text-sm text-muted-foreground">
                  {value}
                </span>
                <Input
                  id={`category-edit-score-label-${value}`}
                  aria-label={`Score ${value} label`}
                  value={currentScoreLabel(value)}
                  placeholder="e.g. Proficient"
                  onChange={(event) => setScoreLabel(value, event.target.value)}
                />
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Label htmlFor="category-edit-feedback-enabled">
              Category feedback
            </Label>
            <p className="mt-1 text-sm text-muted-foreground text-pretty">
              Give this category its own feedback box on the grading panel.
            </p>
          </div>
          <Switch
            id="category-edit-feedback-enabled"
            checked={draft.feedbackEnabled !== false}
            onCheckedChange={(checked) =>
              setDraft((current) => ({ ...current, feedbackEnabled: checked }))
            }
          />
        </div>
      </div>
      <SheetFooter
        className={cn(
          SHEET_STICKY_FOOTER_CLASS_NAME,
          'flex-row items-center justify-between sm:justify-between'
        )}
      >
        <Button type="button" variant="destructive-outline" onClick={handleRemove}>
          <Trash2 className="mr-2 size-4 shrink-0" />
          Remove category
        </Button>
        <Button type="button" onClick={handleDone}>
          Done
        </Button>
      </SheetFooter>
    </>
  );
}

function CategoryEditSheet({
  category,
  minScore,
  maxScore,
  step,
  open,
  onOpenChange,
  onSave,
  onRemove,
}: {
  category: RubricCategoryRow | null;
  minScore: number;
  maxScore: number;
  step?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (patch: Partial<RubricCategory>) => void;
  onRemove: () => void;
}) {
  const [isDirty, setIsDirty] = useState(false);
  const { guardOpen, requestClose, confirmDiscard, cancelDiscard } =
    useUnsavedChangesGuard({
      isDirty,
      onClose: () => onOpenChange(false),
    });

  // A freshly opened (or swapped) category starts clean; the guard only
  // matters once the draft it renders has actually changed something.
  useEffect(() => {
    setIsDirty(false);
  }, [category?.id]);

  if (!category) return null;

  return (
    <>
      {/* Non-modal on purpose: the assignment-type form behind this sheet has
          to stay usable, and saving with the sheet still open must keep the
          in-flight category (see the creator e2e spec). The overlay therefore
          dims without swallowing clicks. */}
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next) requestClose();
        }}
        modal={false}
      >
        {/* Clicking the dimmed page is how most people dismiss a sheet, so it
            routes through the same guard as Escape and the X rather than being
            swallowed — which read as the sheet being stuck. */}
        <SheetContent
          includeOverlay={false}
          dimBehind
          aria-describedby={undefined}
          className={PINNED_FOOTER_SHEET_CONTENT_CLASS_NAME}
          onInteractOutside={(event) => {
            event.preventDefault();
            requestClose();
          }}
        >
          <CategoryEditSheetContent
            category={category}
            minScore={minScore}
            maxScore={maxScore}
            step={step}
            onDirtyChange={setIsDirty}
            onSave={(patch) => {
              onSave(patch);
              onOpenChange(false);
            }}
            onRemove={() => {
              onRemove();
              onOpenChange(false);
            }}
          />
        </SheetContent>
      </Sheet>
      <UnsavedChangesDialog
        open={guardOpen}
        onContinueEditing={cancelDiscard}
        onDiscard={confirmDiscard}
      />
    </>
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
  minScore = DEFAULT_SCORING_SCALE.minScore,
  maxScore = DEFAULT_SCORING_SCALE.maxScore,
  step = DEFAULT_SCORE_STEP,
}: {
  initial?: RubricData;
  categories?: RubricCategoryRow[];
  onCategoriesChange?: (categories: RubricCategoryRow[]) => void;
  namePrefix?: string;
  /** Score range the per-category score labels are collected for. */
  minScore?: number;
  maxScore?: number;
  /** Gap between the score-label rows; 1 collects a label for every value. */
  step?: number;
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

      {/* Grammar highlighting marks the essay as a whole rather than any one
          category, so it is set once for the rubric. It is still written onto
          every category, which is where every reader of it already looks. */}
      <div className="flex items-start justify-between gap-3 border-t pt-4">
        <div className="min-w-0">
          <Label htmlFor={`${namePrefix}rubric-grammar-highlighting`}>
            Grammar highlighting
          </Label>
          <p className="mt-1 text-sm text-muted-foreground text-pretty">
            Produce grammar and syntax highlights on the student's essay. This
            applies to the whole rubric, not one category.
          </p>
        </div>
        <Switch
          id={`${namePrefix}rubric-grammar-highlighting`}
          data-testid="rubric-grammar-highlighting"
          checked={resolveGrammarHighlightingEnabled(cats)}
          onCheckedChange={(checked) =>
            setCats((current) =>
              current.map((category) => ({
                ...category,
                grammarHighlighting: checked,
              }))
            )
          }
        />
      </div>

      <CategoryEditSheet
        category={editingCategory}
        minScore={minScore}
        maxScore={maxScore}
        step={step}
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
        value={JSON.stringify({
          categories: cats.map(({ id: _id, ...category }) =>
            serializeCategory(category)
          ),
        })}
      />
    </div>
  );
}

function categoriesToRubric(categories: RubricCategoryRow[]): RubricData {
  return {
    categories: categories.map(({ id: _id, ...category }) =>
      serializeCategory(category)
    ),
  };
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
        minScore={scoringScale.minScore}
        maxScore={scoringScale.maxScore}
        step={scoringScale.step}
      />
    </div>
  );
}

export function PromptConfigEditor({
  initial,
  namePrefix = '',
  onChange,
}: {
  initial: PromptConfigData;
  namePrefix?: string;
  onChange?: (config: PromptConfigData) => void;
}) {
  const [cfg, setCfg] = useState<PromptConfigData>(initial);
  const usesBuiltInPreset = Boolean(cfg.instructionsPreset?.trim());

  function updateCfg(next: PromptConfigData) {
    setCfg(next);
    onChange?.(next);
  }

  return (
    <div className="space-y-3">
      {usesBuiltInPreset && (
        <p className="text-sm text-muted-foreground text-pretty">
          This grading assistant uses built-in instructions. Add custom
          instructions below to override them.
        </p>
      )}
      <div className="space-y-1.5">
        <Textarea
          id={`${namePrefix}gradingInstr`}
          rows={8}
          value={cfg.gradingInstructions ?? ''}
          placeholder="Tell the AI how to grade this assignment. Include scoring rules, tone, and how to interpret each rubric category."
          onChange={(e) =>
            updateCfg({ ...cfg, gradingInstructions: e.target.value })
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
    categories: rubric.categories.map((category) =>
      serializeCategory({
        ...category,
        label: category.label.trim(),
        description: category.description.trim(),
      })
    ),
  });
}

export function scoringScaleSnapshot(scale: ScoringScaleData) {
  return JSON.stringify(scale);
}
