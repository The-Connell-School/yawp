import {
  AP_ENGLISH_LANG_RUBRIC,
  AP_ENGLISH_LANG_RUBRIC_TOTAL_POINTS,
  SYNTHESIS_SOURCE_RULES,
  type ApEnglishLangRubricRowId,
} from './rubric';
import type { ApEnglishLangSnapshot } from './schema';

/**
 * Grading helpers for the AP English Language free-response questions. Like AP
 * Lit, the analytic rubric scores three rows with different maxima (Thesis
 * 0-1, Evidence & Commentary 0-4, Sophistication 0-1). The grader returns a
 * score per row; earned points are the clamped sum, capped at the 6-point
 * total.
 */

export const AP_ENGLISH_LANG_ROW_KEYS = AP_ENGLISH_LANG_RUBRIC.rows.map(
  (row) => row.rowId,
) as ApEnglishLangRubricRowId[];

const ROW_MAX_POINTS: Record<ApEnglishLangRubricRowId, number> = Object.fromEntries(
  AP_ENGLISH_LANG_RUBRIC.rows.map((row) => [row.rowId, row.maxPoints]),
) as Record<ApEnglishLangRubricRowId, number>;

export type ApEnglishLangRowScore = {
  pointsEarned: number;
  pointsPossible: number;
  comment: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function clampRowPoints(rowId: ApEnglishLangRubricRowId, value: unknown): number {
  const max = ROW_MAX_POINTS[rowId];
  const numeric =
    typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : 0;
  return Math.max(0, Math.min(numeric, max));
}

/**
 * Coerces a raw LLM `rows` object into a normalized, clamped score for every
 * rubric row — filling in zeros for missing or malformed rows.
 */
export function normalizeApEnglishLangRows(
  raw: unknown,
): Record<ApEnglishLangRubricRowId, ApEnglishLangRowScore> {
  const rows = isRecord(raw) ? raw : {};
  return Object.fromEntries(
    AP_ENGLISH_LANG_ROW_KEYS.map((rowId) => {
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
  ) as Record<ApEnglishLangRubricRowId, ApEnglishLangRowScore>;
}

/** Sums the earned points across rows, capped at the 6-point total. */
export function countApEnglishLangEarnedPoints(
  rows: Record<string, { pointsEarned: number }>,
): number {
  const sum = AP_ENGLISH_LANG_ROW_KEYS.reduce(
    (total, rowId) => total + (rows[rowId]?.pointsEarned ?? 0),
    0,
  );
  return Math.max(0, Math.min(sum, AP_ENGLISH_LANG_RUBRIC_TOTAL_POINTS));
}

function renderRubricRows(): string {
  return AP_ENGLISH_LANG_RUBRIC.rows
    .map(
      (row) =>
        `- ${row.rowId} (0-${row.maxPoints}) — ${row.title}: ${row.description}`,
    )
    .join('\n');
}

function renderProvidedSources(snapshot: ApEnglishLangSnapshot): string {
  if (snapshot.sources.length === 0) {
    return snapshot.frqType === 'argument'
      ? 'No provided text: this is the open argument question. Evaluate only the evidence the student actually supplies from their own knowledge. Do not credit or invent facts, statistics, or examples the student did not provide.'
      : 'No provided text.';
  }

  const label =
    snapshot.frqType === 'synthesis' ? 'Provided source' : 'Provided passage';

  const rendered = snapshot.sources
    .map((source) => {
      const caption = source.caption ? `\nCaption: ${source.caption}` : '';
      return `${label} ${source.position}: ${source.title}\nAttribution: ${source.attribution}${caption}\n${source.body}`;
    })
    .join('\n\n');

  if (snapshot.frqType === 'synthesis') {
    return (
      `${rendered}\n\nSource-count rule: this response must draw on at least ` +
      `${SYNTHESIS_SOURCE_RULES.minSourcesForOnePoint} of the sources above to earn 1 point on ` +
      `Evidence & Commentary, and at least ${SYNTHESIS_SOURCE_RULES.minSourcesForTwoOrMorePoints} ` +
      'to earn 2 or more. Count sources actually used as evidence, not merely mentioned.'
    );
  }

  return rendered;
}

export function buildApEnglishLangGradingSystemPrompt(
  studentFirstName: string,
): string {
  return `You are the AP English Language Grading Assistant. Return ONLY valid JSON with the schema:
{
  "rubricVersion": "${AP_ENGLISH_LANG_RUBRIC.rubricId}",
  "rows": {
    "thesis": {"pointsEarned": 0-1, "comment": string},
    "evidence-commentary": {"pointsEarned": 0-4, "comment": string},
    "sophistication": {"pointsEarned": 0-1, "comment": string}
  },
  "overallComment": string
}
Score the response against the shared 6-point AP Language analytic rubric:
${renderRubricRows()}
Award points only on the behavioral criteria: summary or prompt-restatement cannot earn the thesis point; a line of reasoning with specific evidence and real commentary is required for the top of Evidence & Commentary; naming a rhetorical device or source without explaining its effect on the audience or argument caps Evidence & Commentary at 2; sophistication is never earned by ornate vocabulary or a single tacked-on counterargument sentence — it must be sustained.
On a synthesis response, apply the source-count rule given in the prompt as a hard ceiling on Evidence & Commentary regardless of writing quality.
Use only evidence from the essay and the provided material. Each row comment must be specific and located.
In overallComment, start with "${studentFirstName}," and continue with concise, actionable, rubric-anchored AP Language feedback naming the one or two highest-leverage next steps.`;
}

export function buildApEnglishLangGradingPrompt({
  snapshot,
  essayText,
  studentFirstName,
}: {
  snapshot: ApEnglishLangSnapshot;
  essayText: string;
  studentFirstName: string;
}): string {
  return `Student first name: ${studentFirstName}

AP English Language free-response question: ${snapshot.frqType}
Assignment prompt: ${snapshot.prompt}
Focus skill: ${snapshot.focusSkill}
Rubric: ${snapshot.rubric.rubricId}
Total points: ${snapshot.rubric.totalPoints}
Rows to score: ${AP_ENGLISH_LANG_ROW_KEYS.join(', ')}

Provided material:
${renderProvidedSources(snapshot)}

Essay:
${essayText}`;
}
