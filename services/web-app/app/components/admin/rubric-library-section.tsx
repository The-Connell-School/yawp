import { useFetcher } from 'react-router';
import { Label } from '~/components/ui/label';
import { Textarea } from '~/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';

export type RubricOption = {
  id: string;
  name: string;
  title: string;
  json: string;
};

const NO_RUBRIC_VALUE = '__none__';

/** Pick one database-managed rubric and inspect it without editing it. */
export function RubricLibrarySection({
  assignmentTypeId,
  rubrics,
  selectedRubricId,
  gradingInstructions,
  onGradingInstructionsChange,
}: {
  assignmentTypeId: string;
  rubrics: RubricOption[];
  selectedRubricId: string | null;
  /** Per-assignment-type override layered on top of the resolved rubric's instructions. */
  gradingInstructions: string;
  onGradingInstructionsChange: (value: string) => void;
}) {
  const fetcher = useFetcher();
  const selected =
    rubrics.find((rubric) => rubric.id === selectedRubricId) ?? null;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="rubric-library-select">Rubric</Label>
        <Select
          name="rubricId"
          defaultValue={selectedRubricId ?? NO_RUBRIC_VALUE}
          onValueChange={(value) => {
            const form = new FormData();
            form.set('intent', 'select');
            form.set('assignmentTypeId', assignmentTypeId);
            form.set('rubricId', value === NO_RUBRIC_VALUE ? '' : value);
            fetcher.submit(form, {
              method: 'POST',
              action: '/api/admin/rubrics',
            });
          }}
        >
          <SelectTrigger
            id="rubric-library-select"
            data-testid="rubric-library-select"
          >
            <SelectValue placeholder="Choose a rubric" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_RUBRIC_VALUE}>
              Built-in default for this assignment type
            </SelectItem>
            {rubrics.map((rubric) => (
              <SelectItem key={rubric.id} value={rubric.id}>
                {rubric.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">
          {selected
            ? `Grading uses “${selected.title}” for this assignment type.`
            : 'Grading uses the existing built-in rubric for this assignment type.'}
        </p>
      </div>

      {selected ? (
        <details className="rounded-lg border bg-muted/30 p-3">
          <summary className="cursor-pointer text-sm font-medium">
            View {selected.title}
          </summary>
          <pre
            data-testid="rubric-library-json"
            className="mt-3 max-h-96 overflow-auto rounded bg-background p-3 text-xs leading-relaxed"
          >
            {selected.json}
          </pre>
        </details>
      ) : null}

      {fetcher.data &&
      typeof fetcher.data === 'object' &&
      'error' in fetcher.data ? (
        <p className="text-sm text-destructive">
          {String((fetcher.data as { error: unknown }).error)}
        </p>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="grading-assistant-instructions">
          Grading assistant instructions
        </Label>
        <Textarea
          id="grading-assistant-instructions"
          name="gradingInstructionsOverride"
          data-testid="grading-assistant-instructions"
          rows={4}
          className="max-w-full"
          placeholder="Tell the grading assistant how to apply this rubric to submissions."
          value={gradingInstructions}
          onChange={(event) => onGradingInstructionsChange(event.target.value)}
        />
        <p className="text-sm text-muted-foreground">
          Optional. Replaces the default grading assistant instructions for
          this assignment type. The rubric itself stays unchanged.
        </p>
      </div>
    </div>
  );
}
