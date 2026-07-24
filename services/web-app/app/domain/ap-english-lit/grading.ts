import {
  AP_ENGLISH_LIT_RUBRIC,
  AP_ENGLISH_LIT_RUBRIC_TOTAL_POINTS,
  type ApEnglishLitRubricRowId,
} from './rubric';
import type { ApEnglishLitSnapshot } from './schema';

/**
 * Grading helpers for the AP English Literature free-response questions. Unlike
 * AP History's binary point keys, the AP Lit analytic rubric scores three rows
 * with different maxima (Thesis 0-1, Evidence & Commentary 0-4,
 * Sophistication 0-1). The grader returns a score per row; earned points are
 * the clamped sum, capped at the 6-point total.
 */

export const AP_ENGLISH_LIT_ROW_KEYS = AP_ENGLISH_LIT_RUBRIC.rows.map(
  (row) => row.rowId,
) as ApEnglishLitRubricRowId[];

const ROW_MAX_POINTS: Record<ApEnglishLitRubricRowId, number> = Object.fromEntries(
  AP_ENGLISH_LIT_RUBRIC.rows.map((row) => [row.rowId, row.maxPoints]),
) as Record<ApEnglishLitRubricRowId, number>;

export type ApEnglishLitRowScore = {
  pointsEarned: number;
  pointsPossible: number;
  comment: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function clampRowPoints(rowId: ApEnglishLitRubricRowId, value: unknown): number {
  const max = ROW_MAX_POINTS[rowId];
  const numeric =
    typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : 0;
  return Math.max(0, Math.min(numeric, max));
}

/**
 * Coerces a raw LLM `rows` object into a normalized, clamped score for every
 * rubric row — filling in zeros for missing or malformed rows.
 */
export function normalizeApEnglishLitRows(
  raw: unknown,
): Record<ApEnglishLitRubricRowId, ApEnglishLitRowScore> {
  const rows = isRecord(raw) ? raw : {};
  return Object.fromEntries(
    AP_ENGLISH_LIT_ROW_KEYS.map((rowId) => {
      const row = rows[rowId];
      const record = isRecord(row) ? row : {};
      const pointsEarned = clampRowPoints(rowId, record.pointsEarned);
      const comment =
        typeof record.comment === 'string' ? record.comment : '';
      return [
        rowId,
        { pointsEarned, pointsPossible: ROW_MAX_POINTS[rowId], comment },
      ];
    }),
  ) as Record<ApEnglishLitRubricRowId, ApEnglishLitRowScore>;
}

/** Sums the earned points across rows, capped at the 6-point total. */
export function countApEnglishLitEarnedPoints(
  rows: Record<string, { pointsEarned: number }>,
): number {
  const sum = AP_ENGLISH_LIT_ROW_KEYS.reduce(
    (total, rowId) => total + (rows[rowId]?.pointsEarned ?? 0),
    0,
  );
  return Math.max(0, Math.min(sum, AP_ENGLISH_LIT_RUBRIC_TOTAL_POINTS));
}

function renderRubricRows(): string {
  return AP_ENGLISH_LIT_RUBRIC.rows
    .map(
      (row) =>
        `- ${row.rowId} (0-${row.maxPoints}) — ${row.title}: ${row.description}`,
    )
    .join('\n');
}

function renderProvidedText(snapshot: ApEnglishLitSnapshot): string {
  if (snapshot.sources.length === 0) {
    return snapshot.frqType === 'literary_argument'
      ? 'No provided text: this is the open literary-argument question. The student selects a work of literary merit; evaluate the evidence they supply. Do not invent plot details.'
      : 'No provided text.';
  }
  return snapshot.sources
    .map((source) => {
      const caption = source.caption ? `\nCaption: ${source.caption}` : '';
      return `Provided text ${source.position}: ${source.title}\nAttribution: ${source.attribution}${caption}\n${source.body}`;
    })
    .join('\n\n');
}

export function buildApEnglishLitGradingSystemPrompt(
  studentFirstName: string,
): string {
  return `You are the AP English Literature Grading Assistant. Return ONLY valid JSON with the schema:
{
  "rubricVersion": "${AP_ENGLISH_LIT_RUBRIC.rubricId}",
  "rows": {
    "thesis": {"pointsEarned": 0-1, "comment": string},
    "evidence-commentary": {"pointsEarned": 0-4, "comment": string},
    "sophistication": {"pointsEarned": 0-1, "comment": string}
  },
  "overallComment": string
}
Score the response against the shared 6-point AP Literature analytic rubric:
${renderRubricRows()}
Award points only on the behavioral criteria: summary cannot earn the thesis point; a line of reasoning with specific evidence and real commentary is required for the top of Evidence & Commentary; sophistication is never earned by ornate vocabulary or a passing nod to other readings.
Use only evidence from the essay and the provided text. Each row comment must be specific and located.
In overallComment, start with "${studentFirstName}," and continue with concise, actionable, rubric-anchored AP Literature feedback naming the one or two highest-leverage next steps.`;
}

export function buildApEnglishLitGradingPrompt({
  snapshot,
  essayText,
  studentFirstName,
}: {
  snapshot: ApEnglishLitSnapshot;
  essayText: string;
  studentFirstName: string;
}): string {
  return `Student first name: ${studentFirstName}

AP English Literature free-response question: ${snapshot.frqType}
Assignment prompt: ${snapshot.prompt}
Focus skill: ${snapshot.focusSkill}
Rubric: ${snapshot.rubric.rubricId}
Total points: ${snapshot.rubric.totalPoints}
Rows to score: ${AP_ENGLISH_LIT_ROW_KEYS.join(', ')}

Provided text:
${renderProvidedText(snapshot)}

Essay:
${essayText}`;
}
