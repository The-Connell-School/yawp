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
import { rubricCategories } from '~/domain/grading/rubric';
import {
  computeWeightedPercentage,
  formatGrade,
  letterFromPercent,
} from '~/domain/grading/gradeMath';
import {
  type GrammarIssue,
  parseGrammarIssuesPayload,
} from '~/domain/grading/grammarIssues';
import { buildPersistedGradeSignature } from '~/domain/grading/persisted-grade-signature';
import { Check, Loader2 } from 'lucide-react';
import { cn } from '~/utils/misc';
import {
  cloneFormDataWithFallbackRetry,
  isLlmRetryResponse,
} from '~/utils/llm-retry-ui';

type RubricScore = {
  score: number;
  comment: string;
  isAi?: boolean;
};

const scoreOptions = [
  { value: '1', label: '1 - Needs Improvement' },
  { value: '2', label: '2 - Developing' },
  { value: '3', label: '3 - Proficient' },
  { value: '4', label: '4 - Strong' },
  { value: '5', label: '5 - Exemplary' },
];

const buildEmptyRubric = () =>
  rubricCategories.reduce<Record<string, RubricScore>>((acc, item) => {
    acc[item.key] = { score: 0, comment: '' };
    return acc;
  }, {});

function normalizePercentage(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeRubricScores(raw: unknown): Record<string, RubricScore> {
  const normalized = buildEmptyRubric();
  if (!raw || typeof raw !== 'object') return normalized;

  for (const item of rubricCategories) {
    const candidate = (raw as Record<string, unknown>)[item.key];
    if (!candidate || typeof candidate !== 'object') continue;

    const scoreValue = (candidate as { score?: unknown }).score;
    const commentValue = (candidate as { comment?: unknown }).comment;

    normalized[item.key] = {
      score:
        typeof scoreValue === 'number' && Number.isFinite(scoreValue)
          ? Math.max(0, Math.min(5, Math.round(scoreValue)))
          : 0,
      comment: typeof commentValue === 'string' ? commentValue : '',
      isAi: Boolean((candidate as { isAi?: unknown }).isAi),
    };
  }

  return normalized;
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
  persistedGrammarIssues,
  hiddenGrammarIssueIds,
  onToggleGrammarIssue,
  onRemoveGrammarIssue,
  onGrammarIssuesChange,
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
  persistedGrammarIssues: GrammarIssue[];
  hiddenGrammarIssueIds: string[];
  onToggleGrammarIssue: (id: string) => void;
  onRemoveGrammarIssue: (id: string) => void;
  onGrammarIssuesChange: (issues: GrammarIssue[]) => void;
}) {
  const aiFetcher = useFetcher();
  const saveFetcher = useFetcher();
  const [rubricScores, setRubricScores] =
    useState<Record<string, RubricScore>>(buildEmptyRubric());
  const [overallComment, setOverallComment] = useState('');
  const [numericPercentage, setNumericPercentage] = useState('');
  const [hasManualPercentOverride, setHasManualPercentOverride] =
    useState(false);
  const [savedSignature, setSavedSignature] = useState('');
  const pendingSaveSignatureRef = useRef('');
  const pendingAiFormRef = useRef<FormData | null>(null);
  const hasRetriedAiFormRef = useRef(false);
  const recalcCompleteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const recalcResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const [recalcUiState, setRecalcUiState] = useState<
    'idle' | 'loading' | 'done'
  >('idle');

  const computedNumericPercentage = useMemo(() => {
    return computeWeightedPercentage(
      rubricScores as unknown as Record<string, unknown>
    );
  }, [rubricScores]);

  const resolvedNumericPercentage = useMemo(() => {
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
      ) || '—'
    );
  }, [resolvedNumericPercentage]);
  const gradeBadgeClassName =
    'border-purple-300 bg-purple-100 text-purple-800 hover:!bg-purple-100 hover:!text-purple-800 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-200 dark:hover:!bg-purple-950/40 dark:hover:!text-purple-200';
  const [isAiRetrying, setIsAiRetrying] = useState(false);
  const isAiRequestInFlight = aiFetcher.state !== 'idle';
  const isGenerating = isAiRequestInFlight || isAiRetrying;
  const isSaving = saveFetcher.state !== 'idle';
  const isBusy = isGenerating || isSaving;

  useEffect(() => {
    let initialOverallComment = '';
    let initialNumericPercentage = '';
    let initialRubricScores = buildEmptyRubric();
    let initialNormalizedPercent: number | null = null;

    if (existingGrade) {
      initialOverallComment =
        existingGrade.overallComment || existingGrade.feedback || '';
      initialNormalizedPercent = normalizePercentage(
        existingGrade.numericPercentage
      );
      if (initialNormalizedPercent !== null) {
        initialNumericPercentage = initialNormalizedPercent.toString();
        setHasManualPercentOverride(true);
      }
      initialRubricScores = normalizeRubricScores(existingGrade.rubricScores);
    }

    setOverallComment(initialOverallComment);
    setNumericPercentage(initialNumericPercentage);
    setRubricScores(initialRubricScores);
    setSavedSignature(
      buildPersistedGradeSignature({
        overallComment: initialOverallComment,
        numericPercentage: initialNormalizedPercent,
        rubricScores: initialRubricScores,
        grammarIssues: persistedGrammarIssues,
      })
    );
  }, [existingGrade, persistedGrammarIssues, submissionId]);

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

    if (aiFetcher.data?.success) {
      const aiRubricScores = normalizeRubricScores(aiFetcher.data.rubricScores);

      if (aiFetcher.data.rubricScores) {
        setRubricScores(aiRubricScores);
      }
      if (typeof aiFetcher.data.overallComment === 'string') {
        setOverallComment(aiFetcher.data.overallComment);
      }
      if (typeof aiFetcher.data.numericPercentage === 'number') {
        setNumericPercentage(aiFetcher.data.numericPercentage.toString());
        setHasManualPercentOverride(false);
      }
      onGrammarIssuesChange(
        parseGrammarIssuesPayload(aiFetcher.data.grammarIssues)
      );
    }

    if (aiFetcher.data && !isLlmRetryResponse(aiFetcher.data)) {
      pendingAiFormRef.current = null;
      hasRetriedAiFormRef.current = false;
      setIsAiRetrying(false);
    }
  }, [aiFetcher.data, aiFetcher.state, onGrammarIssuesChange]);

  const currentSignature = useMemo(
    () =>
      buildPersistedGradeSignature({
        overallComment,
        numericPercentage: resolvedNumericPercentage,
        rubricScores,
        grammarIssues,
      }),
    [grammarIssues, overallComment, resolvedNumericPercentage, rubricScores]
  );

  const hasUnsavedChanges = currentSignature !== savedSignature;

  useEffect(() => {
    if (saveFetcher.data?.success && saveFetcher.state === 'idle') {
      setSavedSignature(pendingSaveSignatureRef.current);
    }
  }, [saveFetcher.data, saveFetcher.state]);

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

  const save = () => {
    pendingSaveSignatureRef.current = currentSignature;
    const percent =
      resolvedNumericPercentage === null ? null : resolvedNumericPercentage;
    const letter = percent === null ? null : letterFromPercent(percent);

    // The submission ID is either from the existing grade (which IS the
    // submission) or from the submissionId prop.
    const targetSubmissionId = existingGrade?.id ?? submissionId;
    if (!targetSubmissionId) return;

    const payload: Record<string, unknown> = {
      submissionId: targetSubmissionId,
      feedback: overallComment,
      overallComment,
      rubricScores,
      grammarIssues,
    };
    if (percent !== null) payload.numericPercentage = percent;
    if (letter) payload.letterGrade = letter;
    if (percent !== null) payload.score = formatGrade(percent, letter) ?? '';

    saveFetcher.submit(JSON.stringify(payload), {
      method: 'POST',
      action: '/api/domain/update-submission',
      encType: 'application/json',
    });
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
      setNumericPercentage(computedNumericPercentage.toString());
      setHasManualPercentOverride(false);
      setRecalcUiState('done');

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

  return (
    <div className="flex h-full w-full flex-col border-r bg-muted/30 md:w-3/5">
      <div className="border-b bg-white p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-semibold">Grading</div>
          <Badge variant="secondary" className={gradeBadgeClassName}>
            {gradeDisplay}
          </Badge>
        </div>
        <div className="mt-2 flex gap-2">
          <ConfirmationDialog
            title="Replace Existing Grading Feedback?"
            description="Grading Assistant suggestions will replace all current rubric comments, overall feedback, and grammar issue suggestions. Continue?"
            confirmText="Replace with Grading Assistant Suggestions"
            cancelText="Go Back"
            onConfirm={generateAiSuggestions}
          >
            <Button
              size="sm"
              variant="secondary"
              data-testid="grading-assistant-generate"
              disabled={isBusy}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isAiRetrying ? 'Retrying...' : 'Grading...'}
                </>
              ) : (
                'Grading Assistant Suggestions'
              )}
            </Button>
          </ConfirmationDialog>
          <Button
            size="sm"
            data-testid="grading-save-grade"
            onClick={save}
            disabled={isBusy || !hasUnsavedChanges}
          >
            {isSaving ? 'Saving...' : 'Save Grade'}
          </Button>
        </div>
        {hasUnsavedChanges ? (
          <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900">
            Unsaved changes. Click Save Grade before leaving.
          </div>
        ) : null}
      </div>

      <div className="no-scrollbar flex-1 overflow-y-auto p-3 space-y-4">
        <div className="rounded-lg bg-white/70 p-2 space-y-2">
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
            rows={4}
            placeholder="Write overall feedback..."
          />
        </div>

        <div className="space-y-3">
          <div className="text-sm font-medium">Rubric</div>
          <Accordion type="multiple" className="w-full rounded-lg bg-white">
            {rubricCategories.map((item) => {
              const current = rubricScores[item.key] || {
                score: 0,
                comment: '',
              };
              const scoreLabel = current.score
                ? `${current.score}/5`
                : 'Not scored';
              const isGrammarCategory = item.key === 'grammar_and_mechanics';
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
                      onValueChange={(value) => {
                        setRubricScores((prev) => ({
                          ...prev,
                          [item.key]: {
                            ...prev[item.key],
                            score: Number(value),
                            isAi: false,
                          },
                        }));
                      }}
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
