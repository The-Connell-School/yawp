import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFetcher } from 'react-router';
import { Button } from '~/components/ui/button';
import { Badge } from '~/components/ui/badge';
import { Label } from '~/components/ui/label';
import { Input } from '~/components/ui/input';
import { Textarea } from '~/components/ui/textarea';
import { ConfirmationDialog } from '~/components/confirmation-dialog';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '~/components/ui/accordion';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '~/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import {
  buildEmptyRubricScores,
  buildScoreOptions,
  legacyRubricDisplayConfig,
  normalizeRubricDisplayConfig,
  normalizeRubricScoresForCategories,
  type RubricDisplayConfig,
  type RubricScore,
} from '~/domain/grading/rubric-display';
import {
  computeWeightedPercentageForCategories,
  formatGrade,
  letterFromPercent,
} from '~/domain/grading/gradeMath';
import {
  type GrammarIssue,
  parseGrammarIssuesPayload,
} from '~/domain/grading/grammarIssues';
import {
  DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL,
  getGradingAssistantStrictnessLabel,
  gradingAssistantStrictnessOptions,
  parseGradingAssistantStrictnessLevel,
  type GradingAssistantStrictnessLevel,
} from '~/domain/grading/grading-assistant-strictness';
import { Loader2, TrendingUp } from 'lucide-react';
import { cn } from '~/utils/misc';
import { useUpdateSubmission } from './use-update-submission';
import { hasGradingDraftToReplace } from './has-grading-draft-to-replace';
import { buildGradingFormSnapshot } from './grading-form-snapshot';

