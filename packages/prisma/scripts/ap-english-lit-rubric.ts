/**
 * The College Board AP English Literature and Composition analytic rubric.
 *
 * Since 2019 all three free-response questions (poetry analysis, prose fiction
 * analysis, and the literary argument) are scored on the SAME 6-point analytic
 * rubric, divided into three rows:
 *
 *   Row A — Thesis .............. 0-1 point
 *   Row B — Evidence & Commentary 0-4 points
 *   Row C — Sophistication ...... 0-1 point
 *
 * This module encodes that rubric as structured, typed data so the grading
 * engine, the coaching layer, and the UI all read from a single source of
 * truth. The descriptors are behavioral: they define what a reader looks for
 * at each score point, not vague notions of "good writing".
 */

export const AP_ENGLISH_LIT_RUBRIC_ID = 'ap-english-lit-frq-2019' as const;
export const AP_ENGLISH_LIT_RUBRIC_TOTAL_POINTS = 6 as const;

export type ApEnglishLitRubricRowId = 'thesis' | 'evidence-commentary' | 'sophistication';

export type ApEnglishLitRubricLevel = {
  points: number;
  summary: string;
  /** Behavioral criteria a reader uses to award this score point. */
  criteria: string[];
};

export type ApEnglishLitRubricRow = {
  rowId: ApEnglishLitRubricRowId;
  /** The letter used in College Board scoring guidance (A / B / C). */
  label: string;
  title: string;
  maxPoints: number;
  description: string;
  levels: ApEnglishLitRubricLevel[];
  /** Common ways students fail to earn points on this row. */
  commonFailures: string[];
};

const THESIS_ROW: ApEnglishLitRubricRow = {
  rowId: 'thesis',
  label: 'A',
  title: 'Thesis',
  maxPoints: 1,
  description:
    'Responds to the prompt with a thesis that presents a defensible interpretation. ' +
    'The thesis may appear anywhere in the response and may span more than one sentence.',
  levels: [
    {
      points: 0,
      summary: 'No defensible thesis',
      criteria: [
        'Restates the prompt rather than interpreting the text.',
        'Only describes or summarizes the text.',
        'Makes only generic or vague observations with no interpretive stance.',
      ],
    },
    {
      points: 1,
      summary: 'Defensible interpretation',
      criteria: [
        'Makes an arguable interpretive claim about the text.',
        'A reasonable reader could disagree with the claim.',
        'Frames technique in service of meaning rather than listing devices.',
      ],
    },
  ],
  commonFailures: [
    'Restating the prompt as if it were a thesis.',
    'Summarizing what the text is about instead of arguing an interpretation.',
    'Listing devices ("uses imagery, metaphor, and personification") with no unifying claim.',
  ],
};

const EVIDENCE_COMMENTARY_ROW: ApEnglishLitRubricRow = {
  rowId: 'evidence-commentary',
  label: 'B',
  title: 'Evidence and Commentary',
  maxPoints: 4,
  description:
    'Selects and uses specific, relevant evidence to support a line of reasoning, ' +
    'and provides commentary that explains how the evidence supports that reasoning. ' +
    'The load-bearing idea is a single sustained line of reasoning, not a scatter of ' +
    'disconnected observations. Grammar or organization severe enough to obscure ' +
    'meaning caps the response below 4.',
  levels: [
    {
      points: 0,
      summary: 'No relevant evidence',
      criteria: [
        'Restates the thesis (if present), repeats the prompt, or offers off-topic material.',
      ],
    },
    {
      points: 1,
      summary: 'General evidence, summarizing commentary',
      criteria: [
        'Evidence is mostly general rather than specific.',
        'Commentary summarizes the evidence rather than explaining it.',
      ],
    },
    {
      points: 2,
      summary: 'Some specific evidence, faulty reasoning',
      criteria: [
        'Includes some specific, relevant evidence.',
        'Commentary explains a little, but the line of reasoning is absent or does not hold together.',
      ],
    },
    {
      points: 3,
      summary: 'Line of reasoning supported, one technique',
      criteria: [
        'Specific evidence supports all claims in a line of reasoning.',
        'Commentary explains how the evidence supports that line of reasoning.',
        'Engages at least one literary element or technique.',
      ],
    },
    {
      points: 4,
      summary: 'Consistent reasoning, multiple techniques',
      criteria: [
        'Specific evidence supports all claims in a coherent line of reasoning.',
        'Commentary consistently explains how the evidence supports the line of reasoning.',
        'Engages multiple literary elements or techniques.',
      ],
    },
  ],
  commonFailures: [
    'Evidence without commentary, or commentary that only paraphrases the quote.',
    'Abandoning the thesis after the first paragraph, breaking the line of reasoning.',
    'Over-quoting and under-analyzing — quoting at length instead of analyzing at length.',
    'Drawing evidence only from the opening lines instead of across the whole text.',
  ],
};

const SOPHISTICATION_ROW: ApEnglishLitRubricRow = {
  rowId: 'sophistication',
  label: 'C',
  title: 'Sophistication',
  maxPoints: 1,
  description:
    'Demonstrates sophistication of thought and/or develops a complex literary argument. ' +
    'Sophistication is a byproduct of doing the other rows exceptionally well and thinking ' +
    'honestly — it is never earned by ornate vocabulary or a passing nod to other readings.',
  levels: [
    {
      points: 0,
      summary: 'No sophistication',
      criteria: [
        'Attempts complexity only through sweeping generalization.',
        'Uses ornate language in place of genuine insight.',
        'Mentions alternative interpretations without developing them.',
      ],
    },
    {
      points: 1,
      summary: 'Sophisticated argument',
      criteria: [
        'Identifies and explores tensions, ironies, or complexities in the text.',
        'Situates the interpretation within a broader context or pattern of meaning.',
        'Accounts for alternative interpretations or accounts for complexity.',
        'Sustains a vivid, persuasive, and controlled style throughout.',
      ],
    },
  ],
  commonFailures: [
    'Forced sophistication — big words and false profundity instead of genuine complexity.',
    'A single throwaway sentence about "another interpretation".',
    'Sweeping generalizations about literature or humanity that readers are trained to reject.',
  ],
};

export const AP_ENGLISH_LIT_RUBRIC = {
  rubricId: AP_ENGLISH_LIT_RUBRIC_ID,
  totalPoints: AP_ENGLISH_LIT_RUBRIC_TOTAL_POINTS,
  rows: [THESIS_ROW, EVIDENCE_COMMENTARY_ROW, SOPHISTICATION_ROW],
} as const;

export function getApEnglishLitRubricRow(
  rowId: ApEnglishLitRubricRowId,
): ApEnglishLitRubricRow {
  const row = AP_ENGLISH_LIT_RUBRIC.rows.find((r) => r.rowId === rowId);
  if (!row) {
    throw new Error(`Unknown AP English Literature rubric row: ${rowId}`);
  }
  return row;
}
