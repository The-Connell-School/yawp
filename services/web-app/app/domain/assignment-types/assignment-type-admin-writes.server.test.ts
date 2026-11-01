import { describe, expect, test } from 'bun:test';
import { parseAdminUpdateGradingConfig } from './assignment-type-admin-writes.server';
import { parseAssignmentTypeRubricConfig } from './assignment-type-rubric-config';

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

  describe('a type grading from the built-in rubric for its kind', () => {
    const builtInExitTicket = parseAssignmentTypeRubricConfig({
      assignmentTypeKind: 'exit_ticket',
    });
    const existingExitTicket = {
      kind: 'exit_ticket',
      rubricJson: null,
      scoringScaleJson: null,
      gradingPromptConfigJson: null,
      gradingOutputSchemaJson: null,
    };

    test('does not save the built-in rubric onto the type when the admin left it alone', () => {
      const form = new FormData();
      form.set('rubricJson', JSON.stringify(builtInExitTicket.rubric));

      expect(
        parseAdminUpdateGradingConfig(form, existingExitTicket)
      ).toBeUndefined();
    });

    test('an empty instructions box on a type with no prompt config is not a change', () => {
      const form = new FormData();
      form.set('rubricJson', JSON.stringify(builtInExitTicket.rubric));
      form.set('gradingInstructionsOverride', '');

      expect(
        parseAdminUpdateGradingConfig(form, existingExitTicket)
      ).toBeUndefined();
    });

    test('treats a posted rubric that carries no category options as untouched', () => {
      // What the edit page posted before category options were kept: it
      // could not express a change to them, so it is not one.
      const form = new FormData();
      form.set(
        'rubricJson',
        JSON.stringify(prepareLegacyStrippedRubric(builtInExitTicket.rubric))
      );

      expect(
        parseAdminUpdateGradingConfig(form, existingExitTicket)
      ).toBeUndefined();
    });

    test('does not save the Thesis-Driven Essay default onto a type with no kind', () => {
      const thesis = parseAssignmentTypeRubricConfig({});
      const form = new FormData();
      form.set(
        'rubricJson',
        JSON.stringify(prepareLegacyStrippedRubric(thesis.rubric))
      );

      expect(
        parseAdminUpdateGradingConfig(form, {
          kind: null,
          rubricJson: null,
        })
      ).toBeUndefined();
    });

    test('saves the whole built-in config with a real change so grading keeps its scale and instructions', () => {
      const changed = {
        categories: builtInExitTicket.rubric.categories.map((category) => ({
          ...category,
          grammarHighlighting: true,
        })),
      };
      const form = new FormData();
      form.set('rubricJson', JSON.stringify(changed));

      const config = parseAdminUpdateGradingConfig(form, existingExitTicket);

      expect(config?.rubricJson).toEqual(changed);
      expect(config?.scoringScaleJson).toEqual(builtInExitTicket.scoringScale);
      expect(config?.gradingPromptConfigJson).toEqual(
        builtInExitTicket.promptConfig
      );
      expect(config?.gradingOutputSchemaJson).toEqual(
        builtInExitTicket.outputSchema
      );
      expect(config?.gradingCalibrationNotes).toBe(
        builtInExitTicket.calibrationNotes
      );
      expect(config?.gradingAssistantVersion).toEqual({ increment: 1 });

      // Grading the saved columns gives back the same bands and scale.
      const regraded = parseAssignmentTypeRubricConfig({
        assignmentTypeKind: 'exit_ticket',
        rubricJson: config?.rubricJson,
        scoringScaleJson: config?.scoringScaleJson,
        gradingPromptConfigJson: config?.gradingPromptConfigJson,
        gradingOutputSchemaJson: config?.gradingOutputSchemaJson,
      });
      expect(regraded.scoringScale).toEqual(builtInExitTicket.scoringScale);
      expect(regraded.rubric.categories[0]?.bands).toEqual(
        builtInExitTicket.rubric.categories[0]?.bands
      );
      expect(regraded.promptConfig.gradingInstructions).toBe(
        builtInExitTicket.promptConfig.gradingInstructions
      );
    });

    test('keeps a grading instructions override the type already had', () => {
      const changed = {
        categories: builtInExitTicket.rubric.categories.map((category) => ({
          ...category,
          grammarHighlighting: true,
        })),
      };
      const form = new FormData();
      form.set('rubricJson', JSON.stringify(changed));

      const config = parseAdminUpdateGradingConfig(form, {
        ...existingExitTicket,
        gradingPromptConfigJson: { gradingInstructionsOverride: 'Be brief.' },
      });

      expect(config?.gradingPromptConfigJson).toEqual({
        ...builtInExitTicket.promptConfig,
        gradingInstructionsOverride: 'Be brief.',
      });
    });
  });

  describe('a type with its own rubric', () => {
    const ownRubric = {
      categories: [
        {
          key: 'focus_and_exploration',
          label: 'Focus and exploration',
          weight: 1,
          description: 'Moves toward a focus.',
          scoreLabels: [
            { value: 1, label: 'Beginning' },
            { value: 5, label: 'Exemplary' },
          ],
          feedbackEnabled: true,
          grammarHighlighting: false,
        },
      ],
    };
    const existing = {
      kind: 'prewriting',
      rubricJson: ownRubric,
      scoringScaleJson: { type: 'weighted_1_5', minScore: 1, maxScore: 5 },
    };

    test('saves a grammar highlighting change with every other option intact', () => {
      const changed = {
        categories: ownRubric.categories.map((category) => ({
          ...category,
          grammarHighlighting: true,
        })),
      };
      const form = new FormData();
      form.set('rubricJson', JSON.stringify(changed));

      const config = parseAdminUpdateGradingConfig(form, existing);

      expect(config?.rubricJson).toEqual(changed);
      expect(config?.scoringScaleJson).toBeUndefined();
    });

    test('skips the write when the posted rubric is the stored one', () => {
      const form = new FormData();
      form.set('rubricJson', JSON.stringify(ownRubric));

      expect(parseAdminUpdateGradingConfig(form, existing)).toBeUndefined();
    });

    test('treats a posted rubric that carries no category options as untouched', () => {
      const form = new FormData();
      form.set(
        'rubricJson',
        JSON.stringify(prepareLegacyStrippedRubric(ownRubric))
      );

      expect(parseAdminUpdateGradingConfig(form, existing)).toBeUndefined();
    });
  });
});

function prepareLegacyStrippedRubric(rubric: {
  categories: Array<{
    key: string;
    label: string;
    weight: number;
    description: string;
  }>;
}) {
  return {
    categories: rubric.categories.map(({ key, label, weight, description }) => ({
      key,
      label,
      weight,
      description,
    })),
  };
}
