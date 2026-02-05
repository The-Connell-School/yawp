import { useEffect, useMemo, useRef, useState } from 'react';
import { useFetcher } from 'react-router';
import { Button } from '~/components/ui/button';
import { Badge } from '~/components/ui/badge';
import { Label } from '~/components/ui/label';
import { Input } from '~/components/ui/input';
import { Textarea } from '~/components/ui/textarea';
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

export function TeacherGradingPanel({
  documentId,
  existingGrade,
}: {
  documentId: string;
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
}) {
  const aiFetcher = useFetcher();
  const saveFetcher = useFetcher();
  const [rubricScores, setRubricScores] =
    useState<Record<string, RubricScore>>(buildEmptyRubric());
  const [overallComment, setOverallComment] = useState('');
  const [numericPercentage, setNumericPercentage] = useState('');
  const [hasManualPercentOverride, setHasManualPercentOverride] =
    useState(false);
  const hasInitialized = useRef(false);

  const computedNumericPercentage = useMemo(() => {
    return computeWeightedPercentage(rubricScores as unknown as Record<
      string,
      unknown
    >);
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

  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    if (existingGrade) {
      setOverallComment(existingGrade.overallComment || existingGrade.feedback || '');
      if (typeof existingGrade.numericPercentage === 'number') {
        setNumericPercentage(existingGrade.numericPercentage.toString());
        setHasManualPercentOverride(true);
      }
      if (existingGrade.rubricScores && typeof existingGrade.rubricScores === 'object') {
        setRubricScores({
          ...buildEmptyRubric(),
          ...(existingGrade.rubricScores as Record<string, RubricScore>),
        });
      }
    }
  }, [existingGrade]);

  useEffect(() => {
    if (!hasManualPercentOverride && computedNumericPercentage !== null) {
      setNumericPercentage(computedNumericPercentage.toString());
    }
  }, [computedNumericPercentage, hasManualPercentOverride]);

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
      }
      if (typeof aiFetcher.data.numericPercentage === 'number') {
        setNumericPercentage(aiFetcher.data.numericPercentage.toString());
        setHasManualPercentOverride(false);
      }
    }
  }, [aiFetcher.data, aiFetcher.state]);

  const save = () => {
    const form = new FormData();
    const percent =
      resolvedNumericPercentage === null ? null : resolvedNumericPercentage;
    const letter = percent === null ? null : letterFromPercent(percent);

    form.append('feedback', overallComment);
    form.append('overallComment', overallComment);
    form.append('rubricScores', JSON.stringify(rubricScores));
    if (percent !== null) form.append('numericPercentage', percent.toString());
    if (letter) form.append('letterGrade', letter);
    if (percent !== null) form.append('score', formatGrade(percent, letter) ?? '');

    if (existingGrade?.id) {
      form.append('gradeId', existingGrade.id);
      saveFetcher.submit(form, { method: 'POST', action: '/api/domain/update-grade' });
      return;
    }

    form.append('documentIds', documentId);
    saveFetcher.submit(form, { method: 'POST', action: '/api/domain/grade-essay' });
  };

  return (
    <div className="flex h-full w-full flex-col border-r bg-muted/30 md:w-3/5">
      <div className="border-b bg-white p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-semibold">Grading</div>
          <Badge variant="secondary">{gradeDisplay}</Badge>
        </div>
        <div className="mt-2 flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              const aiForm = new FormData();
              aiForm.append('documentId', documentId);
              aiFetcher.submit(aiForm, {
                method: 'POST',
                action: '/api/domain/grade-essay-ai',
              });
            }}
            disabled={aiFetcher.state !== 'idle'}
          >
            {aiFetcher.state !== 'idle' ? 'Generating...' : 'Generate AI Suggestions'}
          </Button>
          <Button size="sm" onClick={save} disabled={saveFetcher.state !== 'idle'}>
            {saveFetcher.state !== 'idle' ? 'Saving...' : 'Save Grade'}
          </Button>
        </div>
      </div>

      <div className="no-scrollbar flex-1 overflow-y-auto p-3 space-y-4">
        <div className="rounded-lg border bg-white p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="pct">Overall Percentage</Label>
            <Badge variant="secondary">{gradeDisplay}</Badge>
          </div>
          <div className="flex gap-2">
            <Input
              id="pct"
              type="number"
              min={0}
              max={100}
              value={numericPercentage}
              onChange={(e) => {
                setNumericPercentage(e.target.value);
                setHasManualPercentOverride(true);
              }}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (computedNumericPercentage === null) return;
                setNumericPercentage(computedNumericPercentage.toString());
                setHasManualPercentOverride(false);
              }}
              disabled={computedNumericPercentage === null}
            >
              Recalculate
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="overall-comment">Overall Feedback</Label>
          <Textarea
            id="overall-comment"
            value={overallComment}
            onChange={(e) => setOverallComment(e.target.value)}
            rows={4}
            placeholder="Write overall feedback..."
          />
        </div>

        <div className="space-y-3">
          <div className="text-sm font-medium">Rubric</div>
          {rubricCategories.map((item) => {
            const current = rubricScores[item.key] || { score: 0, comment: '' };
            return (
              <div key={item.key} className="rounded-lg border bg-white p-3 space-y-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-medium">{item.label}</div>
                    <div className="text-xs text-muted-foreground">{item.description}</div>
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
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
