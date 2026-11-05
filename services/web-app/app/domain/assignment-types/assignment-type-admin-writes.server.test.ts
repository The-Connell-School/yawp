import { describe, expect, test } from 'bun:test';
import { parseAdminUpdateGradingConfig } from './assignment-type-admin-writes.server';

describe('parseAdminUpdateGradingConfig', () => {
  test('skips grading writes when the posted rubric config matches what is already stored', () => {
    const existing = {
      rubricJson: {
        categories: [
          {
            key: 'legacy_category',
            label: 'Legacy category',
            description: 'Existing assignment-type rubric data.',
            weight: 1,
          },
        ],
      },
      scoringScaleJson: { type: 'weighted_1_5', minScore: 1, maxScore: 5 },
      gradingPromptConfigJson: { gradingInstructions: 'Keep the legacy prompt exactly.' },
      gradingOutputSchemaJson: { schemaVersion: 1 },
    };
    const form = new FormData();
    form.set(
      'scoringScale',
      JSON.stringify({ type: 'weighted_1_5', minScore: 1, maxScore: 5, step: 1 })
    );
    form.set('rubricJson', JSON.stringify(existing.rubricJson));

    expect(parseAdminUpdateGradingConfig(form, existing)).toBeUndefined();
  });

  test('preserves stored scoringScaleJson when the posted scale only adds the default step', () => {
    const existing = {
      scoringScaleJson: { type: 'weighted_1_5', minScore: 1, maxScore: 5 },
    };
    const form = new FormData();
    form.set(
      'scoringScale',
      JSON.stringify({ type: 'weighted_1_5', minScore: 1, maxScore: 5, step: 1 })
    );
    form.set('rubricJson', JSON.stringify({ categories: [] }));

    expect(parseAdminUpdateGradingConfig(form, existing)).toBeUndefined();
  });
});
