import { useEffect, useMemo, useState } from 'react';
import { useFetcher } from 'react-router';
import { Button } from '~/components/ui/button';
import { Badge } from '~/components/ui/badge';
import { Label } from '~/components/ui/label';
import { Textarea } from '~/components/ui/textarea';
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
import { Loader2 } from 'lucide-react';
import { cn } from '~/utils/misc';
import { apRubricRows, type ApRubricKey } from '~/domain/grading/ap-rubric';
import { useUpdateSubmission } from './use-update-submission';

type ApRubricScore = {
  score: number;
  comment: string;
  isAi?: boolean;
};

type DetectorFlag = {
  detectorId: string;
  severity: string;
  message: string;
  suggestedFix?: string;
};

function buildEmptyApRubric(): Record<string, ApRubricScore> {
  return apRubricRows.reduce<Record<string, ApRubricScore>>((acc, row) => {
    acc[row.key] = { score: 0, comment: '' };
    return acc;
  }, {});
}

function normalizeApRubric(raw: unknown): Record<string, ApRubricScore> {
  const normalized = buildEmptyApRubric();
  if (!raw || typeof raw !== 'object') return normalized;

  for (const row of apRubricRows) {
    const candidate = (raw as Record<string, unknown>)[row.key];
    if (!candidate || typeof candidate !== 'object') continue;

    const scoreValue = (candidate as { score?: unknown }).score;
    const commentValue = (candidate as { comment?: unknown }).comment;

    normalized[row.key] = {
      score:
        typeof scoreValue === 'number' && Number.isFinite(scoreValue)
          ? Math.max(0, Math.min(row.maxPoints, Math.round(scoreValue)))
          : 0,
      comment: typeof commentValue === 'string' ? commentValue : '',
      isAi: Boolean((candidate as { isAi?: unknown }).isAi),
    };
  }

  return normalized;
}

function extractDetectors(raw: unknown): DetectorFlag[] {
  if (!raw || typeof raw !== 'object') return [];
  const detectors = (raw as { detectors?: unknown }).detectors;
  if (!Array.isArray(detectors)) return [];
  return detectors.filter(
    (d): d is DetectorFlag =>
      !!d && typeof d === 'object' && typeof (d as DetectorFlag).message === 'string'
  );
}

function scoreOptionsFor(maxPoints: number) {
  return Array.from({ length: maxPoints + 1 }, (_, i) => ({
    value: i.toString(),
    label: `${i}`,
  }));
}

