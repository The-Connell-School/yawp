import { z } from 'zod';
import {
  AP_ENGLISH_LIT_RUBRIC,
  AP_ENGLISH_LIT_RUBRIC_TOTAL_POINTS,
  type ApEnglishLitRubricRowId,
} from './rubric';

/**
 * The validated shape the AP Literature feedback engine emits for a drafted
 * response. It is deliberately rubric-anchored and located: every row carries
 * a score bounded by the rubric maximum plus feedback pinned to specific
 * places in the draft, and the whole object triages one or two highest-leverage
 * priorities. Scoring is always in service of feedback, never a bare number.
 */

const RUBRIC_ROW_IDS = AP_ENGLISH_LIT_RUBRIC.rows.map((row) => row.rowId) as [
  ApEnglishLitRubricRowId,
  ...ApEnglishLitRubricRowId[],
];

const ROW_MAX_POINTS: Record<ApEnglishLitRubricRowId, number> = Object.fromEntries(
  AP_ENGLISH_LIT_RUBRIC.rows.map((row) => [row.rowId, row.maxPoints]),
) as Record<ApEnglishLitRubricRowId, number>;

export const ApEnglishLitLocatedNoteSchema = z.object({
  /** Where in the draft this note applies, e.g. "thesis (¶1)" or "¶3". */
  location: z.string().min(1),
  /** What the reader sees at that location. */
  observation: z.string().min(1),
  /** A prompting next step — a question or move, never finished prose. */
  nextStep: z.string().min(1),
});

export const ApEnglishLitRowFeedbackSchema = z
  .object({
    rowId: z.enum(RUBRIC_ROW_IDS),
    pointsEarned: z.number().int().min(0),
    pointsPossible: z.number().int().positive(),
    rationale: z.string().min(1),
    located: z.array(ApEnglishLitLocatedNoteSchema),
  })
  .superRefine((row, ctx) => {
    const expectedMax = ROW_MAX_POINTS[row.rowId];
    if (row.pointsPossible !== expectedMax) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Row ${row.rowId} must have ${expectedMax} points possible.`,
        path: ['pointsPossible'],
      });
    }
    if (row.pointsEarned > row.pointsPossible) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A row cannot earn more than its rubric maximum.',
        path: ['pointsEarned'],
      });
    }
  });

export const ApEnglishLitFeedbackSchema = z
  .object({
    rows: z.array(ApEnglishLitRowFeedbackSchema).length(RUBRIC_ROW_IDS.length),
    totalScore: z
      .number()
      .int()
      .min(0)
      .max(AP_ENGLISH_LIT_RUBRIC_TOTAL_POINTS),
    /** One or two highest-leverage fixes — experts do not bury the student. */
    topPriorities: z.array(z.string().min(1)).min(1).max(2),
  })
  .superRefine((feedback, ctx) => {
    const seen = new Set<string>();
    for (const row of feedback.rows) {
      if (seen.has(row.rowId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate feedback for rubric row ${row.rowId}.`,
          path: ['rows'],
        });
      }
      seen.add(row.rowId);
    }
    for (const rowId of RUBRIC_ROW_IDS) {
      if (!seen.has(rowId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Missing feedback for rubric row ${rowId}.`,
          path: ['rows'],
        });
      }
    }

    const sum = feedback.rows.reduce((total, row) => total + row.pointsEarned, 0);
    if (sum !== feedback.totalScore) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `totalScore (${feedback.totalScore}) must equal the sum of row scores (${sum}).`,
        path: ['totalScore'],
      });
    }
  });

export type ApEnglishLitLocatedNote = z.infer<typeof ApEnglishLitLocatedNoteSchema>;
export type ApEnglishLitRowFeedback = z.infer<typeof ApEnglishLitRowFeedbackSchema>;
export type ApEnglishLitFeedback = z.infer<typeof ApEnglishLitFeedbackSchema>;

export function parseApEnglishLitFeedback(value: unknown): ApEnglishLitFeedback {
  return ApEnglishLitFeedbackSchema.parse(value);
}

export function isApEnglishLitFeedback(
  value: unknown,
): value is ApEnglishLitFeedback {
  return ApEnglishLitFeedbackSchema.safeParse(value).success;
}

/** Sums the earned points across all rows. */
export function totalApEnglishLitScore(feedback: {
  rows: Array<{ pointsEarned: number }>;
}): number {
  return feedback.rows.reduce((total, row) => total + row.pointsEarned, 0);
}