function normalizePercentage(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function formatExcerpt(excerpt: string, maxChars = 90) {
  const text = excerpt.trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1)).trimEnd()}...`;
}

export type SavedGradeSnapshot = {
  numericPercentage: number | null;
  letterGrade: string | null;
  score: string | null;
  overallComment: string | null;
  rubricScores: unknown;
};

export type TeacherGradingPanelHeaderState = {
  gradeDisplay: string;
  gradeBadgeClassName: string;
  hasUnsavedChanges: boolean;
  hasDraftToReplace: boolean;
  hasNumericPercentage: boolean;
  isGenerating: boolean;
  isBusy: boolean;
  isSavingDraft: boolean;
  gradingAssistantStrictnessLevel: GradingAssistantStrictnessLevel;
  gradingAssistantStrictnessLabel: string;
  setGradingAssistantStrictnessLevel: (
    level: GradingAssistantStrictnessLevel
  ) => void;
  generateAiSuggestions: () => void;
  generateAiSuggestionsAtLevel: (
    level: GradingAssistantStrictnessLevel
  ) => void;
  saveDraft: () => Promise<void>;
  discardDraft: () => void;
  getSavedGradeSnapshot: () => SavedGradeSnapshot;
};

export function TeacherGradingPanel({
  documentId,
  submissionId,
  existingGrade,
  grammarIssues,
  hiddenGrammarIssueIds: _hiddenGrammarIssueIds,
  onToggleGrammarIssue: _onToggleGrammarIssue,
  onRemoveGrammarIssue,
  onGrammarIssuesChange,
  onAiGradingComplete,
  rubricConfig,
  initialGradingAssistantStrictnessLevel,
  hideHeader = false,
  onHeaderStateChange,
}: {
  documentId: string;
  submissionId: string | null;
  existingGrade:
    | {
        id: string;
        score: string | null;
        feedback: string | null;
        rubricScores?: unknown | null;
        overallComment?: string | null;
        numericPercentage?: number | null;
        letterGrade?: string | null;
        releasedAt?: Date | string | null;
      }
    | null
    | undefined;
  grammarIssues: GrammarIssue[];
  hiddenGrammarIssueIds: string[];
  onToggleGrammarIssue: (id: string) => void;
  onRemoveGrammarIssue: (id: string) => void;
  onGrammarIssuesChange: (issues: GrammarIssue[]) => void;
  onAiGradingComplete?: (payload: {
    numericPercentage: number | null;
    letterGrade: string | null;
    score: string | null;
    overallComment: string | null;
    rubricScores: unknown;
    rubricConfig?: RubricDisplayConfig | null;
  }) => void;
  rubricConfig?: RubricDisplayConfig | null;
  initialGradingAssistantStrictnessLevel?: string | null;
  hideHeader?: boolean;
  onHeaderStateChange?: (state: TeacherGradingPanelHeaderState) => void;
}) {
  const aiFetcher = useFetcher();
  const targetSubmissionId = existingGrade?.id ?? submissionId;
  const { save: autoSave, status: autoSaveStatus } = useUpdateSubmission(
    targetSubmissionId ?? ''
  );
  const propRubricConfig = useMemo(
    () => normalizeRubricDisplayConfig(rubricConfig),
    [rubricConfig]
  );
  const [activeRubricConfig, setActiveRubricConfig] =
    useState<RubricDisplayConfig>(propRubricConfig);
  const [rubricScores, setRubricScores] = useState<Record<string, RubricScore>>(
    buildEmptyRubricScores(propRubricConfig.categories)
  );
  const [overallComment, setOverallComment] = useState('');
  const [numericPercentage, setNumericPercentage] = useState('');
  const [hasManualPercentOverride, setHasManualPercentOverride] =
    useState(false);
  const lastInitializationKeyRef = useRef<string | null>(null);
  const lastStrictnessInitializationKeyRef = useRef<string | null>(null);
  const [gradingAssistantStrictnessLevel, setGradingAssistantStrictnessLevel] =
    useState<GradingAssistantStrictnessLevel>(
      parseGradingAssistantStrictnessLevel(
        initialGradingAssistantStrictnessLevel
      ) ?? DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL
    );
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const scoreOptions = useMemo(
    () =>
      buildScoreOptions(
        activeRubricConfig.minScore,
        activeRubricConfig.maxScore
      ),
    [activeRubricConfig.maxScore, activeRubricConfig.minScore]
  );

  const computedNumericPercentage = useMemo(() => {
    if (activeRubricConfig.scoringType !== 'weighted_1_5') return null;
    return computeWeightedPercentageForCategories(
      rubricScores as unknown as Record<string, unknown>,
      activeRubricConfig.categories
    );
  }, [activeRubricConfig, rubricScores]);

  const resolvedNumericPercentage = useMemo(() => {
    if (numericPercentage === '') return null;
    const raw = Number(numericPercentage);
    if (!Number.isFinite(raw)) return null;
    const clamped = Math.max(0, Math.min(100, Math.round(raw)));
    return clamped;
  }, [numericPercentage]);

  const gradeDisplay = useMemo(() => {
    return (
      formatGrade(
        resolvedNumericPercentage,
        resolvedNumericPercentage === null
          ? null
          : letterFromPercent(resolvedNumericPercentage)
      ) ||
      existingGrade?.score ||
      '—'
    );
  }, [existingGrade?.score, resolvedNumericPercentage]);
  const gradingAssistantStrictnessLabel = useMemo(
    () => getGradingAssistantStrictnessLabel(gradingAssistantStrictnessLevel),
    [gradingAssistantStrictnessLevel]
  );
  const gradeBadgeClassName =
    'border-purple-300 bg-purple-100 text-purple-800 hover:!bg-purple-100 hover:!text-purple-800 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-200 dark:hover:!bg-purple-950/40 dark:hover:!text-purple-200';
  const isGenerating = aiFetcher.state !== 'idle';
  const isBusy = isGenerating || autoSaveStatus === 'saving';

  const hasDraftToReplace = useMemo(
    () =>
      hasGradingDraftToReplace(
        rubricScores,
        overallComment,
        numericPercentage,
        grammarIssues.length
      ),
    [rubricScores, overallComment, numericPercentage, grammarIssues.length]
  );

  const currentSnapshot = useMemo(
    () =>
      buildGradingFormSnapshot({
        rubricScores,
        overallComment,
        numericPercentage,
        grammarIssues,
      }),
    [grammarIssues, numericPercentage, overallComment, rubricScores]
  );

  const hasUnsavedChanges =
    savedSnapshot !== null && currentSnapshot !== savedSnapshot;

  const onAiGradingCompleteRef = useRef(onAiGradingComplete);
  onAiGradingCompleteRef.current = onAiGradingComplete;

  const initializationKey = useMemo(
    () =>
      JSON.stringify({
        submissionId,
        existingGrade: existingGrade
          ? {
              id: existingGrade.id,
              score: existingGrade.score,
              feedback: existingGrade.feedback,
              rubricScores: existingGrade.rubricScores,
              overallComment: existingGrade.overallComment,
              numericPercentage: existingGrade.numericPercentage,
              letterGrade: existingGrade.letterGrade,
            }
          : null,
        rubricConfig: propRubricConfig,
        initialGradingAssistantStrictnessLevel,
      }),
    [
      existingGrade,
      initialGradingAssistantStrictnessLevel,
      propRubricConfig,
      submissionId,
    ]
  );
  const strictnessInitializationKey = `${submissionId ?? documentId}:${
    initialGradingAssistantStrictnessLevel ?? ''
  }`;

  useEffect(() => {
    if (lastInitializationKeyRef.current === initializationKey) return;
    lastInitializationKeyRef.current = initializationKey;

    let initialOverallComment = '';
    let initialNumericPercentage = '';
    let initialRubricScores = buildEmptyRubricScores(
      propRubricConfig.categories
    );

    setActiveRubricConfig(propRubricConfig);
    setHasManualPercentOverride(false);

    if (existingGrade) {
      initialOverallComment =
        existingGrade.overallComment || existingGrade.feedback || '';
      const initialNormalizedPercent = normalizePercentage(
        existingGrade.numericPercentage
      );
      if (initialNormalizedPercent !== null) {
        initialNumericPercentage = initialNormalizedPercent.toString();
        setHasManualPercentOverride(true);
      }
      initialRubricScores = normalizeRubricScoresForCategories({
        raw: existingGrade.rubricScores,
        categories: propRubricConfig.categories,
        minScore: propRubricConfig.minScore,
        maxScore: propRubricConfig.maxScore,
      });
    }

    setOverallComment(initialOverallComment);
    setNumericPercentage(initialNumericPercentage);
    setRubricScores(initialRubricScores);
    setSavedSnapshot(
      buildGradingFormSnapshot({
        rubricScores: initialRubricScores,
        overallComment: initialOverallComment,
        numericPercentage: initialNumericPercentage,
        grammarIssues,
      })
    );
  }, [existingGrade, grammarIssues, initializationKey, propRubricConfig]);

  useEffect(() => {
    if (
      lastStrictnessInitializationKeyRef.current === strictnessInitializationKey
    ) {
      return;
    }
    lastStrictnessInitializationKeyRef.current = strictnessInitializationKey;
    setGradingAssistantStrictnessLevel(
      parseGradingAssistantStrictnessLevel(
        initialGradingAssistantStrictnessLevel
      ) ?? DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL
    );
  }, [initialGradingAssistantStrictnessLevel, strictnessInitializationKey]);

  useEffect(() => {
    if (!hasManualPercentOverride && computedNumericPercentage !== null) {
      setNumericPercentage(computedNumericPercentage.toString());
    }
  }, [computedNumericPercentage, hasManualPercentOverride]);

  useEffect(() => {
    if (aiFetcher.state !== 'idle') return;

    if (!aiFetcher.data?.success) {
      return;
    }

    const d = aiFetcher.data;
    const nextRubricConfig = normalizeRubricDisplayConfig(
      d.rubricConfig ?? legacyRubricDisplayConfig
    );
    setActiveRubricConfig(nextRubricConfig);
    setRubricScores(
      normalizeRubricScoresForCategories({
        raw: d.rubricScores,
        categories: nextRubricConfig.categories,
        minScore: nextRubricConfig.minScore,
        maxScore: nextRubricConfig.maxScore,
      })
    );
    if (typeof d.overallComment === 'string') {
      setOverallComment(d.overallComment);
    }
    if (typeof d.numericPercentage === 'number') {
      setNumericPercentage(d.numericPercentage.toString());
      setHasManualPercentOverride(false);
    }
    const responseStrictnessLevel = parseGradingAssistantStrictnessLevel(
      typeof d.gradingAssistantStrictnessLevel === 'string'
        ? d.gradingAssistantStrictnessLevel
        : null
    );
    if (responseStrictnessLevel) {
      setGradingAssistantStrictnessLevel(responseStrictnessLevel);
    }
    onGrammarIssuesChange(parseGrammarIssuesPayload(d.grammarIssues));
    onAiGradingCompleteRef.current?.({
      numericPercentage:
        typeof d.numericPercentage === 'number' ? d.numericPercentage : null,
      letterGrade: typeof d.letterGrade === 'string' ? d.letterGrade : null,
      score: typeof d.score === 'string' ? d.score : null,
      overallComment:
        typeof d.overallComment === 'string' ? d.overallComment : null,
      rubricScores: d.rubricScores ?? null,
      rubricConfig: nextRubricConfig,
    });

    setSavedSnapshot(
      buildGradingFormSnapshot({
        rubricScores: normalizeRubricScoresForCategories({
          raw: d.rubricScores,
          categories: nextRubricConfig.categories,
          minScore: nextRubricConfig.minScore,
          maxScore: nextRubricConfig.maxScore,
        }),
        overallComment:
          typeof d.overallComment === 'string' ? d.overallComment : '',
        numericPercentage:
          typeof d.numericPercentage === 'number'
            ? d.numericPercentage.toString()
            : '',
        grammarIssues: parseGrammarIssuesPayload(d.grammarIssues),
      })
    );

  }, [aiFetcher.data, aiFetcher.state, onGrammarIssuesChange]);

  /**
   * Build the full grading payload from current state and persist it.
   */
  const saveAll = (
    overrideRubric?: Record<string, RubricScore>,
    overrideComment?: string,
    overridePercent?: string,
    overrideGrammarIssues?: GrammarIssue[]
  ) => {
    if (!targetSubmissionId) return Promise.resolve();

    const effectiveRubric = overrideRubric ?? rubricScores;
    const effectiveComment = overrideComment ?? overallComment;
    const effectivePercentStr = overridePercent ?? numericPercentage;
    const effectiveGrammarIssues = overrideGrammarIssues ?? grammarIssues;

    const trimmedPercent = effectivePercentStr.trim();
    const rawPercent = Number(trimmedPercent);
    const percent =
      trimmedPercent !== '' && Number.isFinite(rawPercent)
        ? Math.max(0, Math.min(100, Math.round(rawPercent)))
        : null;
    const letter = percent === null ? null : letterFromPercent(percent);

    const payload: Record<string, unknown> = {
      feedback: effectiveComment,
      overallComment: effectiveComment,
      rubricScores: effectiveRubric,
      grammarIssues: effectiveGrammarIssues,
    };
    if (percent !== null) payload.numericPercentage = percent;
    if (letter) payload.letterGrade = letter;
    if (percent !== null) payload.score = formatGrade(percent, letter) ?? '';
    if (percent === null && existingGrade?.score) {
      payload.score = existingGrade.score;
    }

    return autoSave(payload).then(() => {
      setSavedSnapshot(
        buildGradingFormSnapshot({
          rubricScores: effectiveRubric,
          overallComment: effectiveComment,
          numericPercentage: effectivePercentStr,
          grammarIssues: effectiveGrammarIssues,
        })
      );
    });
  };

  const generateAiSuggestionsAtLevel = useCallback(
    (level: GradingAssistantStrictnessLevel) => {
      setGradingAssistantStrictnessLevel(level);
      const aiForm = new FormData();
      if (submissionId) {
        aiForm.append('submissionId', submissionId);
      } else {
        aiForm.append('documentId', documentId);
      }
      aiForm.append('gradingAssistantStrictnessLevel', level);
      aiFetcher.submit(aiForm, {
        method: 'POST',
        action: '/api/domain/grade-essay-ai',
      });
    },
    [aiFetcher, documentId, submissionId]
  );

  const generateAiSuggestions = useCallback(() => {
    generateAiSuggestionsAtLevel(gradingAssistantStrictnessLevel);
  }, [generateAiSuggestionsAtLevel, gradingAssistantStrictnessLevel]);

  const saveDraft = () => saveAll();

  const getSavedGradeSnapshot = useCallback((): SavedGradeSnapshot => {
    const letter =
      resolvedNumericPercentage === null
        ? null
        : letterFromPercent(resolvedNumericPercentage);
    return {
      numericPercentage: resolvedNumericPercentage,
      letterGrade: letter,
      score:
        formatGrade(resolvedNumericPercentage, letter) ||
        existingGrade?.score ||
        '',
      overallComment,
      rubricScores,
    };
  }, [
    existingGrade?.score,
    overallComment,
    resolvedNumericPercentage,
    rubricScores,
  ]);

  const discardDraft = useCallback(() => {
    if (!savedSnapshot) return;
    try {
      const parsed = JSON.parse(savedSnapshot) as {
        rubricScores: Record<string, RubricScore>;
        overallComment: string;
        numericPercentage: string;
        grammarIssues: GrammarIssue[];
      };
      setRubricScores(parsed.rubricScores);
      setOverallComment(parsed.overallComment);
      setNumericPercentage(parsed.numericPercentage);
      setHasManualPercentOverride(parsed.numericPercentage.trim() !== '');
      onGrammarIssuesChange(parsed.grammarIssues ?? []);
    } catch {
      // Ignore malformed snapshots.
    }
  }, [onGrammarIssuesChange, savedSnapshot]);

  const onHeaderStateChangeRef = useRef(onHeaderStateChange);
  onHeaderStateChangeRef.current = onHeaderStateChange;

  const headerCallbacksRef = useRef({
    setGradingAssistantStrictnessLevel,
    generateAiSuggestions,
    generateAiSuggestionsAtLevel,
    saveDraft,
    discardDraft,
    getSavedGradeSnapshot,
  });
  headerCallbacksRef.current = {
    setGradingAssistantStrictnessLevel,
    generateAiSuggestions,
    generateAiSuggestionsAtLevel,
    saveDraft,
    discardDraft,
    getSavedGradeSnapshot,
  };

  const headerStateSnapshot = useMemo(
    () => ({
      gradeDisplay,
      gradeBadgeClassName,
      hasUnsavedChanges,
      hasDraftToReplace,
      hasNumericPercentage: resolvedNumericPercentage !== null,
      isGenerating,
      isBusy,
      isSavingDraft: autoSaveStatus === 'saving',
      gradingAssistantStrictnessLevel,
      gradingAssistantStrictnessLabel,
    }),
    [
      autoSaveStatus,
      gradeBadgeClassName,
      gradeDisplay,
      gradingAssistantStrictnessLabel,
      gradingAssistantStrictnessLevel,
      hasDraftToReplace,
      hasUnsavedChanges,
      isBusy,
      isGenerating,
      resolvedNumericPercentage,
    ]
  );

  useLayoutEffect(() => {
    onHeaderStateChangeRef.current?.({
      ...headerStateSnapshot,
      ...headerCallbacksRef.current,
    });
  }, [headerStateSnapshot]);

  const saveStatusLabel =
    autoSaveStatus === 'saving'
      ? 'Saving...'
      : hasUnsavedChanges
        ? 'Unsaved'
        : autoSaveStatus === 'error'
          ? 'Error'
          : null;

  return (
    <div className="flex h-full w-full flex-col">
      {!hideHeader ? (
        <div className="border-b p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold">Grading</div>
            {saveStatusLabel ? (
              <span
                data-testid="grading-auto-save-status"
                className={cn(
                  'text-xs',
                  autoSaveStatus === 'saving' && 'text-muted-foreground',
                  hasUnsavedChanges && 'text-amber-600',
                  autoSaveStatus === 'error' && 'text-red-600'
                )}
              >
                {saveStatusLabel}
              </span>
            ) : null}
          </div>
          <div className="flex items-center justify-between gap-2">
            <Badge variant="secondary" className={gradeBadgeClassName}>
              {gradeDisplay}
            </Badge>
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="outline"
                    className="rounded-full"
                    aria-label={`Grading assistant strictness: ${gradingAssistantStrictnessLabel}`}
                    title={`Grading assistant strictness: ${gradingAssistantStrictnessLabel}`}
                    data-testid="grading-assistant-strictness-menu"
                    disabled={isGenerating}
                  >
                    <TrendingUp className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-96 rounded-md p-3">
                  <p className="mb-2 text-sm font-semibold">Strictness</p>
                  <div className="grid items-start gap-2 sm:grid-cols-3">
                    {gradingAssistantStrictnessOptions.map((option) => {
                      const selected =
                        gradingAssistantStrictnessLevel === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          className={`flex h-full flex-col items-start justify-start rounded-md border px-3 py-2 text-left text-sm transition ${
                            selected
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-border bg-background hover:bg-muted'
                          }`}
                          aria-pressed={selected}
                          data-testid={`grading-assistant-strictness-${option.value}`}
                          onClick={() =>
                            setGradingAssistantStrictnessLevel(option.value)
                          }
                          disabled={isGenerating}
                        >
                          <span className="block font-medium">
                            {option.label}
                          </span>
                          <span
                            className={`mt-1 block text-xs ${
                              selected
                                ? 'text-primary-foreground/80'
                                : 'text-muted-foreground'
                            }`}
                          >
                            {option.description}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
              {hasDraftToReplace ? (
                <ConfirmationDialog
                  title="Replace Existing Grading Feedback?"
                  description="Grading Assistant suggestions will replace all current rubric comments, overall feedback, and grammar issue suggestions. Continue?"
                  confirmText="Replace"
                  cancelText="Go Back"
                  onConfirm={generateAiSuggestions}
                >
                  <Button
                    size="sm"
                    variant="default"
                    data-testid="grading-assistant-generate"
                    disabled={isBusy}
                  >
                    {isGenerating ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Grading...
                      </span>
                    ) : (
                      'Grading Assistant Suggestions'
                    )}
                  </Button>
                </ConfirmationDialog>
              ) : (
                <Button
                  size="sm"
                  variant="default"
                  data-testid="grading-assistant-generate"
                  disabled={isBusy}
                  onClick={generateAiSuggestions}
                >
                  {isGenerating ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Grading...
                    </span>
                  ) : (
                    'Grading Assistant Suggestions'
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <div className="no-scrollbar flex-1 overflow-y-auto p-3 space-y-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="pct">Overall Percentage</Label>
          </div>
          <Input
            id="pct"
            data-testid="grading-overall-percentage"
            type="number"
            min={0}
            max={100}
            value={numericPercentage}
            disabled={isGenerating}
            onChange={(e) => {
              setNumericPercentage(e.target.value);
              setHasManualPercentOverride(true);
            }}
            onBlur={(e) => {
              if (!hideHeader) {
                void saveAll(undefined, undefined, e.currentTarget.value);
              }
            }}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="overall-comment">Overall Feedback</Label>
          <Textarea
            id="overall-comment"
            data-testid="grading-overall-comment"
            value={overallComment}
            disabled={isGenerating}
            onChange={(e) => setOverallComment(e.target.value)}
            onBlur={(e) => {
              if (!hideHeader) {
                void saveAll(undefined, e.currentTarget.value);
              }
            }}
            rows={4}
            placeholder="Write overall feedback..."
          />
        </div>

        <div className="space-y-3">
          <div className="text-sm font-medium">Rubric</div>
          <Accordion type="multiple" className="w-full rounded-lg bg-white">
            {activeRubricConfig.categories.map((item) => {
              const current = rubricScores[item.key] || {
                score: 0,
                comment: '',
              };
              const applyScoreChange = (value: string) => {
                const newRubric = {
                  ...rubricScores,
                  [item.key]: {
                    ...rubricScores[item.key],
                    score: Number(value),
                    isAi: false,
                  },
                };
                setRubricScores(newRubric);
                if (!hideHeader) {
                  void saveAll(newRubric);
                }
              };
              const scoreLabel = current.score
                ? `${current.score}/${activeRubricConfig.maxScore}`
                : 'Not scored';
              const isGrammarCategory =
                item.key === 'grammar_and_mechanics' ||
                item.key === 'language_use_and_conventions';

              return (
                <AccordionItem
                  key={item.key}
                  value={item.key}
                  className="last:border-b-0"
                >
                  <AccordionTrigger className="py-3 hover:no-underline">
                    <div className="flex w-full items-center justify-between gap-3 pr-2">
                      <div className="text-sm font-medium">{item.label}</div>
                      <span className="text-xs font-medium text-muted-foreground">
                        {scoreLabel}
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-2 pb-3">
                    <div className="text-xs text-muted-foreground">
                      {item.description}
                    </div>
                    <Select
                      value={current.score ? current.score.toString() : ''}
                      disabled={isGenerating}
                      onValueChange={applyScoreChange}
                    >
                      <SelectTrigger
                        className="w-full"
                        data-testid={`grading-rubric-score-${item.key}`}
                      >
                        <SelectValue placeholder="Select score" />
                      </SelectTrigger>
                      <SelectContent>
                        {scoreOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Textarea
                      data-testid={`grading-rubric-comment-${item.key}`}
                      value={current.comment}
                      disabled={isGenerating}
                      onChange={(e) =>
                        setRubricScores((prev) => ({
                          ...prev,
                          [item.key]: {
                            ...prev[item.key],
                            comment: e.target.value,
                            isAi: false,
                          },
                        }))
                      }
                      onBlur={(e) => {
                        const newRubric = {
                          ...rubricScores,
                          [item.key]: {
                            ...rubricScores[item.key],
                            comment: e.currentTarget.value,
                            isAi: false,
                          },
                        };
                        setRubricScores(newRubric);
                        if (!hideHeader) {
                          void saveAll(newRubric);
                        }
                      }}
                      placeholder="Enter category feedback..."
                      rows={4}
                    />
                    {isGrammarCategory ? (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">
                          AI grammar issues: {grammarIssues.length}
                        </p>
                        {grammarIssues.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            No grammar/syntax issues yet. Generate suggestions
                            from Grading Assistant to populate this list.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {grammarIssues.map((issue) => (
                              <div
                                key={issue.id}
                                className="rounded-md border bg-white p-2"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-xs font-medium text-muted-foreground">
                                    {issue.kind === 'style'
                                      ? 'Style'
                                      : 'Grammar'}
                                    {issue.ruleNumber
                                      ? ` • Rule ${issue.ruleNumber}`
                                      : ''}
                                  </p>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2 text-xs"
                                    disabled={isGenerating}
                                    onClick={() =>
                                      onRemoveGrammarIssue(issue.id)
                                    }
                                  >
                                    Remove
                                  </Button>
                                </div>
                                <p className="mt-1 text-sm italic">
                                  "{formatExcerpt(issue.excerpt)}"
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {issue.message}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </div>
      </div>
    </div>
  );
}
