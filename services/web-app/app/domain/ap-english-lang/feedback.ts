import { z } from 'zod';
import {
  AP_ENGLISH_LANG_RUBRIC,
  AP_ENGLISH_LANG_RUBRIC_TOTAL_POINTS,
  maxEvidenceCommentaryForSourcesCited,
  type ApEnglishLangRubricRowId,
} from './rubric';

/**
 * The validated shape the AP Language feedback engine emits for a drafted
 * response. It is deliberately rubric-anchored and located: every row carries
 * a score bounded by the rubric maximum plus feedback pinned to specific
 * places in the draft, and the whole object triages one or two highest-leverage
 * priorities. Scoring is always in service of feedback, never a bare number.
 *
 * Synthesis responses additionally report `sourcesCited`, which enforces the
 * College Board's hard Row B ceiling: a response using two provided sources
 * cannot score above 1 on Evidence & Commentary no matter how well written.
 */

const RUBRIC_ROW_IDS = AP_ENGLISH_LANG_RUBRIC.rows.map((row) => row.rowId) as [
  ApEnglishLangRubricRowId,
  ...ApEnglishLangRubricRowId[],
];

const ROW_MAX_POINTS: Record<ApEnglishLangRubricRowId, number> =
  Object.fromEntries(
    AP_ENGLISH_LANG_RUBRIC.rows.map((row) => [row.rowId, row.maxPoints]),
  ) as Record<ApEnglishLangRubricRowId, number>;

export const ApEnglishLangLocatedNoteSchema = z.object({
  /** Where in the draft this note applies, e.g. "thesis (¶1)" or "¶3". */
  location: z.string().min(1),
  /** What the reader sees at that location. */
  observation: z.string().min(1),
  /** A prompting next step — a question or move, never finished prose. */
  nextStep: z.string().min(1),
});

export const ApEnglishLangRowFeedbackSchema = z
  .object({
    rowId: z.enum(RUBRIC_ROW_IDS),
    pointsEarned: z.number().int().min(0),
    pointsPossible: z.number().int().positive(),
    rationale: z.string().min(1),
    located: z.array(ApEnglishLangLocatedNoteSchema),
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

export const ApEnglishLangFeedbackSchema = z
  .object({
    rows: z.array(ApEnglishLangRowFeedbackSchema).length(RUBRIC_ROW_IDS.length),
    totalScore: z
      .number()
      .int()
      .min(0)
      .max(AP_ENGLISH_LANG_RUBRIC_TOTAL_POINTS),
    /**
     * How many provided sources the response actually used as evidence.
     * Synthesis only — omitted for rhetorical analysis and argument, where no
     * source-count ceiling applies.
     */
    sourcesCited: z.number().int().min(0).optional(),
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

    if (feedback.sourcesCited !== undefined) {
      const cap = maxEvidenceCommentaryForSourcesCited(feedback.sourcesCited);
      const evidenceRow = feedback.rows.find(
        (row) => row.rowId === 'evidence-commentary',
      );
      if (evidenceRow && evidenceRow.pointsEarned > cap) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            `A synthesis response citing ${feedback.sourcesCited} source(s) caps ` +
            `Evidence & Commentary at ${cap}, but ${evidenceRow.pointsEarned} was awarded.`,
          path: ['rows'],
        });
      }
    }
  });

export type ApEnglishLangLocatedNote = z.infer<
  typeof ApEnglishLangLocatedNoteSchema
>;
export type ApEnglishLangRowFeedback = z.infer<
  typeof ApEnglishLangRowFeedbackSchema
>;
export type ApEnglishLangFeedback = z.infer<typeof ApEnglishLangFeedbackSchema>;

export function parseApEnglishLangFeedback(
  value: unknown,
): ApEnglishLangFeedback {
  return ApEnglishLangFeedbackSchema.parse(value);
}

export function isApEnglishLangFeedback(
  value: unknown,
): value is ApEnglishLangFeedback {
  return ApEnglishLangFeedbackSchema.safeParse(value).success;
}

/** Sums the earned points across all rows. */
export function totalApEnglishLangScore(feedback: {
  rows: Array<{ pointsEarned: number }>;
}): number {
  return feedback.rows.reduce((total, row) => total + row.pointsEarned, 0);
}
