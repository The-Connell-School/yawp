import { z } from 'zod';

export const GRAMMAR_HIGHLIGHT_MODES = ['off', 'highlight', 'deduct'] as const;
export type GrammarHighlightMode = (typeof GRAMMAR_HIGHLIGHT_MODES)[number];

export type OutputSchemaDisplay = {
  showCategories?: boolean;
  perCategoryComments?: boolean;
  grammarHighlight?: GrammarHighlightMode;
  grammarMaxDeductionPct?: number;
  teacherNotes?: boolean;
};

export type ResolvedDisplayOptions = {
  showCategories: boolean;
  perCategoryComments: boolean;
  grammarHighlight: GrammarHighlightMode;
  grammarMaxDeductionPct?: number;
  teacherNotes: boolean;
};

const displaySchema = z
  .object({
    showCategories: z.boolean(),
    perCategoryComments: z.boolean(),
    grammarHighlight: z.enum(GRAMMAR_HIGHLIGHT_MODES),
    grammarMaxDeductionPct: z.number().min(0).max(100),
    teacherNotes: z.boolean(),
  })
  .partial()
  .strict();

export type OutputSchemaDisplayValidationIssue = {
  path: string;
  message: string;
};

export function readOutputSchemaDisplay(
  outputSchema: unknown
): OutputSchemaDisplay | undefined {
  if (!outputSchema || typeof outputSchema !== 'object' || Array.isArray(outputSchema)) {
    return undefined;
  }
  const display = (outputSchema as Record<string, unknown>).display;
  if (display === undefined) return undefined;
  return display as OutputSchemaDisplay;
}

export function validateOutputSchemaDisplay(
  display: unknown,
  pathPrefix = '/outputSchema/display'
): OutputSchemaDisplayValidationIssue[] {
  if (display === undefined) return [];
  const parsed = displaySchema.safeParse(display);
  if (!parsed.success) {
    return parsed.error.issues.map((issue) => ({
      path:
        pathPrefix +
        (issue.path.length
          ? '/' +
            issue.path
              .map((part) => String(part).replace(/~/g, '~0').replace(/\//g, '~1'))
              .join('/')
          : ''),
      message: issue.message,
    }));
  }
  const value = parsed.data;
  const issues: OutputSchemaDisplayValidationIssue[] = [];
  if (
    value.showCategories === false &&
    value.perCategoryComments === true
  ) {
    issues.push({
      path: `${pathPrefix}/perCategoryComments`,
      message:
        'perCategoryComments cannot be true when showCategories is false.',
    });
  }
  return issues;
}
