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
  isScored,
  legacyRubricDisplayConfig,
  normalizeRubricDisplayConfig,
  normalizeRubricScoresForCategories,
  toPersistedRubricScores,
  type RubricDisplayConfig,
  type RubricScore,
} from '~/domain/grading/rubric-display';
import { rubricScaleGradeFieldsFromScores } from '~/domain/grading/recorded-grade';
import {
  getCategoryScoreLabel,
  isCategoryFeedbackEnabled,
  isGrammarHighlightCategory,
} from '~/domain/assignment-types/rubric-category-options';
import {
  computeWeightedPercentageForCategories,
  formatGrade,
  letterFromPercent,
} from '~/domain/grading/gradeMath';
import { buildGradeBreakdown } from '~/domain/grading/grade-breakdown';
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
import { AlertTriangle, Info, Loader2, TrendingUp } from 'lucide-react';
import { Tooltip } from '~/components/ui/tooltip';
import { cn } from '~/utils/misc';
import { useUpdateSubmission } from './use-update-submission';
import { hasGradingDraftToReplace } from './has-grading-draft-to-replace';
import { buildGradingFormSnapshot } from './grading-form-snapshot';
import {
  cloneFormDataWithFallbackRetry,
  isLlmRetryResponse,
} from '~/utils/llm-retry-ui';

/**
 * The nearest score the scale actually offers. A typed 17 on a 0-30 rubric
 * scored in tens becomes 20; anything outside the range is pulled to its
 * nearest end.
 */
function snapToScaleValue(
  value: number,
  bounds: { min: number; max: number; step: number } | null,
  fallbackMax: number
): number {
  if (!bounds) return Math.max(0, Math.min(fallbackMax, Math.round(value)));

  const clamped = Math.max(bounds.min, Math.min(bounds.max, value));
  const steps = Math.round((clamped - bounds.min) / bounds.step);
  return Math.min(bounds.max, bounds.min + steps * bounds.step);
}

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
  overallScore: number | null;
  score: string | null;
  overallComment: string | null;
  rubricScores: unknown;
};

