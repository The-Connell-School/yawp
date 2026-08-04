import { useMemo, useState } from 'react';
import { Label } from '~/components/ui/label';
import {
  MODULE_RUBRIC_RELATIONSHIPS,
  normalizeModuleRubricAlignment,
  type ModuleRubricRelationship,
} from '~/domain/assignment-types/assignment-type-rubric-config';
import type { RubricCategory } from '~/domain/assignment-types/assignment-type-rubric.shared';

const relationshipLabels: Record<ModuleRubricRelationship, string> = {
  primary: 'Primary',
  supporting: 'Supporting',
  preparatory: 'Preparatory',
  'not-applicable': 'Not applicable',
};

export function ModuleRubricAlignmentEditor({
  categories,
  initialAlignment,
}: {
  categories: RubricCategory[];
  initialAlignment: unknown;
}) {
  const normalizedInitial = useMemo(
    () => normalizeModuleRubricAlignment(initialAlignment, categories),
    [categories, initialAlignment]
  );
  const [alignment, setAlignment] = useState(normalizedInitial);

  if (categories.length === 0) {
    return (
      <p className="rounded-[8px] border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
        Add rubric categories to this assignment type before mapping module
        relationships.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {categories.map((category) => (
          <div
            key={category.key}
            className="grid gap-2 rounded-[8px] border bg-muted/30 p-3 sm:grid-cols-[minmax(0,1fr)_180px]"
          >
            <div>
              <Label htmlFor={`rubric-alignment-${category.key}`}>
                {category.label}
              </Label>
              <p className="mt-1 text-xs text-muted-foreground text-pretty">
                {category.description}
              </p>
            </div>
            <select
              id={`rubric-alignment-${category.key}`}
              className="h-10 rounded-md border bg-background px-3 text-sm"
              value={alignment[category.key]}
              onChange={(event) =>
                setAlignment((current) => ({
                  ...current,
                  [category.key]: event.target
                    .value as ModuleRubricRelationship,
                }))
              }
            >
              {MODULE_RUBRIC_RELATIONSHIPS.map((relationship) => (
                <option key={relationship} value={relationship}>
                  {relationshipLabels[relationship]}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <input
        type="hidden"
        name="rubricAlignmentJson"
        value={JSON.stringify(alignment)}
      />
    </div>
  );
}
