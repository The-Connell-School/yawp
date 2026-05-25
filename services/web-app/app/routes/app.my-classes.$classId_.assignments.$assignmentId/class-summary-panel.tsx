import { useState, useCallback, useEffect } from 'react';
import { Button } from '~/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '~/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '~/components/ui/collapsible';
import { Loader2, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
import { timeAgo } from '~/utils/timeAgo';

type SummaryJson = {
  version: number;
  strengths: string[];
  weaknesses: string[];
  focusAreas: string[];
};

type SummaryData = {
  id: string;
  generatedAt: string;
  gradedAtGeneration: number;
  totalAtGeneration: number;
  summaryJson: SummaryJson;
  lastMilestone: number | null;
};

type Props = {
  assignmentId: string;
  existingSummary: SummaryData | null;
  gradedCount: number;
  totalStudents: number;
};

export function ClassSummaryPanel({
  assignmentId,
  existingSummary,
  gradedCount,
  totalStudents,
}: Props) {
  const [summary, setSummary] = useState<SummaryData | null>(existingSummary);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(!!existingSummary);

  useEffect(() => {
    setSummary(existingSummary);
    if (existingSummary) setIsOpen(true);
  }, [existingSummary]);

  const gradedPercent =
    totalStudents > 0 ? (gradedCount / totalStudents) * 100 : 0;
  const canGenerate = gradedPercent >= 50 && gradedCount >= 3;

  const generate = useCallback(async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const response = await fetch('/api/domain/assignment-class-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignmentId }),
      });
      const result = await response.json();
      if (result.success) {
        setSummary(result.summary);
        setIsOpen(true);
      } else {
        setError(result.message ?? 'Failed to generate summary.');
      }
    } catch {
      setError('Failed to generate summary. Please try again.');
    }
    setIsGenerating(false);
  }, [assignmentId]);

  if (totalStudents === 0) return null;

  const summaryJson = summary?.summaryJson;

  return (
    <Card className="mb-6">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CollapsibleTrigger className="flex items-center gap-2 hover:opacity-80">
              {isOpen ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              <CardTitle className="text-base">Class Summary</CardTitle>
            </CollapsibleTrigger>
            <Button
              variant="outline"
              size="sm"
              disabled={!canGenerate || isGenerating}
              onClick={generate}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Reviewing submissions…
                </>
              ) : (
                <>
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  {summary ? 'Regenerate' : 'Generate'}
                </>
              )}
            </Button>
          </div>
          {summary && (
            <p className="mt-1 text-xs text-muted-foreground">
              Based on {summary.gradedAtGeneration} of{' '}
              {summary.totalAtGeneration} submissions &middot;{' '}
              {timeAgo(summary.generatedAt)}
            </p>
          )}
          {!canGenerate && !summary && (
            <p className="mt-1 text-sm text-muted-foreground">
              Grade more submissions to get a meaningful class summary.{' '}
              {gradedCount} of {totalStudents} graded.
            </p>
          )}
        </CardHeader>

        <CollapsibleContent>
          <CardContent>
            {error && (
              <p className="mb-3 text-sm text-red-600">{error}</p>
            )}

            {summaryJson && (
              <div className="space-y-4">
                <div>
                  <h4 className="mb-1.5 text-sm font-medium">Strengths</h4>
                  <ul className="space-y-1">
                    {summaryJson.strengths.map((s, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 text-sm text-muted-foreground"
                      >
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" />
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h4 className="mb-1.5 text-sm font-medium">Weaknesses</h4>
                  <ul className="space-y-1">
                    {summaryJson.weaknesses.map((w, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 text-sm text-muted-foreground"
                      >
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                        {w}
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h4 className="mb-1.5 text-sm font-medium">
                    Suggested focus areas
                  </h4>
                  <ul className="space-y-1">
                    {summaryJson.focusAreas.map((f, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 text-sm text-muted-foreground"
                      >
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
