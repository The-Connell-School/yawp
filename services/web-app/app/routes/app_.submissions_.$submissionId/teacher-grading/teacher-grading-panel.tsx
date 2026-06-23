import { useEffect, useMemo, useRef, useState } from 'react';
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
import { Check, Loader2 } from 'lucide-react';
import { cn } from '~/utils/misc';
import { useUpdateSubmission } from './use-update-submission';
import { hasGradingDraftToReplace } from './has-grading-draft-to-replace';
import {
  cloneFormDataWithFallbackRetry,
  isLlmRetryResponse,
} from '~/utils/llm-retry-ui';

function normalizePercentage(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function formatExcerpt(excerpt: string, maxChars = 90) {
  const text = excerpt.trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1)).trimEnd()}...`;
}

export function TeacherGradingPanel({
  documentId,
  submissionId,
  existingGrade,
  grammarIssues,
  hiddenGrammarIssueIds,
  onToggleGrammarIssue,
  onRemoveGrammarIssue,
  onGrammarIssuesChange,
  onAiGradingComplete,
  rubricConfig,
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
  const [rubricScores, setRubricScores] =
    useState<Record<string, RubricScore>>(
      buildEmptyRubricScores(propRubricConfig.categories)
    );
  const [overallComment, setOverallComment] = useState('');
  const [numericPercentage, setNumericPercentage] = useState('');
  const [hasManualPercentOverride, setHasManualPercentOverride] =
    useState(false);
  const recalcCompleteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const recalcResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const pendingAiFormRef = useRef<FormData | null>(null);
  const hasRetriedAiFormRef = useRef(false);
  const lastInitializationKeyRef = useRef<string | null>(null);
  const [isAiRetrying, setIsAiRetrying] = useState(false);
  const [recalcUiState, setRecalcUiState] = useState<
    'idle' | 'loading' | 'done'
  >('idle');
  const scoreOptions = useMemo(
    () =>
      buildScoreOptions(activeRubricConfig.minScore, activeRubricConfig.maxScore),
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
  const gradeBadgeClassName =
    'border-purple-300 bg-purple-100 text-purple-800 hover:!bg-purple-100 hover:!text-purple-800 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-200 dark:hover:!bg-purple-950/40 dark:hover:!text-purple-200';
  const isAiRequestInFlight = aiFetcher.state !== 'idle';
  const isGenerating = isAiRequestInFlight || isAiRetrying;
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
      }),
    [existingGrade, propRubricConfig, submissionId]
  );

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
  }, [existingGrade, initializationKey, propRubricConfig]);

  useEffect(() => {
    if (!hasManualPercentOverride && computedNumericPercentage !== null) {
      setNumericPercentage(computedNumericPercentage.toString());
    }
  }, [computedNumericPercentage, hasManualPercentOverride]);

  useEffect(() => {
    if (aiFetcher.state !== 'idle') return;

    if (
      isLlmRetryResponse(aiFetcher.data) &&
      pendingAiFormRef.current &&
      !hasRetriedAiFormRef.current
    ) {
      hasRetriedAiFormRef.current = true;
      setIsAiRetrying(true);
      aiFetcher.submit(cloneFormDataWithFallbackRetry(pendingAiFormRef.current), {
        method: 'POST',
        action: '/api/domain/grade-essay-ai',
      });
      return;
    }

    if (!aiFetcher.data?.success) {
      if (aiFetcher.data && !isLlmRetryResponse(aiFetcher.data)) {
        pendingAiFormRef.current = null;
        hasRetriedAiFormRef.current = false;
        setIsAiRetrying(false);
      }
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

    pendingAiFormRef.current = null;
    hasRetriedAiFormRef.current = false;
    setIsAiRetrying(false);
  }, [
    aiFetcher.data,
    aiFetcher.state,
    onGrammarIssuesChange,
  ]);

  useEffect(() => {
    return () => {
      if (recalcCompleteTimeoutRef.current) {
        clearTimeout(recalcCompleteTimeoutRef.current);
      }
      if (recalcResetTimeoutRef.current) {
        clearTimeout(recalcResetTimeoutRef.current);
      }
    };
  }, []);

  /**
   * Build the full grading payload from current state and auto-save it.
   * Called on blur from form fields.
   */
  const saveAll = (
    overrideRubric?: Record<string, RubricScore>,
    overrideComment?: string,
    overridePercent?: string,
    overrideGrammarIssues?: GrammarIssue[]
  ) => {
    if (!targetSubmissionId) return;

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

    void autoSave(payload);
  };

  const handleRecalculate = () => {
    if (computedNumericPercentage === null || recalcUiState !== 'idle') return;

    setRecalcUiState('loading');

    if (recalcCompleteTimeoutRef.current) {
      clearTimeout(recalcCompleteTimeoutRef.current);
    }
    if (recalcResetTimeoutRef.current) {
      clearTimeout(recalcResetTimeoutRef.current);
    }

    recalcCompleteTimeoutRef.current = setTimeout(() => {
      const newPercent = computedNumericPercentage.toString();
      setNumericPercentage(newPercent);
      setHasManualPercentOverride(false);
      setRecalcUiState('done');
      saveAll(undefined, undefined, newPercent);

      recalcResetTimeoutRef.current = setTimeout(() => {
        setRecalcUiState('idle');
      }, 1600);
    }, 500);
  };

  const generateAiSuggestions = () => {
    const aiForm = new FormData();
    if (submissionId) {
      aiForm.append('submissionId', submissionId);
    } else {
      aiForm.append('documentId', documentId);
    }
    pendingAiFormRef.current = aiForm;
    hasRetriedAiFormRef.current = false;
    setIsAiRetrying(false);
    aiFetcher.submit(aiForm, {
      method: 'POST',
      action: '/api/domain/grade-essay-ai',
    });
  };

  const statusLabel =
    autoSaveStatus === 'saving'
      ? 'Saving...'
      : autoSaveStatus === 'saved'
        ? 'Saved'
        : autoSaveStatus === 'error'
          ? 'Error'
          : null;

  return (
    <div className="flex h-full w-full flex-col">
      <div className="border-b p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-semibold">Grading</div>
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                'inline-flex h-1.5 w-1.5 rounded-full',
                autoSaveStatus === 'saving' && 'bg-muted-foreground animate-pulse',
                autoSaveStatus === 'saved' && 'bg-green-500',
                autoSaveStatus === 'error' && 'bg-red-500',
                autoSaveStatus === 'idle' && 'bg-muted-foreground/30'
              )}
            />
            <span
              data-testid="grading-auto-save-status"
              className={cn(
                'text-xs',
                autoSaveStatus === 'saving' && 'text-muted-foreground',
                autoSaveStatus === 'saved' && 'text-green-600',
                autoSaveStatus === 'error' && 'text-red-600',
                autoSaveStatus === 'idle' && 'text-muted-foreground/60'
              )}
            >
              {statusLabel ?? 'Autosave on'}
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <Badge variant="secondary" className={gradeBadgeClassName}>
            {gradeDisplay}
          </Badge>
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
                    {isAiRetrying ? 'Retrying...' : 'Grading...'}
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
                  {isAiRetrying ? 'Retrying...' : 'Grading...'}
                </span>
              ) : (
                'Grading Assistant Suggestions'
              )}
            </Button>
          )}
        </div>
      </div>

      <div className="no-scrollbar flex-1 overflow-y-auto p-3 space-y-4">
        <div className="rounded-lg border p-2 space-y-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="pct">Overall Percentage</Label>
          </div>
          <div className="flex gap-2">
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
              onBlur={(e) => saveAll(undefined, undefined, e.currentTarget.value)}
            />
            <Button
              type="button"
              variant="outline"
              onClick={handleRecalculate}
              disabled={
                computedNumericPercentage === null ||
                recalcUiState !== 'idle' ||
                isGenerating
              }
              className={cn(
                'min-w-[120px] transition-all',
                recalcUiState !== 'idle' &&
                  'border-muted-foreground/30 bg-muted/50 text-muted-foreground'
              )}
            >
              {recalcUiState === 'loading' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : recalcUiState === 'done' ? (
                <Check className="h-4 w-4 text-muted-foreground" />
              ) : (
                'Recalculate'
              )}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="overall-comment">Overall Feedback</Label>
          <Textarea
            id="overall-comment"
            data-testid="grading-overall-comment"
            value={overallComment}
            disabled={isGenerating}
            onChange={(e) => setOverallComment(e.target.value)}
            onBlur={(e) => saveAll(undefined, e.currentTarget.value)}
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
                // Auto-save on select change (selects don't fire blur)
                saveAll(newRubric);
              };
              const scoreLabel = current.score
                ? `${current.score}/${activeRubricConfig.maxScore}`
                : 'Not scored';
              const isGrammarCategory =
                item.key === 'grammar_and_mechanics' ||
                item.key === 'language_use_and_conventions';
              const shownGrammarCount = grammarIssues.filter(
                (issue) => !hiddenGrammarIssueIds.includes(issue.id)
              ).length;

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
                        saveAll(newRubric);
                      }}
                      placeholder="Enter category feedback..."
                      rows={4}
                    />
                    {isGrammarCategory ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs text-muted-foreground">
                            AI grammar issues shown: {shownGrammarCount}/
                            {grammarIssues.length}
                          </p>
                          {grammarIssues.length > 0 ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              disabled={isGenerating}
                              onClick={() => {
                                const shouldShowAll =
                                  shownGrammarCount !== grammarIssues.length;
                                grammarIssues.forEach((issue) => {
                                  const isHidden =
                                    hiddenGrammarIssueIds.includes(issue.id);
                                  if (shouldShowAll && isHidden) {
                                    onToggleGrammarIssue(issue.id);
                                  }
                                  if (!shouldShowAll && !isHidden) {
                                    onToggleGrammarIssue(issue.id);
                                  }
                                });
                              }}
                            >
                              {shownGrammarCount === grammarIssues.length
                                ? 'Hide all'
                                : 'Show all'}
                            </Button>
                          ) : null}
                        </div>
                        {grammarIssues.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            No grammar/syntax issues yet. Generate suggestions
                            from Grading Assistant to populate this list.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {grammarIssues.map((issue) => {
                              const isHidden = hiddenGrammarIssueIds.includes(
                                issue.id
                              );

                              return (
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
                                    <div className="flex items-center gap-2">
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className="h-7 px-2 text-xs"
                                        disabled={isGenerating}
                                        onClick={() =>
                                          onToggleGrammarIssue(issue.id)
                                        }
                                      >
                                        {isHidden ? 'Show' : 'Hide'}
                                      </Button>
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
                                  </div>
                                  <p className="mt-1 text-sm italic">
                                    "{formatExcerpt(issue.excerpt)}"
                                  </p>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {issue.message}
                                  </p>
                                </div>
                              );
                            })}
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
