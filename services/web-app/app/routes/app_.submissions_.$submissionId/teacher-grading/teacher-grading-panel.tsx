import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
  mergeRubricDisplayPickerRestrictions,
  normalizeRubricDisplayConfig,
  normalizeRubricScoresForCategories,
  toPersistedRubricScores,
  type RubricDisplayConfig,
  type RubricScore,
} from '~/domain/grading/rubric-display';
import { rubricScaleGradeFieldsFromScores } from '~/domain/grading/recorded-grade';
import { isHolisticTierScoringMode } from '~/domain/grading/scoring-mode';
import {
  getCategoryScoreBand,
  getCategoryScoreLabel,
  getCategoryScoreBounds,
  isBandScoredRubric,
  isCategoryFeedbackEnabled,
  isGrammarHighlightCategory,
} from '~/domain/assignment-types/rubric-category-options';
import {
  computeWeightedBandPercentage,
  computeWeightedPercentageForCategories,
  formatAssignmentGrade,
  assignmentPointTotal,
  isPointsScaleScoringType,
  parsePointScore,
  scalePointScore,
  letterFromPercent,
} from '~/domain/grading/gradeMath';
import {
  type GrammarIssue,
  parseGrammarIssuesPayload,
} from '~/domain/grading/grammarIssues';
import type { AssistantSuggestion } from '~/domain/grading/assistant-suggestion';
import {
  DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL,
  getGradingAssistantStrictnessLabel,
  gradingAssistantStrictnessOptions,
  parseGradingAssistantStrictnessLevel,
  type GradingAssistantStrictnessLevel,
} from '~/domain/grading/grading-assistant-strictness';
import { AlertTriangle, Loader2, TrendingUp } from 'lucide-react';
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

/**
 * Puts the Grading Assistant's own suggestions back after a teacher has edited
 * them. It replaced a "recalculate from rubric scores" link, which recomputed
 * the total from whatever was on screen — a different thing that read as the
 * same thing.
 */
