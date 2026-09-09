import { z } from 'zod';

export function buildGradingAssistantOutputSchemas({
  rubricKeys,
  minScore,
  maxScore,
}: {
  rubricKeys: string[];
  minScore: number;
  maxScore: number;
}) {
  const RubricKeySchema = z.enum(rubricKeys as [string, ...string[]]);
  const GradingAssistantCategorySchema = z.object({
    key: RubricKeySchema,
    score: z.number().int().min(minScore).max(maxScore),
    comment: z.string().min(1),
  });
  const GradingAssistantCategoriesSchema = z
    .array(GradingAssistantCategorySchema)
    .superRefine((categories, ctx) => {
      if (categories.length !== rubricKeys.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Expected ${rubricKeys.length} rubric categories, received ${categories.length}.`,
        });
      }

      const seen = new Set<string>();
      for (const category of categories) {
        if (seen.has(category.key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Duplicate rubric category key: ${category.key}`,
          });
          continue;
        }
        seen.add(category.key);
      }

      for (const key of rubricKeys) {
        if (!seen.has(key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Missing rubric category key: ${key}`,
          });
        }
      }
    });
  const GradingAssistantResponseSchema = z.object({
    categories: GradingAssistantCategoriesSchema,
    overallComment: z.string().min(1),
  });

  return {
    GradingAssistantCategoriesSchema,
    GradingAssistantResponseSchema,
  };
}
