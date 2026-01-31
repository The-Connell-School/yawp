import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet';
import { Badge } from '~/components/ui/badge';

type RubricScore = {
  score: number;
  comment: string;
  isAi?: boolean;
};

type GradeDetailsSheetProps = {
  isOpen: boolean;
  onClose: () => void;
  grade: {
    score: string | null;
    feedback: string | null;
    overallScore: number | null;
    overallComment: string | null;
    rubricScores?: unknown | null;
    releasedAt: Date | string | null;
    createdAt: Date | string;
  };
};

const rubricCategories = [
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

const scoreLabels: Record<number, string> = {
  1: 'Needs Improvement',
  2: 'Developing',
  3: 'Proficient',
  4: 'Strong',
  5: 'Exemplary',
};

export function GradeDetailsSheet({
  isOpen,
  onClose,
  grade,
}: GradeDetailsSheetProps) {
  const rubricScores =
    (grade.rubricScores as Record<string, RubricScore> | null) || {};
  const hasRubricScores = rubricScores && Object.keys(rubricScores).length > 0;
  const gradeDisplay =
    grade.score || (grade.overallScore ? `${grade.overallScore}/5` : 'Graded');

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Grade Details</SheetTitle>
          <SheetDescription>
            Your grade and detailed feedback for this essay
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Overall Grade */}
          <div className="rounded-lg border bg-muted/50 p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold">Overall Grade</h3>
              <Badge variant="default" className="text-lg px-3 py-1">
                {gradeDisplay}
              </Badge>
            </div>
            {(grade.overallComment || grade.feedback) && (
              <p className="text-sm text-muted-foreground mt-2">
                {grade.overallComment || grade.feedback}
              </p>
            )}
          </div>

          {/* Rubric Breakdown */}
          {hasRubricScores && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Rubric Breakdown</h3>
              {rubricCategories.map((category) => {
                const categoryScore = rubricScores[category.key];
                if (!categoryScore || categoryScore.score === 0) return null;

                return (
                  <div
                    key={category.key}
                    className="rounded-lg border bg-card p-4 space-y-2"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex-1">
                        <h4 className="font-medium">{category.label}</h4>
                        <p className="text-xs text-muted-foreground">
                          {category.description}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="secondary"
                          className="whitespace-nowrap"
                        >
                          {categoryScore.score}/5
                        </Badge>
                        <span className="text-xs text-muted-foreground hidden sm:inline">
                          {scoreLabels[categoryScore.score]}
                        </span>
                      </div>
                    </div>
                    {categoryScore.comment && (
                      <p className="text-sm text-muted-foreground pt-2 border-t">
                        {categoryScore.comment}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Released Date */}
          <div className="text-xs text-muted-foreground text-center pt-4 border-t">
            Grade released on{' '}
            {new Date(grade.releasedAt!).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