export function ApGradingPanel({
  documentId,
  submissionId,
  existingGrade,
}: {
  documentId: string;
  submissionId: string | null;
  existingGrade:
    | {
        id: string;
        rubricScores?: unknown | null;
        overallComment?: string | null;
        feedback?: string | null;
      }
    | null
    | undefined;
}) {
  const aiFetcher = useFetcher();
  const targetSubmissionId = existingGrade?.id ?? submissionId;
  const { save: autoSave, status: autoSaveStatus } = useUpdateSubmission(
    targetSubmissionId ?? ''
  );

  const [rubricScores, setRubricScores] =
    useState<Record<string, ApRubricScore>>(buildEmptyApRubric());
  const [overallComment, setOverallComment] = useState('');
  const [detectors, setDetectors] = useState<DetectorFlag[]>([]);

  const total = useMemo(
    () =>
      apRubricRows.reduce(
        (sum, row) => sum + (rubricScores[row.key]?.score ?? 0),
        0
      ),
    [rubricScores]
  );

  const isGenerating = aiFetcher.state !== 'idle';

  useEffect(() => {
    if (existingGrade) {
      setOverallComment(
        existingGrade.overallComment || existingGrade.feedback || ''
      );
      setRubricScores(normalizeApRubric(existingGrade.rubricScores));
      setDetectors(extractDetectors(existingGrade.rubricScores));
    } else {
      setOverallComment('');
      setRubricScores(buildEmptyApRubric());
      setDetectors([]);
    }
  }, [existingGrade, submissionId]);

  useEffect(() => {
    if (!aiFetcher.data?.success || aiFetcher.state !== 'idle') return;
    const d = aiFetcher.data;
    setRubricScores(normalizeApRubric(d.rubricScores));
    setDetectors(extractDetectors(d.rubricScores));
    if (typeof d.overallComment === 'string') {
      setOverallComment(d.overallComment);
    }
  }, [aiFetcher.data, aiFetcher.state]);

  const saveAll = (
    overrideRubric?: Record<string, ApRubricScore>,
    overrideComment?: string
  ) => {
    if (!targetSubmissionId) return;
    const effectiveRubric = overrideRubric ?? rubricScores;
    const effectiveComment = overrideComment ?? overallComment;
    const effectiveTotal = apRubricRows.reduce(
      (sum, row) => sum + (effectiveRubric[row.key]?.score ?? 0),
      0
    );

    void autoSave({
      feedback: effectiveComment,
      overallComment: effectiveComment,
      rubricScores: { ...effectiveRubric, ...(detectors.length ? { detectors } : {}) },
      overallScore: effectiveTotal,
      score: `${effectiveTotal}/6`,
    });
  };

  const generateAiSuggestions = () => {
    const aiForm = new FormData();
    if (submissionId) {
      aiForm.append('submissionId', submissionId);
    } else {
      aiForm.append('documentId', documentId);
    }
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
          <div className="text-sm font-semibold">AP Rubric Grading</div>
          <span
            data-testid="ap-grading-auto-save-status"
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
        <div className="flex items-center justify-between gap-2">
          <Badge variant="secondary" className="bg-purple-100 text-purple-800">
            {total}/6
          </Badge>
          <Button
            size="sm"
            variant="default"
            data-testid="ap-grading-assistant-generate"
            disabled={isGenerating}
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
        </div>
      </div>

      <div className="no-scrollbar flex-1 overflow-y-auto p-3 space-y-4">
        {detectors.length > 0 && (
          <div className="space-y-2 rounded-lg border border-yellow-300 bg-yellow-50/60 p-3">
            <div className="text-xs font-semibold text-yellow-800">
              Things to watch ({detectors.length})
            </div>
            {detectors.map((flag, i) => (
              <div key={`${flag.detectorId}-${i}`} className="text-xs text-yellow-900">
                <p>{flag.message}</p>
                {flag.suggestedFix && (
                  <p className="mt-0.5 italic text-yellow-700">
                    {flag.suggestedFix}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="ap-overall-comment">Overall Feedback</Label>
          <Textarea
            id="ap-overall-comment"
            data-testid="ap-grading-overall-comment"
            value={overallComment}
            disabled={isGenerating}
            onChange={(e) => setOverallComment(e.target.value)}
            onBlur={() => saveAll()}
            rows={4}
            placeholder="Write overall feedback..."
          />
        </div>

        <div className="space-y-3">
          <div className="text-sm font-medium">Rubric (6 points)</div>
          <Accordion type="multiple" className="w-full rounded-lg bg-white">
            {apRubricRows.map((row) => {
              const current = rubricScores[row.key] || { score: 0, comment: '' };
              return (
                <AccordionItem key={row.key} value={row.key} className="last:border-b-0">
                  <AccordionTrigger className="py-3 hover:no-underline">
                    <div className="flex w-full items-center justify-between gap-3 pr-2">
                      <div className="text-sm font-medium">{row.label}</div>
                      <span className="text-xs font-medium text-muted-foreground">
                        {current.score}/{row.maxPoints}
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-2 pb-3">
                    <Select
                      value={current.score.toString()}
                      disabled={isGenerating}
                      onValueChange={(value) => {
                        const newRubric = {
                          ...rubricScores,
                          [row.key]: {
                            ...rubricScores[row.key],
                            score: Number(value),
                            isAi: false,
                          },
                        };
                        setRubricScores(newRubric);
                        saveAll(newRubric);
                      }}
                    >
                      <SelectTrigger
                        className="w-full"
                        data-testid={`ap-grading-rubric-score-${row.key}`}
                      >
                        <SelectValue placeholder="Select points" />
                      </SelectTrigger>
                      <SelectContent>
                        {scoreOptionsFor(row.maxPoints).map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Textarea
                      data-testid={`ap-grading-rubric-comment-${row.key}`}
                      value={current.comment}
                      disabled={isGenerating}
                      onChange={(e) =>
                        setRubricScores((prev) => ({
                          ...prev,
                          [row.key]: {
                            ...prev[row.key],
                            comment: e.target.value,
                            isAi: false,
                          },
                        }))
                      }
                      onBlur={() => saveAll()}
                      placeholder="Enter feedback for this row..."
                      rows={3}
                    />
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

export type { ApRubricKey };