export type TeacherGradingPanelHeaderState = {
  gradeDisplay: string;
  gradeBadgeClassName: string;
  hasUnsavedChanges: boolean;
  hasDraftToReplace: boolean;
  hasGrade: boolean;
  isGenerating: boolean;
  isAiRetrying: boolean;
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
  pointValue,
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
  /** The assignment's point total, used to show what the percentage is worth. */
  pointValue?: number | null;
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
    buildEmptyRubricScores(
      propRubricConfig.categories,
      propRubricConfig.minScore
    )
  );
  const [overallComment, setOverallComment] = useState('');
  const [numericPercentage, setNumericPercentage] = useState('');
  const [hasManualPercentOverride, setHasManualPercentOverride] =
    useState(false);
  /**
   * The points-scale equivalent of the overall percentage: editable at all
   * times, seeded from what the category scores add up to, and left alone once
   * the teacher types their own number.
   */
  const [overallScoreInput, setOverallScoreInput] = useState('');
  const [hasManualScoreOverride, setHasManualScoreOverride] = useState(false);
  const pendingAiFormRef = useRef<FormData | null>(null);
  const hasRetriedAiFormRef = useRef(false);
  const lastInitializationKeyRef = useRef<string | null>(null);
  const lastStrictnessInitializationKeyRef = useRef<string | null>(null);
  const [isAiRetrying, setIsAiRetrying] = useState(false);
  const [gradingAssistantStrictnessLevel, setGradingAssistantStrictnessLevel] =
    useState<GradingAssistantStrictnessLevel>(
      parseGradingAssistantStrictnessLevel(
        initialGradingAssistantStrictnessLevel
      ) ?? DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL
    );
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const computedNumericPercentage = useMemo(() => {
    if (activeRubricConfig.scoringType !== 'weighted_1_5') return null;
    return computeWeightedPercentageForCategories(
      rubricScores as unknown as Record<string, unknown>,
      activeRubricConfig.categories
    );
  }, [activeRubricConfig, rubricScores]);

  /**
   * The same percentage, broken into the steps that produced it. Shown rather
   * than used: a score of 4 reading as 89% instead of 80%, and points coming
   * off the percentage rather than the rubric, are otherwise invisible.
   */
  const gradeBreakdown = useMemo(() => {
    if (activeRubricConfig.scoringType !== 'weighted_1_5') return null;
    return buildGradeBreakdown({
      rubricScores: rubricScores as unknown as Record<string, unknown>,
      categories: activeRubricConfig.categories,
      pointValue,
    });
  }, [activeRubricConfig, rubricScores, pointValue]);

  /**
   * The grade this rubric produces on a scale that reports raw points rather
   * than a percentage (Daily Pages, ACT writing). Null on percentage scales,
   * whose grade comes from the overall percentage field.
   */
  const rubricScaleGrade = useMemo(
    () =>
      rubricScaleGradeFieldsFromScores({
        rubricScores,
        categories: activeRubricConfig.categories,
        minScore: activeRubricConfig.minScore,
        maxScore: activeRubricConfig.maxScore,
        scoringType: activeRubricConfig.scoringType,
      }),
    [activeRubricConfig, rubricScores]
  );

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
      rubricScaleGrade?.score ||
      existingGrade?.score ||
      '—'
    );
  }, [existingGrade?.score, resolvedNumericPercentage, rubricScaleGrade]);
  const gradingAssistantStrictnessLabel = useMemo(
    () => getGradingAssistantStrictnessLabel(gradingAssistantStrictnessLevel),
    [gradingAssistantStrictnessLevel]
  );
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
        grammarIssues.length,
        activeRubricConfig.minScore
      ),
    [
      activeRubricConfig.minScore,
      rubricScores,
      overallComment,
      numericPercentage,
      grammarIssues.length,
    ]
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
      propRubricConfig.categories,
      propRubricConfig.minScore
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

    pendingAiFormRef.current = null;
    hasRetriedAiFormRef.current = false;
    setIsAiRetrying(false);
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

    // What the teacher's own scores are worth on this rubric's scale. On a
    // percentage scale this is null and the overall percentage below is the
    // grade; on a raw-points scale it *is* the grade, and nothing else will
    // compute it -- the assistant only runs its own grading route.
    const scaleGrade = rubricScaleGradeFieldsFromScores({
      rubricScores: effectiveRubric,
      categories: activeRubricConfig.categories,
      minScore: activeRubricConfig.minScore,
      maxScore: activeRubricConfig.maxScore,
      scoringType: activeRubricConfig.scoringType,
    });

    const payload: Record<string, unknown> = {
      feedback: effectiveComment,
      overallComment: effectiveComment,
      rubricScores: toPersistedRubricScores(
        effectiveRubric,
        activeRubricConfig.minScore
      ),
      grammarIssues: effectiveGrammarIssues,
    };
    // A points scale has no percentage, so a score the teacher typed is the
    // grade, the same way the overall percentage wins on a weighted rubric.
    // Only their own edit counts: left alone, the field mirrors the categories
    // and must not freeze that value in place.
    const typedScore = Number(overallScoreInput.trim());
    const scaleDenominator = Number(scaleGrade?.score?.split('/')[1]);
    const manualScaleScore =
      scaleGrade &&
      hasManualScoreOverride &&
      overallScoreInput.trim() !== '' &&
      Number.isFinite(typedScore) &&
      Number.isFinite(scaleDenominator)
        ? snapToScaleValue(typedScore, totalPointsBounds, scaleDenominator)
        : null;

    if (percent !== null) {
      payload.numericPercentage = percent;
      if (letter) payload.letterGrade = letter;
      payload.score = formatGrade(percent, letter) ?? '';
    } else if (manualScaleScore !== null) {
      payload.overallScore = manualScaleScore;
      payload.score = `${manualScaleScore}/${scaleDenominator}`;
    } else if (scaleGrade) {
      payload.overallScore = scaleGrade.overallScore;
      payload.score = scaleGrade.score;
    } else if (existingGrade?.score) {
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

  /**
   * Overwrite the overall percentage with the total computed from the
   * current rubric category scores. Does not touch rubric scores, rubric
   * comments, or overall feedback, and does not save — like every other
   * field edit in this panel, the change is staged until the teacher clicks
   * Save (or discarded via Cancel).
   */
  useEffect(() => {
    if (hasManualScoreOverride) return;
    if (!rubricScaleGrade) return;
    setOverallScoreInput(String(rubricScaleGrade.overallScore));
  }, [rubricScaleGrade, hasManualScoreOverride]);

  const scaleScoreOutOf = useMemo(() => {
    const denominator = Number(rubricScaleGrade?.score?.split('/')[1]);
    return Number.isFinite(denominator) ? denominator : null;
  }, [rubricScaleGrade]);

  /**
   * What the total-points field accepts: the rubric's own range and step when
   * the grade is scored out of that range, so a 0-30 rubric scored in tens
   * moves 0, 10, 20, 30 and refuses everything between.
   */
  const totalPointsBounds = useMemo(() => {
    if (scaleScoreOutOf === null) return null;
    const isRubricRange = scaleScoreOutOf === activeRubricConfig.maxScore;
    return {
      min: isRubricRange ? activeRubricConfig.minScore : 0,
      max: scaleScoreOutOf,
      step: isRubricRange ? (activeRubricConfig.step ?? 1) : 1,
    };
  }, [scaleScoreOutOf, activeRubricConfig]);

  const handleRecalculateFromRubric = () => {
    if (rubricScaleGrade) {
      setOverallScoreInput(String(rubricScaleGrade.overallScore));
      setHasManualScoreOverride(false);
      return;
    }
    if (computedNumericPercentage === null) return;
    setNumericPercentage(computedNumericPercentage.toString());
    setHasManualPercentOverride(false);
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
      pendingAiFormRef.current = aiForm;
      hasRetriedAiFormRef.current = false;
      setIsAiRetrying(false);
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
      overallScore:
        resolvedNumericPercentage === null
          ? (rubricScaleGrade?.overallScore ?? null)
          : null,
      score:
        formatGrade(resolvedNumericPercentage, letter) ||
        rubricScaleGrade?.score ||
        existingGrade?.score ||
        '',
      overallComment,
      rubricScores,
    };
  }, [
    existingGrade?.score,
    overallComment,
    resolvedNumericPercentage,
    rubricScaleGrade,
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
      // A grade exists when this rubric's own scale has produced one --
      // a percentage, or the raw points a points scale reports instead.
      hasGrade: resolvedNumericPercentage !== null || rubricScaleGrade !== null,
      isGenerating,
      isAiRetrying,
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
      isAiRetrying,
      isBusy,
      isGenerating,
      resolvedNumericPercentage,
      rubricScaleGrade,
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
            <Badge
              variant="secondary"
              className={gradeBadgeClassName}
              data-testid="grading-grade-badge"
            >
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
                        <Tooltip
                          key={option.value}
                          text={option.description}
                          delayDuration={200}
                          contentProps={{ side: 'bottom', className: 'max-w-xs' }}
                        >
                          <button
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
                          </button>
                        </Tooltip>
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
        </div>
      ) : null}

      <div className="no-scrollbar flex-1 overflow-y-auto p-3 space-y-4">
        {/* A points scale records earned points and has no percentage at all,
            so showing it an empty percentage box reads as a missing grade.
            It gets the grade its own scale produces instead. */}
        {rubricScaleGrade ? (
          <div className="space-y-2">
            <Label htmlFor="overall-score">
              Total points{scaleScoreOutOf === null ? '' : ` (out of ${scaleScoreOutOf})`}
            </Label>
            <Input
              id="overall-score"
              data-testid="grading-overall-scale-score"
              type="number"
              min={totalPointsBounds?.min ?? 0}
              max={totalPointsBounds?.max ?? undefined}
              step={totalPointsBounds?.step ?? 1}
              value={overallScoreInput}
              disabled={isGenerating}
              onChange={(e) => {
                setOverallScoreInput(e.target.value);
                setHasManualScoreOverride(true);
              }}
              onBlur={(e) => {
                // Typing is unrestricted; leaving the field is where an
                // out-of-range or off-step number is pulled onto the scale.
                const typed = Number(e.currentTarget.value.trim());
                if (e.currentTarget.value.trim() !== '' && Number.isFinite(typed)) {
                  setOverallScoreInput(
                    String(
                      snapToScaleValue(
                        typed,
                        totalPointsBounds,
                        scaleScoreOutOf ?? 0
                      )
                    )
                  );
                }
                if (!hideHeader) {
                  void saveAll();
                }
              }}
            />
            <div>
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs"
                data-testid="grading-recalculate-from-rubric"
                disabled={isGenerating}
                onClick={handleRecalculateFromRubric}
              >
                Recalculate from rubric scores
              </Button>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Sets the total above to what the category scores add up to (
                {rubricScaleGrade.score}). Nothing saves until you click Save.
              </p>
            </div>
          </div>
        ) : (
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
          {gradeBreakdown ? (
            <div
              className="rounded-md bg-muted/50 p-3 text-xs"
              data-testid="grading-breakdown"
            >
              <p className="mb-2 font-medium">How this adds up</p>
              <ul className="space-y-1">
                {gradeBreakdown.rows.map((row) => (
                  <li key={row.key} className="flex justify-between gap-3">
                    <span className="min-w-0 truncate text-muted-foreground">
                      {row.label}
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {row.score} of {activeRubricConfig.maxScore} ·{' '}
                      {row.percent}% · weight {row.weightShare}%
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex justify-between gap-3 border-t pt-2 font-medium tabular-nums">
                <span>Weighted total</span>
                <span>
                  {gradeBreakdown.weightedPercent}%
                  {gradeBreakdown.earnedPoints !== null
                    ? ` · ${gradeBreakdown.earnedPoints} of ${gradeBreakdown.pointValue} points`
                    : ''}
                </span>
              </div>
            </div>
          ) : null}

          {computedNumericPercentage !== null ? (
            <div>
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs"
                data-testid="grading-recalculate-from-rubric"
                disabled={isGenerating}
                onClick={handleRecalculateFromRubric}
              >
                Recalculate from rubric scores
              </Button>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Sets the overall percentage above to match the rubric scores
                below ({computedNumericPercentage}%). Rubric scores and
                comments aren't changed, and nothing saves until you click
                Save.
              </p>
            </div>
          ) : null}
        </div>
        )}

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

        <div className="space-y-2 border-t pt-4">
          <div className="text-sm font-medium">Rubric</div>
          {activeRubricConfig.source === 'thesis-default' ? (
            <div
              data-testid="teacher-grading-rubric-source-warning"
              className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3"
            >
              <Info className="mt-0.5 size-5 shrink-0 text-blue-600" />
              <div>
                <p className="text-sm font-medium">
                  Using the default thesis rubric
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground text-pretty">
                  This assignment type has no rubric of its own configured, so
                  the thesis-driven essay grading assistant rubric was applied
                  instead.
                </p>
              </div>
            </div>
          ) : null}
          {activeRubricConfig.rubricIncomplete ? (
            <div
              data-testid="teacher-grading-rubric-incomplete-warning"
              className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3"
            >
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
              <div>
                <p className="text-sm font-medium">
                  This rubric is incomplete
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground text-pretty">
                  Some categories on this assignment type are missing a name,
                  description, or weight. Grading still uses this rubric as
                  saved. Ask an admin to finish or remove the unfinished
                  categories.
                </p>
              </div>
            </div>
          ) : null}
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
              // A scale that starts at 0 makes 0 a real judgment, so
              // "scored" is the scale's own floor rather than a truthiness
              // check that would read Absent as blank.
              const hasScore = isScored(
                current.score,
                activeRubricConfig.minScore
              );
              const configuredScoreLabel = hasScore
                ? getCategoryScoreLabel(item, current.score)
                : null;
              const scoreLabel = hasScore
                ? configuredScoreLabel
                  ? `${configuredScoreLabel} (${current.score}/${activeRubricConfig.maxScore})`
                  : `${current.score}/${activeRubricConfig.maxScore}`
                : 'Not scored';
              const isGrammarCategory = isGrammarHighlightCategory(item);
              const showFeedback = isCategoryFeedbackEnabled(item);
              const scoreOptions = buildScoreOptions(
                activeRubricConfig.minScore,
                activeRubricConfig.maxScore,
                item.scoreLabels,
                activeRubricConfig.step
              );

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
                    <Select
                      value={hasScore ? current.score.toString() : ''}
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
                    {showFeedback ? (
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
                    ) : null}
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