function ResetToAssistantSuggestions({
  disabled,
  available,
  onReset,
}: {
  disabled: boolean;
  available: boolean;
  onReset: () => void;
}) {
  if (!available) return null;

  return (
    <div>
      <Button
        type="button"
        variant="link"
        size="sm"
        className="h-auto p-0 text-xs"
        data-testid="grading-reset-to-assistant-suggestions"
        disabled={disabled}
        onClick={onReset}
      >
        Reset Grading Assistant suggestions
      </Button>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Use this if you&apos;ve made changes and want to revert to the original
        Grading Assistant suggestions. Nothing saves until you click Save.
      </p>
    </div>
  );
}

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
  assistantSuggestion,
  initialGradingAssistantStrictnessLevel,
  hideHeader = false,
  onHeaderStateChange,
}: {
  documentId: string;
  submissionId: string | null;
  existingGrade:
    | {
        id: string;
        updatedAt?: Date | string | null;
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
  pointValue?: number | null;
  /**
   * What the Grading Assistant last suggested for this submission, if it has
   * ever run. Absent means the reset action has nothing to restore and is
   * not offered.
   */
  assistantSuggestion?: AssistantSuggestion | null;
  initialGradingAssistantStrictnessLevel?: string | null;
  hideHeader?: boolean;
  onHeaderStateChange?: (state: TeacherGradingPanelHeaderState) => void;
}) {
  const aiFetcher = useFetcher();
  const targetSubmissionId = existingGrade?.id ?? submissionId;
  const { save: autoSave, status: autoSaveStatus } = useUpdateSubmission(
    targetSubmissionId ?? '',
    existingGrade?.updatedAt ?? null
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
   * The editable total-points score: seeded from what the category scores add
   * up to, and left alone once the teacher types their own number.
   */
  const [overallScoreInput, setOverallScoreInput] = useState('');
  const [sessionSuggestion, setSessionSuggestion] =
    useState<AssistantSuggestion | null>(null);
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
  const isRawPoints = isPointsScaleScoringType(activeRubricConfig.scoringType) || activeRubricConfig.scoringType === 'act_writing_2_12';
  const isHolisticTier = isHolisticTierScoringMode(activeRubricConfig.scoringMode);
  const suppressPercentAndLetter = isRawPoints || isHolisticTier;
  const computedNumericPercentage = useMemo(() => {
    if (isRawPoints) return null;
    // A rubric whose categories declare bands is already scored as a
    // percentage, so its overall grade is the weighted average with nothing
    // converted. Everything else keeps the 1-5 mapping.
    if (isBandScoredRubric(activeRubricConfig.categories)) {
      return computeWeightedBandPercentage(
        rubricScores as unknown as Record<string, unknown>,
        activeRubricConfig.categories
      );
    }
    if (activeRubricConfig.scoringType !== 'weighted_1_5') return null;
    return computeWeightedPercentageForCategories(
      rubricScores as unknown as Record<string, unknown>,
      activeRubricConfig.categories
    );
  }, [activeRubricConfig, rubricScores, isRawPoints]);

  /**
   * The grade this rubric produces on a scale that reports raw points (Daily
   * Pages, ACT writing). Null on configured scales, whose displayed grade
   * comes from the total-points field.
   */
  const rubricScaleGrade = useMemo(() => {
    const grade = rubricScaleGradeFieldsFromScores({
      rubricScores, categories: activeRubricConfig.categories,
      minScore: activeRubricConfig.minScore, maxScore: activeRubricConfig.maxScore,
      scoringType: activeRubricConfig.scoringType,
    });
    if (!grade) return null;
    const scaled = scalePointScore(grade.score, pointValue)!;
    return { ...grade, overallScore: scaled.earned, score: `${scaled.earned}/${scaled.possible}` };
  }, [activeRubricConfig, rubricScores, pointValue]);

  const resolvedNumericPercentage = useMemo(() => {
    if (isRawPoints || numericPercentage === '') return null;
    const raw = Number(numericPercentage);
    if (!Number.isFinite(raw)) return null;
    const clamped = Math.max(0, Math.min(100, Math.round(raw)));
    return clamped;
  }, [numericPercentage, isRawPoints]);

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
        overallScore: hasManualScoreOverride ? overallScoreInput : '',
        grammarIssues,
      }),
    [
      grammarIssues,
      hasManualScoreOverride,
      numericPercentage,
      overallComment,
      overallScoreInput,
      rubricScores,
    ]
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
        pointValue,
        initialGradingAssistantStrictnessLevel,
      }),
    [
      existingGrade,
      initialGradingAssistantStrictnessLevel,
      propRubricConfig,
      pointValue,
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
    let initialOverallScore = '';
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
      // A points-scale grade is stored as "20/30". Reading it back is what
      // makes reopening the form show the total that was saved rather than
      // recomputing one from the category scores.
      const savedScaleScore = scalePointScore(existingGrade.score, pointValue);
      if (savedScaleScore && (initialNormalizedPercent === null || parsePointScore(existingGrade.score)?.possible === pointValue)) {
        initialOverallScore = String(savedScaleScore.earned);
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
    setOverallScoreInput(initialOverallScore);
    setHasManualScoreOverride(initialOverallScore !== '');
    setSavedSnapshot(
      buildGradingFormSnapshot({
        rubricScores: initialRubricScores,
        overallScore: initialOverallScore,
        overallComment: initialOverallComment,
        numericPercentage: initialNumericPercentage,
        grammarIssues,
      })
    );
  }, [existingGrade, grammarIssues, initializationKey, propRubricConfig, pointValue]);

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
      aiFetcher.submit(
        cloneFormDataWithFallbackRetry(pendingAiFormRef.current),
        {
          method: 'POST',
          action: '/api/domain/grade-essay-ai',
        }
      );
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
    setSessionSuggestion({
      rubricScores: d.rubricScores ?? null,
      overallComment:
        typeof d.overallComment === 'string' ? d.overallComment : null,
      numericPercentage:
        typeof d.numericPercentage === 'number' ? d.numericPercentage : null,
      score: typeof d.score === 'string' ? d.score : null,
      letterGrade: typeof d.letterGrade === 'string' ? d.letterGrade : null,
      grammarIssues: d.grammarIssues ?? null,
    });
    const nextRubricConfig = mergeRubricDisplayPickerRestrictions(
      normalizeRubricDisplayConfig(
        d.rubricConfig ?? legacyRubricDisplayConfig
      ),
      propRubricConfig
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
    setNumericPercentage(typeof d.numericPercentage === 'number' ? String(d.numericPercentage) : '');
    setHasManualPercentOverride(false);
    const suggestedPoints = scalePointScore(d.score, pointValue);
    setOverallScoreInput(suggestedPoints ? String(suggestedPoints.earned) : '');
    setHasManualScoreOverride(suggestedPoints !== null);
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
        overallScore: suggestedPoints ? String(suggestedPoints.earned) : '',
        grammarIssues: parseGrammarIssuesPayload(d.grammarIssues),
      })
    );

    pendingAiFormRef.current = null;
    hasRetriedAiFormRef.current = false;
    setIsAiRetrying(false);
  }, [aiFetcher.data, aiFetcher.state, onGrammarIssuesChange, pointValue]);

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
    const percent = suppressPercentAndLetter
      ? null
      : manualScaleScore !== null && scaleScoreOutOf !== null
        ? Math.round(manualScaleScore / scaleScoreOutOf * 100)
        : trimmedPercent !== '' && Number.isFinite(rawPercent)
          ? Math.max(0, Math.min(100, Math.round(rawPercent)))
          : null;
    const letter = percent === null ? null : letterFromPercent(percent);

    // What the teacher's own scores are worth on this rubric's scale. Raw
    // point rubrics produce their own grade; configured rubrics use this to
    // derive the displayed total-points score.
    const scaleGrade = rubricScaleGradeFieldsFromScores({
      rubricScores: effectiveRubric,
      categories: activeRubricConfig.categories,
      minScore: activeRubricConfig.minScore,
      maxScore: activeRubricConfig.maxScore,
      scoringType: activeRubricConfig.scoringType,
    });

    const savedForm = savedSnapshot
      ? (JSON.parse(savedSnapshot) as {
          rubricScores: Record<string, RubricScore>;
          grammarIssues: GrammarIssue[];
        })
      : null;
    const rubricChanged =
      savedForm == null ||
      JSON.stringify(effectiveRubric) !==
        JSON.stringify(savedForm.rubricScores);
    const grammarChanged =
      savedForm == null ||
      JSON.stringify(effectiveGrammarIssues) !==
        JSON.stringify(savedForm.grammarIssues);

    const payload: Record<string, unknown> = {
      feedback: effectiveComment,
      overallComment: effectiveComment,
      ...(rubricChanged
        ? {
            rubricScores: toPersistedRubricScores(
              effectiveRubric,
              activeRubricConfig.minScore
            ),
          }
        : {}),
      ...(grammarChanged ? { grammarIssues: effectiveGrammarIssues } : {}),
    };
    const scaled = scalePointScore(scaleGrade?.score, pointValue);
    const derivedScaleScore =
      manualScaleScore ??
      (scaled ? scaled.earned : null) ??
      (!isRawPoints && percent !== null && scaleScoreOutOf !== null
        ? Math.round((percent / 100) * scaleScoreOutOf)
        : null);
    if (derivedScaleScore !== null && scaleScoreOutOf !== null) {
      payload.overallScore = derivedScaleScore;
      payload.score = `${derivedScaleScore}/${scaleScoreOutOf}`;
      if (!suppressPercentAndLetter) {
        payload.numericPercentage = percent;
        payload.letterGrade = letter;
      } else {
        payload.numericPercentage = null;
        payload.letterGrade = null;
      }
    } else if (scaled) {
      payload.overallScore = scaled.earned;
      payload.score = `${scaled.earned}/${scaled.possible}`;
      payload.numericPercentage = null;
      payload.letterGrade = null;
    } else if (existingGrade?.score) {
      payload.score = existingGrade.score;
    }

    return autoSave(payload).then(() => {
      setSavedSnapshot(
        buildGradingFormSnapshot({
          rubricScores: effectiveRubric,
          overallComment: effectiveComment,
          numericPercentage: effectivePercentStr,
          overallScore: hasManualScoreOverride ? overallScoreInput : '',
          grammarIssues: effectiveGrammarIssues,
        })
      );
    });
  };

  /**
   * Mirror computed rubric points until the teacher enters an overall total.
   * Category values keep the scale recorded in their rubric snapshot.
   */
  useEffect(() => {
    if (hasManualScoreOverride) return;
    if (rubricScaleGrade) {
      setOverallScoreInput(String(rubricScaleGrade.overallScore));
    } else if (!isRawPoints && resolvedNumericPercentage !== null) {
      setOverallScoreInput(String(Math.round(resolvedNumericPercentage / 100 * assignmentPointTotal(pointValue, 100))));
    }
  }, [rubricScaleGrade, hasManualScoreOverride, isRawPoints, resolvedNumericPercentage, pointValue]);

  const scaleScoreOutOf = assignmentPointTotal(pointValue,
    isRawPoints ? (activeRubricConfig.scoringType === 'act_writing_2_12' ? 12 : activeRubricConfig.maxScore) : 100);

  /**
   * Configured assignments accept whole points from zero to their total.
   * Unconfigured legacy raw scales retain their original range and step.
   */
  const totalPointsBounds = useMemo(() => {
    if (scaleScoreOutOf === null) return null;
    const isRubricRange = scaleScoreOutOf === activeRubricConfig.maxScore;
    return {
      min: isRawPoints && pointValue == null && isRubricRange ? activeRubricConfig.minScore : 0,
      max: scaleScoreOutOf,
      step: pointValue != null ? 1 : isRubricRange ? (activeRubricConfig.step ?? 1) : 1,
    };
  }, [scaleScoreOutOf, activeRubricConfig, pointValue, isRawPoints]);

  /**
   * The total the teacher typed, snapped onto the scale — null while the field
   * is still mirroring the category scores. Saving and the view-mode grade both
   * read this, so the number on screen after Save is the number that was
   * written.
   */
  const manualScaleScore = useMemo(() => {
    const typed = Number(overallScoreInput.trim());
    if (
      !hasManualScoreOverride ||
      overallScoreInput.trim() === '' ||
      !Number.isFinite(typed) ||
      scaleScoreOutOf === null
    ) {
      return null;
    }
    return snapToScaleValue(typed, totalPointsBounds, scaleScoreOutOf);
  }, [
    hasManualScoreOverride,
    overallScoreInput,
    scaleScoreOutOf,
    totalPointsBounds,
  ]);

  const gradeDisplay = formatAssignmentGrade({
    submitForGrade: true,
    numericPercentage: resolvedNumericPercentage,
    pointValue: pointValue ?? (isRawPoints ? null : 100),
    score: manualScaleScore !== null ? `${manualScaleScore}/${scaleScoreOutOf}` : rubricScaleGrade?.score ?? existingGrade?.score,
  }) ?? '—';

  /**
   * The suggestions to restore: whatever the assistant produced in this
   * session if it has just run, otherwise the copy kept with the last run, so
   * the action survives a reload.
   */
  const restorableSuggestion = sessionSuggestion ?? assistantSuggestion ?? null;

  const handleResetToAssistantSuggestions = () => {
    if (!restorableSuggestion) return;

    setRubricScores(
      normalizeRubricScoresForCategories({
        raw: restorableSuggestion.rubricScores,
        categories: activeRubricConfig.categories,
        minScore: activeRubricConfig.minScore,
        maxScore: activeRubricConfig.maxScore,
      })
    );

    if (typeof restorableSuggestion.overallComment === 'string') {
      setOverallComment(restorableSuggestion.overallComment);
    }

    if (typeof restorableSuggestion.numericPercentage === 'number') {
      setNumericPercentage(String(restorableSuggestion.numericPercentage));
      setHasManualPercentOverride(true);
    }

    const suggestedPoints = scalePointScore(restorableSuggestion.score, pointValue);
    setOverallScoreInput(suggestedPoints ? String(suggestedPoints.earned) : '');
    setHasManualScoreOverride(suggestedPoints !== null);
    if (isRawPoints) {
      setNumericPercentage('');
      setHasManualPercentOverride(false);
    }

    onGrammarIssuesChange(
      parseGrammarIssuesPayload(restorableSuggestion.grammarIssues)
    );
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
      if (
        typeof document !== 'undefined' &&
        document.documentElement.getAttribute('data-e2e-force-grading-fixture') ===
          'true'
      ) {
        aiForm.append('e2eForceGradingFixture', 'true');
      }
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

  const saveAllRef = useRef(saveAll);
  saveAllRef.current = saveAll;
  const saveDraft = useCallback(() => saveAllRef.current(), []);

  const buildSavedGradeSnapshot = useCallback((): SavedGradeSnapshot => {
    const percent = suppressPercentAndLetter
      ? null
      : manualScaleScore !== null
        ? Math.round(manualScaleScore / scaleScoreOutOf * 100)
        : resolvedNumericPercentage;
    const letter = percent === null ? null : letterFromPercent(percent);
    const scaleScore =
      manualScaleScore ??
      rubricScaleGrade?.overallScore ??
      (!isRawPoints && percent !== null && scaleScoreOutOf !== null
        ? Math.round((percent / 100) * scaleScoreOutOf)
        : null);
    const scaleScoreText =
      scaleScore !== null && scaleScoreOutOf !== null
        ? `${scaleScore}/${scaleScoreOutOf}`
        : rubricScaleGrade?.score;
    return {
      numericPercentage: percent,
      letterGrade: letter,
      overallScore: scaleScore,
      score: scaleScoreText || existingGrade?.score || '',
      overallComment,
      rubricScores,
    };
  }, [
    existingGrade?.score,
    suppressPercentAndLetter,
    manualScaleScore,
    overallComment,
    resolvedNumericPercentage,
    rubricScaleGrade,
    rubricScores,
    scaleScoreOutOf,
  ]);
  const savedGradeSnapshotRef = useRef(buildSavedGradeSnapshot);
  savedGradeSnapshotRef.current = buildSavedGradeSnapshot;
  const getSavedGradeSnapshot = useCallback(
    () => savedGradeSnapshotRef.current(),
    []
  );

  const discardDraft = useCallback(() => {
    if (!savedSnapshot) return;
    try {
      const parsed = JSON.parse(savedSnapshot) as {
        rubricScores: Record<string, RubricScore>;
        overallComment: string;
        numericPercentage: string;
        overallScore?: string;
        grammarIssues: GrammarIssue[];
      };
      setRubricScores(parsed.rubricScores);
      setOverallComment(parsed.overallComment);
      setNumericPercentage(parsed.numericPercentage);
      setOverallScoreInput(parsed.overallScore ?? '');
      setHasManualScoreOverride(Boolean(parsed.overallScore));
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
      // A grade exists when this rubric's own scale has produced one.
      hasGrade: manualScaleScore !== null || resolvedNumericPercentage !== null || rubricScaleGrade !== null,
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
      manualScaleScore,
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
                          contentProps={{
                            side: 'bottom',
                            className: 'max-w-xs',
                          }}
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
        {/* A points scale records earned points directly, so it gets the grade
            its own scale produces. */}
        {isRawPoints ? (
          <div className="space-y-2">
            <Label htmlFor="overall-score">
              Total points
              {scaleScoreOutOf === null ? '' : ` (out of ${scaleScoreOutOf})`}
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
                if (
                  e.currentTarget.value.trim() !== '' &&
                  Number.isFinite(typed)
                ) {
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
            <ResetToAssistantSuggestions
              disabled={isGenerating}
              available={restorableSuggestion !== null}
              onReset={handleResetToAssistantSuggestions}
            />
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="overall-points">
                Total points (out of {scaleScoreOutOf})
              </Label>
            </div>
            <Input
              id="overall-points"
              data-testid="grading-overall-points"
              type="number"
              min={0}
              max={scaleScoreOutOf}
              step={1}
              value={overallScoreInput}
              disabled={isGenerating}
              onChange={(e) => {
                setOverallScoreInput(e.target.value);
                setHasManualScoreOverride(true);
              }}
              onBlur={(e) => {
                const typed = Number(e.currentTarget.value.trim());
                if (e.currentTarget.value.trim() !== '' && Number.isFinite(typed)) {
                  setOverallScoreInput(String(snapToScaleValue(typed, totalPointsBounds, scaleScoreOutOf)));
                }
                if (!hideHeader) {
                  void saveAll();
                }
              }}
            />
            {computedNumericPercentage !== null ? (
              <ResetToAssistantSuggestions
                disabled={isGenerating}
                available={restorableSuggestion !== null}
                onReset={handleResetToAssistantSuggestions}
              />
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
          {activeRubricConfig.rubricIncomplete ? (
            <div
              data-testid="teacher-grading-rubric-incomplete-warning"
              className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3"
            >
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
              <div>
                <p className="text-sm font-medium">This rubric is incomplete</p>
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
                // Scoring a category hands the total back to the categories,
                // which is also what clears a stale total recorded before
                // these scores were touched.
                setHasManualScoreOverride(false);
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
              // Display-only rename for Daily Pages engagement tiers.
              const mapDailyPagesBandTitle = (label: string | null) => {
                switch (label) {
                  case 'ALL IN':
                    return 'Excellent';
                  case 'SHOWED UP':
                    return 'Good';
                  case 'HARDLY THERE':
                    return 'Needs Improvement';
                  case 'NOT HANDED IN':
                    return 'Absent/Missing';
                  default:
                    return label;
                }
              };
              const configuredScoreLabel = hasScore
                ? getCategoryScoreLabel(item, current.score) ??
                  getCategoryScoreBand(item, current.score)?.label ??
                  null
                : null;
              const categoryBounds = getCategoryScoreBounds(item);
              const categoryMaxScore =
                categoryBounds?.max ?? activeRubricConfig.maxScore;
              const effectiveLabel = mapDailyPagesBandTitle(configuredScoreLabel);
              const scoreLabel = hasScore
                ? effectiveLabel
                  ? `${effectiveLabel} (${current.score}/${categoryMaxScore})`
                  : `${current.score}/${categoryMaxScore}`
                : 'Not scored';
              const isGrammarCategory = isGrammarHighlightCategory(item);
              const showFeedback = isCategoryFeedbackEnabled(item);
              const scoreOptions = buildScoreOptions(
                activeRubricConfig.minScore,
                activeRubricConfig.maxScore,
                item.scoreLabels,
                activeRubricConfig.step,
                item.bands,
                item.allowedScores
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
