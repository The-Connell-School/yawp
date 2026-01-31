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

type Document = {
  id: string;
  title: string;
  submittedSnapshotId: string | null;
  profile: {
    user: {
      name: string | null;
      email: string;
    };
  };
  submittedSnapshot?: {
    id: string;
    grades: {
      id: string;
      score: string | null;
      feedback: string | null;
      rubricScores?: unknown | null;
      overallScore?: number | null;
      overallComment?: string | null;
      aiMeta?: unknown | null;
      releasedAt: Date | string | null;
    }[];
  } | null;
};

type GradingSheetProps = {
  documents: Document[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
};

const rubric = [
  {
    key: 'thesis_and_content',
    label: 'Thesis and Content',
    description: 'Clear argument, main idea, and relevance of content.',
  },
  {
    key: 'organization_and_structure',
    label: 'Organization and Structure',
    description: 'Introduction, body, conclusion flow, and transitions.',
  },
  {
    key: 'evidence_and_support',
    label: 'Evidence and Support',
    description: 'Use of examples, quotes, reasoning, and analysis.',
  },
  {
    key: 'voice_and_style',
    label: 'Voice and Style',
    description: 'Appropriate tone, word choice, and sentence variety.',
  },
  {
    key: 'grammar_and_mechanics',
    label: 'Grammar and Mechanics',
    description: 'Sentence structure, punctuation, and spelling.',
  },
] as const;

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

export function GradingSheet({
  documents,
  isOpen,
  onClose,
  onSuccess,
}: GradingSheetProps) {
  const fetcher = useFetcher();
  const aiFetcher = useFetcher();
  const [score, setScore] = useState('');
  const [feedback, setFeedback] = useState('');
  const [releaseImmediately, setReleaseImmediately] = useState(false);
  const [rubricScores, setRubricScores] =
    useState<Record<string, RubricScore>>(buildEmptyRubric());
  const [overallComment, setOverallComment] = useState('');
  const hasProcessedSuccess = useRef(false);

  const isMultiple = documents.length > 1;
  const existingGrade = !isMultiple
    ? documents[0]?.submittedSnapshot?.grades?.[0]
    : null;
  const isEditing = !isMultiple && existingGrade;

  // Initialize form with existing grade data when editing
  useEffect(() => {
    if (isEditing && existingGrade) {
      setScore(existingGrade.score || '');
      setFeedback(existingGrade.feedback || '');
      setReleaseImmediately(!!existingGrade.releasedAt);
      setOverallComment(
        existingGrade.overallComment || existingGrade.feedback || ''
      );
      if (
        existingGrade.rubricScores &&
        typeof existingGrade.rubricScores === 'object'
      ) {
        setRubricScores({
          ...buildEmptyRubric(),
          ...(existingGrade.rubricScores as Record<string, RubricScore>),
        });
      }
    } else {
      setRubricScores(buildEmptyRubric());
      setOverallComment('');
    }
  }, [isEditing, existingGrade]);

  const computedOverallScore = useMemo(() => {
    const scores = rubric.map((item) => rubricScores[item.key]?.score || 0);
    const validScores = scores.filter((scoreValue) => scoreValue > 0);
    if (validScores.length === 0) return null;
    const average =
      validScores.reduce((sum, val) => sum + val, 0) / validScores.length;
    return Math.round(average);
  }, [rubricScores]);

  // Sync score field when rubric-computed score changes
  useEffect(() => {
    if (computedOverallScore !== null) {
      setScore(`${computedOverallScore}/5`);
    }
  }, [computedOverallScore]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const formData = new FormData();

    if (isEditing) {
      // Update existing grade
      formData.append('gradeId', existingGrade!.id);
      formData.append('score', score);
      formData.append('feedback', feedback || overallComment);
      formData.append('rubricScores', JSON.stringify(rubricScores));
      if (computedOverallScore !== null) {
        formData.append('overallScore', computedOverallScore.toString());
      }
      formData.append('overallComment', overallComment);

      fetcher.submit(formData, {
        method: 'POST',
        action: '/api/domain/update-grade',
      });
    } else {
      // Create new grade(s)
      documents.forEach((doc) => {
        formData.append('documentIds', doc.id);
      });
      formData.append('score', score);
      formData.append('feedback', feedback || overallComment);
      formData.append('rubricScores', JSON.stringify(rubricScores));
      if (computedOverallScore !== null) {
        formData.append('overallScore', computedOverallScore.toString());
      }
      formData.append('overallComment', overallComment);
      if (releaseImmediately) {
        formData.append('releaseImmediately', 'on');
      }

      fetcher.submit(formData, {
        method: 'POST',
        action: '/api/domain/grade-essay',
      });
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
      setScore('');
      setFeedback('');
      setReleaseImmediately(false);
      setRubricScores(buildEmptyRubric());
      setOverallComment('');
      onClose();
      onSuccess?.();
    }
  }, [fetcher.data, fetcher.state, onClose, onSuccess]);

  // Reset form when sheet closes
  useEffect(() => {
    if (!isOpen) {
      hasProcessedSuccess.current = false;
      setScore('');
      setFeedback('');
      setReleaseImmediately(false);
      setRubricScores(buildEmptyRubric());
      setOverallComment('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (aiFetcher.data?.success && aiFetcher.state === 'idle') {
      if (aiFetcher.data.rubricScores) {
        setRubricScores({
          ...buildEmptyRubric(),
          ...(aiFetcher.data.rubricScores as Record<string, RubricScore>),
        });
      }
      if (typeof aiFetcher.data.overallComment === 'string') {
        setOverallComment(aiFetcher.data.overallComment);
        setFeedback(aiFetcher.data.overallComment);
      }
      if (typeof aiFetcher.data.overallScore === 'number') {
        setScore(`${aiFetcher.data.overallScore}/5`);
      }
    }
  }, [aiFetcher.data, aiFetcher.state]);

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
                <div className="text-sm font-medium">AI Suggestions</div>
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
                disabled={isMultiple || aiFetcher.state !== 'idle'}
              >
                {aiFetcher.state !== 'idle'
                  ? 'Generating...'
                  : isMultiple
                    ? 'AI suggestions unavailable for bulk grading'
                    : 'Generate AI Suggestions'}
              </Button>
            </div>
            {isMultiple && (
              <div className="text-xs text-muted-foreground">
                AI suggestions are only available for single-essay grading.
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
            <div className="space-y-2">
              <Label htmlFor="score">
                Score/Grade{' '}
                <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="score"
                value={score}
                onChange={(e) => setScore(e.target.value)}
                placeholder="e.g., A+, 95/100, Excellent"
                disabled={fetcher.state !== 'idle'}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="feedback">
                Feedback{' '}
                <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id="feedback"
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Enter your feedback for the student..."
                rows={8}
                disabled={fetcher.state !== 'idle'}
              />
              <p className="text-xs text-muted-foreground">
                {isMultiple
                  ? 'This feedback will be applied to all selected essays.'
                  : 'Provide constructive feedback to help the student improve.'}
              </p>
            </div>

            <div className="pt-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">Rubric Scores</div>
                  <div className="text-xs text-muted-foreground">
                    Scores are 1–5 and roll up to the overall grade.
                  </div>
                </div>
                <div className="text-sm font-medium">
                  Overall Score:{' '}
                  <span className="text-muted-foreground">
                    {computedOverallScore !== null ? `${computedOverallScore}/5` : '—'}
                  </span>
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
                        disabled={fetcher.state !== 'idle'}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="overall-comment">
                Overall Feedback{' '}
                <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id="overall-comment"
                value={overallComment}
                onChange={(e) => setOverallComment(e.target.value)}
                placeholder="Summarize the overall feedback for the student..."
                rows={4}
                disabled={fetcher.state !== 'idle'}
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
                  disabled={fetcher.state !== 'idle'}
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
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={fetcher.state !== 'idle'}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={fetcher.state !== 'idle'}>
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
