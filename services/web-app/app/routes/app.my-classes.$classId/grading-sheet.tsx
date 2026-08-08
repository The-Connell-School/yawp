import { useEffect, useMemo, useRef, useState } from 'react';
import { useFetcher } from 'react-router';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet';
import { Button } from '~/components/ui/button';
import { Label } from '~/components/ui/label';
import { Input } from '~/components/ui/input';
import { Textarea } from '~/components/ui/textarea';
import { Checkbox } from '~/components/ui/checkbox';
import { Badge } from '~/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import {
  computeWeightedPercentage,
  formatGrade,
  letterFromPercent,
} from '~/domain/grading/gradeMath';
import { rubricCategories as rubric } from '~/domain/grading/rubric';

type Document = {
  id: string;
  title: string;
  profile: {
    user: {
      name: string | null;
      email: string;
    };
  };
  latestSubmission?: {
    id: string;
    score: string | null;
    feedback: string | null;
    rubricScores?: unknown | null;
    overallScore?: number | null;
    overallComment?: string | null;
    numericPercentage?: number | null;
    letterGrade?: string | null;
    aiMeta?: unknown | null;
    releasedAt: Date | string | null;
    gradedAt?: Date | string | null;
  } | null;
};

type GradingSheetProps = {
  documents: Document[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
};

const scoreOptions = [
  { value: '1', label: '1 - Needs Improvement' },
  { value: '2', label: '2 - Developing' },
  { value: '3', label: '3 - Proficient' },
  { value: '4', label: '4 - Strong' },
  { value: '5', label: '5 - Exemplary' },
];

type RubricScore = {
  score: number;
  comment: string;
  isAi?: boolean;
};

const buildEmptyRubric = () =>
  rubric.reduce<Record<string, RubricScore>>((acc, item) => {
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

  for (const item of rubric) {
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

function buildGradeSignature(args: {
  overallComment: string;
  numericPercentage: number | null;
  rubricScores: Record<string, RubricScore>;
}) {
  const rubricSignature = rubric
    .map((item) => {
      const score = args.rubricScores[item.key]?.score ?? 0;
      const comment = args.rubricScores[item.key]?.comment ?? '';
      return `${item.key}:${score}:${comment}`;
    })
    .join('|');

  return [
    args.overallComment,
    args.numericPercentage === null
      ? 'null'
      : args.numericPercentage.toString(),
    rubricSignature,
  ].join('||');
}

export function GradingSheet({
  documents,
  isOpen,
  onClose,
  onSuccess,
}: GradingSheetProps) {
  const fetcher = useFetcher();
  const aiFetcher = useFetcher();
  const [numericPercentage, setNumericPercentage] = useState('');
  const [hasManualPercentOverride, setHasManualPercentOverride] =
    useState(false);
  const [releaseImmediately, setReleaseImmediately] = useState(false);
  const [rubricScores, setRubricScores] =
    useState<Record<string, RubricScore>>(buildEmptyRubric());
  const [overallComment, setOverallComment] = useState('');
  const [savedSignature, setSavedSignature] = useState('');
  const pendingSaveSignatureRef = useRef('');
  const hasProcessedSuccess = useRef(false);
  const isGenerating = aiFetcher.state !== 'idle';

  const isMultiple = documents.length > 1;
  const existingGrade = !isMultiple
    ? documents[0]?.latestSubmission
    : null;
  const isEditing = !isMultiple && !!existingGrade;

  // Initialize form with existing grade data when editing
  useEffect(() => {
    let initialOverallComment = '';
    let initialNumericPercentage = '';
    let initialNormalizedPercent: number | null = null;
    let initialRubricScores = buildEmptyRubric();

    if (isEditing && existingGrade) {
      setReleaseImmediately(!!existingGrade.releasedAt);
      initialOverallComment =
        existingGrade.overallComment || existingGrade.feedback || '';
      initialNormalizedPercent = normalizePercentage(
        existingGrade.numericPercentage
      );
      if (initialNormalizedPercent !== null) {
        initialNumericPercentage = initialNormalizedPercent.toString();
        setHasManualPercentOverride(true);
      } else {
        setHasManualPercentOverride(false);
      }
      initialRubricScores = normalizeRubricScores(existingGrade.rubricScores);

      setOverallComment(initialOverallComment);
      setNumericPercentage(initialNumericPercentage);
      setRubricScores(initialRubricScores);
      setSavedSignature(
        buildGradeSignature({
          overallComment: initialOverallComment,
          numericPercentage: initialNormalizedPercent,
          rubricScores: initialRubricScores,
        })
      );
    } else {
      setRubricScores(buildEmptyRubric());
      setOverallComment('');
      setNumericPercentage('');
      setHasManualPercentOverride(false);
      setSavedSignature(
        buildGradeSignature({
          overallComment: '',
          numericPercentage: null,
          rubricScores: buildEmptyRubric(),
        })
      );
    }
  }, [isEditing, existingGrade]);

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

  const resolvedLetterGrade = useMemo(() => {
    if (resolvedNumericPercentage === null) return null;
    return letterFromPercent(resolvedNumericPercentage);
  }, [resolvedNumericPercentage]);

  const gradeDisplay = useMemo(() => {
    return formatGrade(resolvedNumericPercentage, resolvedLetterGrade) ?? '—';
  }, [resolvedLetterGrade, resolvedNumericPercentage]);

  const currentSignature = useMemo(
    () =>
      buildGradeSignature({
        overallComment,
        numericPercentage: resolvedNumericPercentage,
        rubricScores,
      }),
    [overallComment, resolvedNumericPercentage, rubricScores]
  );

  const hasUnsavedChanges = isEditing
    ? currentSignature !== savedSignature
    : true;

  useEffect(() => {
    if (!hasManualPercentOverride && computedNumericPercentage !== null) {
      setNumericPercentage(computedNumericPercentage.toString());
    }
  }, [computedNumericPercentage, hasManualPercentOverride]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    pendingSaveSignatureRef.current = currentSignature;

    const formData = new FormData();

    const normalizedPercent =
      resolvedNumericPercentage === null ? null : resolvedNumericPercentage;
    const normalizedLetter =
      normalizedPercent === null ? null : letterFromPercent(normalizedPercent);
    const normalizedScore =
      normalizedPercent === null ? null : formatGrade(normalizedPercent);

    // Build the JSON payload for update-submission
    const payload: Record<string, unknown> = {
      feedback: overallComment,
      overallComment,
      rubricScores,
    };
    if (normalizedScore) payload.score = normalizedScore;
    if (normalizedPercent !== null) payload.numericPercentage = normalizedPercent;
    if (normalizedLetter) payload.letterGrade = normalizedLetter;
    if (!isEditing && releaseImmediately) {
      payload.releasedAt = new Date().toISOString();
    }

    if (isEditing) {
      // Update existing submission grade
      payload.submissionId = existingGrade!.id;
      fetcher.submit(JSON.stringify(payload), {
        method: 'POST',
        action: '/api/domain/update-submission',
        encType: 'application/json',
      });
    } else {
      // Grade each document's latest submission
      for (const doc of documents) {
        const submissionId = doc.latestSubmission?.id;
        if (!submissionId) continue;
        const docPayload = { ...payload, submissionId };
        fetcher.submit(JSON.stringify(docPayload), {
          method: 'POST',
          action: '/api/domain/update-submission',
          encType: 'application/json',
        });
      }
    }
  };

  // Reset form and close when submission is successful
  useEffect(() => {
    if (
      fetcher.data?.success &&
      fetcher.state === 'idle' &&
      !hasProcessedSuccess.current
    ) {
      hasProcessedSuccess.current = true;
      setReleaseImmediately(false);
      setRubricScores(buildEmptyRubric());
      setOverallComment('');
      setNumericPercentage('');
      setHasManualPercentOverride(false);
      onClose();
      onSuccess?.();
    }
  }, [fetcher.data, fetcher.state, onClose, onSuccess]);

  // Reset form when sheet closes
  useEffect(() => {
    if (!isOpen) {
      hasProcessedSuccess.current = false;
      setReleaseImmediately(false);
      setRubricScores(buildEmptyRubric());
      setOverallComment('');
      setNumericPercentage('');
      setHasManualPercentOverride(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (aiFetcher.state !== 'idle') return;

    if (aiFetcher.data?.success) {
      const aiRubricScores = normalizeRubricScores(aiFetcher.data.rubricScores);
      const aiOverallComment =
        typeof aiFetcher.data.overallComment === 'string'
          ? aiFetcher.data.overallComment
          : overallComment;
      const aiNumericPercentage =
        typeof aiFetcher.data.numericPercentage === 'number'
          ? normalizePercentage(aiFetcher.data.numericPercentage)
          : resolvedNumericPercentage;

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

      if (isEditing) {
        setSavedSignature(
          buildGradeSignature({
            overallComment: aiOverallComment,
            numericPercentage: aiNumericPercentage,
            rubricScores: aiRubricScores,
          })
        );
      }
    }

  }, [aiFetcher.data, aiFetcher.state, isEditing]);

  useEffect(() => {
    if (fetcher.data?.success && fetcher.state === 'idle') {
      setSavedSignature(pendingSaveSignatureRef.current);
    }
  }, [fetcher.data, fetcher.state]);

  const title = isEditing
    ? 'Edit Grade'
    : isMultiple
      ? `Grade ${documents.length} Essays`
      : 'Grade Essay';

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>
            {isMultiple
              ? 'Enter the same grade and feedback for all selected essays.'
              : isEditing
                ? 'Update the grade and feedback for this essay.'
                : 'Enter grade and feedback for this essay.'}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {/* Show list of essays being graded */}
          {isMultiple && (
            <div className="rounded-lg border p-4 space-y-2">
              <h4 className="text-sm font-medium">Essays to Grade:</h4>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-muted-foreground">
                      {doc.profile.user.name || doc.profile.user.email}
                    </span>
                    <span className="font-medium truncate ml-2">
                      {doc.title}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Show single essay details */}
          {!isMultiple && documents[0] && (
            <div className="rounded-lg border p-4 space-y-2">
              <div>
                <span className="text-sm text-muted-foreground">Student: </span>
                <span className="text-sm font-medium">
                  {documents[0].profile.user.name ||
                    documents[0].profile.user.email}
                </span>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">Essay: </span>
                <span className="text-sm font-medium">
                  {documents[0].title}
                </span>
              </div>
              {existingGrade && (
                <div className="pt-2 border-t">
                  <Badge
                    variant={existingGrade.releasedAt ? 'default' : 'secondary'}
                  >
                    {existingGrade.releasedAt ? 'Released' : 'Not Released'}
                  </Badge>
                </div>
              )}
            </div>
          )}

          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-medium">
                  Grading Assistant Suggestions
                </div>
                <div className="text-xs text-muted-foreground">
                  Uses the rubric to suggest scores and comments. You can edit
                  everything.
                </div>
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  if (!documents[0]) return;
                  const aiForm = new FormData();
                  aiForm.append('documentId', documents[0].id);
                  aiFetcher.submit(aiForm, {
                    method: 'POST',
                    action: '/api/domain/grade-essay-ai',
                  });
                }}
                disabled={isMultiple || isGenerating}
              >
                {isGenerating
                  ? 'Grading…'
                  : isMultiple
                    ? 'Suggestions unavailable for bulk grading'
                    : 'Grading Assistant Suggestions'}
              </Button>
            </div>
            {isMultiple && (
              <div className="text-xs text-muted-foreground">
                Suggestions are only available for single-essay grading.
              </div>
            )}
            {aiFetcher.data?.message && (
              <div
                className={`rounded-lg p-3 text-sm ${
                  aiFetcher.data.success
                    ? 'bg-blue-50 text-blue-900 border border-blue-200'
                    : 'bg-red-50 text-red-900 border border-red-200'
                }`}
              >
                {aiFetcher.data.message}
              </div>
            )}
          </div>

          {/* Grading form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">Overall Grade</div>
                  <div className="text-xs text-muted-foreground">
                    Percentage is computed from the weighted rubric. You can
                    override it.
                  </div>
                </div>
                <Badge variant="secondary" className="whitespace-nowrap">
                  {gradeDisplay}
                </Badge>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-2">
                  <Label htmlFor="numeric-percentage">Percentage</Label>
                  <Input
                    id="numeric-percentage"
                    type="number"
                    min={0}
                    max={100}
                    value={numericPercentage}
                    onChange={(e) => {
                      setNumericPercentage(e.target.value);
                      setHasManualPercentOverride(true);
                    }}
                    placeholder="e.g., 94"
                    disabled={fetcher.state !== 'idle' || isGenerating}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (computedNumericPercentage === null) return;
                    setNumericPercentage(computedNumericPercentage.toString());
                    setHasManualPercentOverride(false);
                  }}
                  disabled={
                    fetcher.state !== 'idle' ||
                    computedNumericPercentage === null ||
                    isGenerating
                  }
                >
                  Recalculate from rubric
                </Button>
              </div>
            </div>

            <div className="pt-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">Rubric Scores</div>
                  <div className="text-xs text-muted-foreground">
                    Scores are 1–5 and roll up to the overall grade.
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                {rubric.map((item) => {
                  const current = rubricScores[item.key] || {
                    score: 0,
                    comment: '',
                  };
                  return (
                    <div
                      key={item.key}
                      className="rounded-lg border bg-muted p-3 space-y-2"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="text-sm font-medium">
                            {item.label}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {item.description}
                          </div>
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
                          <SelectTrigger className="w-full sm:w-[220px]">
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
                      </div>
                      <Textarea
                        value={current.comment}
                        disabled={isGenerating || fetcher.state !== 'idle'}
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
                        rows={3}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="overall-comment">Overall Feedback</Label>
              <Textarea
                id="overall-comment"
                value={overallComment}
                onChange={(e) => setOverallComment(e.target.value)}
                placeholder="Summarize the overall feedback for the student..."
                rows={4}
                disabled={fetcher.state !== 'idle' || isGenerating}
              />
            </div>

            {!isEditing && (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="release"
                  checked={releaseImmediately}
                  onCheckedChange={(checked) =>
                    setReleaseImmediately(checked === true)
                  }
                  disabled={fetcher.state !== 'idle' || isGenerating}
                />
                <Label
                  htmlFor="release"
                  className="text-sm font-normal cursor-pointer"
                >
                  Release grade to {isMultiple ? 'students' : 'student'}{' '}
                  immediately
                </Label>
              </div>
            )}

            {fetcher.data?.message && (
              <div
                className={`rounded-lg p-3 text-sm ${
                  fetcher.data.success
                    ? 'bg-green-50 text-green-900 border border-green-200'
                    : 'bg-red-50 text-red-900 border border-red-200'
                }`}
              >
                {fetcher.data.message}
              </div>
            )}

            <div className="flex gap-2 justify-end pt-4">
              {isEditing && hasUnsavedChanges ? (
                <div className="mr-auto rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900">
                  Unsaved changes. Click Save Grade before leaving.
                </div>
              ) : null}
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={fetcher.state !== 'idle' || isGenerating}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  fetcher.state !== 'idle' ||
                  isGenerating ||
                  (isEditing && !hasUnsavedChanges)
                }
              >
                {fetcher.state !== 'idle'
                  ? 'Saving...'
                  : isEditing
                    ? 'Update Grade'
                    : isMultiple
                      ? `Grade ${documents.length} Essays`
                      : 'Save Grade'}
              </Button>
            </div>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
