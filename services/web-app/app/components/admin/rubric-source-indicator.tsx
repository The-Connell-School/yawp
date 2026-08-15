import { useMemo, useState } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { Card, CardContent } from '~/components/ui/card';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet';
import {
  classifyAssignmentTypeRubric,
  getThesisDefaultRubricConfig,
} from '~/domain/assignment-types/assignment-type-rubric-config';
import type { RubricData } from '~/domain/assignment-types/assignment-type-rubric.shared';

const SCORING_SCALE_LABELS: Record<string, string> = {
  weighted_1_5: 'Weighted 1-5',
  act_writing_2_12: 'ACT Writing 2-12',
  rubric_points: 'Rubric points',
};

function pct(weight: number) {
  return Math.round(weight * 100);
}

function DefaultRubricPreviewSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const defaultConfig = useMemo(() => getThesisDefaultRubricConfig(), []);
  const defaultScoringLabel =
    SCORING_SCALE_LABELS[defaultConfig.scoringScale.type] ??
    defaultConfig.scoringScale.type;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        aria-describedby="default-rubric-preview-description"
        className="overflow-y-auto"
        data-testid="rubric-default-preview-sheet"
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Info className="size-4 shrink-0" />
            Thesis-driven essay rubric
          </SheetTitle>
          <SheetDescription id="default-rubric-preview-description">
            Read-only preview of the rubric grading and tutor guidance use when
            this assignment type has no custom categories.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          <div className="rounded-lg border bg-muted/30 px-4 py-3">
            <p className="text-sm font-medium">Scoring</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {defaultScoringLabel} ({defaultConfig.scoringScale.minScore}-
              {defaultConfig.scoringScale.maxScore})
            </p>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium">Categories</p>
            {defaultConfig.rubric.categories.map((category) => (
              <Card key={category.key}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-3 text-sm">
                    <p className="font-medium">{category.label}</p>
                    <p className="shrink-0 text-muted-foreground">
                      {pct(category.weight)}%
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground text-pretty">
                    {category.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <p className="text-sm text-muted-foreground text-pretty">
            Add categories in the editor to replace this default with your own
            rubric.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function IncompleteRubricBanner({ rubric }: { rubric: RubricData }) {
  const unfinished = rubric.categories
    .filter(
      (category) =>
        !(
          category.key.trim() &&
          category.label.trim() &&
          category.description.trim() &&
          Number.isFinite(category.weight)
        )
    )
    .map((category, index) => category.label.trim() || `Category ${index + 1}`);

  return (
    <div
      data-testid="rubric-source-incomplete"
      className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3"
    >
      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
      <div>
        <p className="text-sm font-medium">Some categories are unfinished</p>
        <p className="mt-0.5 text-sm text-muted-foreground text-pretty">
          Grading uses this rubric exactly as saved, unfinished categories
          included. Give every category a key, label, description, and weight,
          or remove the ones you are not using. Unfinished:{' '}
          {unfinished.join(', ')}.
        </p>
      </div>
    </div>
  );
}

export function RubricSourceBanner({ rubric }: { rubric: RubricData }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const completeness = classifyAssignmentTypeRubric(rubric);

  if (completeness === 'complete') {
    return null;
  }

  if (completeness === 'partial') {
    return <IncompleteRubricBanner rubric={rubric} />;
  }

  return (
    <>
      <div
        data-testid="rubric-source-default"
        className="flex flex-col gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 size-5 shrink-0 text-blue-600" />
          <div>
            <p className="text-sm font-medium">
              Using the default thesis rubric
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground text-pretty">
              Grading and tutor guidance fall back to it until you add a
              complete category below.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit shrink-0"
          data-testid="rubric-default-preview-trigger"
          onClick={() => setPreviewOpen(true)}
        >
          View default rubric
        </Button>
      </div>
      <DefaultRubricPreviewSheet
        open={previewOpen}
        onOpenChange={setPreviewOpen}
      />
    </>
  );
}
