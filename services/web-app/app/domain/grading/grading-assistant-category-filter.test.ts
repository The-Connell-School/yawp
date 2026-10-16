import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { preprocessGradingAssistantCategoriesInput } from './grading-assistant-category-filter';
import { applyDisplayGrammarCategories } from './rubric-display-options';
import { getThesisDefaultRubricConfig } from '~/domain/assignment-types/assignment-type-rubric-config';

describe('preprocessGradingAssistantCategoriesInput', () => {
  test('drops grammar_and_mechanics when the assignment does not score it', () => {
    const thesis = getThesisDefaultRubricConfig();
    const scored = applyDisplayGrammarCategories(
      thesis.rubric.categories,
      thesis.outputSchema,
      { grammarGradingEnabled: false }
    );
    const allowedKeys = scored.map((category) => category.key);

    const modelPayload = [
      { key: 'thesis_and_content', score: 85, comment: 'Strong thesis.' },
      {
        key: 'organization_and_structure',
        score: 80,
        comment: 'Clear structure.',
      },
      { key: 'evidence_and_support', score: 78, comment: 'Good evidence.' },
      { key: 'voice_and_style', score: 82, comment: 'Engaging voice.' },
      {
        key: 'grammar_and_mechanics',
        score: 70,
        comment: 'Some errors.',
      },
    ];

    const filtered = preprocessGradingAssistantCategoriesInput(
      modelPayload,
      allowedKeys
    ) as typeof modelPayload;

    expect(filtered.map((category) => category.key)).toEqual(allowedKeys);
    expect(filtered).toHaveLength(allowedKeys.length);

    const RubricKeySchema = z.enum(allowedKeys as [string, ...string[]]);
    const parsed = z
      .array(
        z.object({
          key: RubricKeySchema,
          score: z.number(),
          comment: z.string(),
        })
      )
      .safeParse(filtered);

    expect(parsed.success).toBe(true);
  });

  test('leaves non-array input untouched', () => {
    expect(
      preprocessGradingAssistantCategoriesInput(null, ['thesis_and_content'])
    ).toBe(null);
  });
});
