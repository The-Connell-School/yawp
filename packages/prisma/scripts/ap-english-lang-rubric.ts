/**
 * The College Board AP English Language and Composition analytic rubric.
 *
 * Since the 2019 redesign all three free-response questions (synthesis,
 * rhetorical analysis, and argument) are scored on the SAME 6-point analytic
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
 *
 * Two rules distinguish this rubric from its AP Literature sibling and are
 * encoded explicitly below:
 *   1. Synthesis responses have hard Row B caps driven by how many provided
 *      sources the student actually uses as evidence (see SYNTHESIS_SOURCE_RULES).
 *   2. Rhetorical analysis at Row B 4 requires explaining how MULTIPLE
 *      rhetorical choices contribute to the writer's purpose — one choice
 *      explained well tops out at 3.
 */

export const AP_ENGLISH_LANG_RUBRIC_ID = 'ap-english-lang-frq-2019' as const;
export const AP_ENGLISH_LANG_RUBRIC_TOTAL_POINTS = 6 as const;

export type ApEnglishLangRubricRowId =
  | 'thesis'
  | 'evidence-commentary'
  | 'sophistication';

export type ApEnglishLangRubricLevel = {
  points: number;
  summary: string;
  /** Behavioral criteria a reader uses to award this score point. */
  criteria: string[];
};

export type ApEnglishLangRubricRow = {
  rowId: ApEnglishLangRubricRowId;
  /** The letter used in College Board scoring guidance (A / B / C). */
  label: string;
  title: string;
  maxPoints: number;
  description: string;
  levels: ApEnglishLangRubricLevel[];
  /** Common ways students fail to earn points on this row. */
  commonFailures: string[];
};

const THESIS_ROW: ApEnglishLangRubricRow = {
  rowId: 'thesis',
  label: 'A',
  title: 'Thesis',
  maxPoints: 1,
  description:
    'Responds to the prompt with a thesis that presents a defensible position. ' +
    'The thesis may appear anywhere in the response and may span more than one ' +
    'sentence. It does not have to preview the body paragraphs, and it does not ' +
    'have to be the first sentence of the introduction.',
  levels: [
    {
      points: 0,
      summary: 'No defensible thesis',
      criteria: [
        'Restates the prompt rather than taking a position on it.',
        'Only describes the issue, or summarizes the provided sources or passage.',
        'States an obvious fact that no reasonable reader would dispute.',
        'Offers a position so vague it commits to nothing.',
      ],
    },
    {
      points: 1,
      summary: 'Defensible position with a line of reasoning',
      criteria: [
        'Takes a position a reasonable reader could disagree with.',
        'Responds to what the prompt actually asks, not an adjacent question.',
        'Signals the reasoning that will organize the argument.',
      ],
    },
  ],
  commonFailures: [
    'Restating the prompt as if it were a thesis.',
    'Announcing the essay ("In this essay I will discuss...") instead of asserting a claim.',
    'Naming rhetorical devices in the thesis rather than making a claim about the writer\'s purpose.',
    'Hedging so thoroughly that no position survives.',
  ],
};

const EVIDENCE_COMMENTARY_ROW: ApEnglishLangRubricRow = {
  rowId: 'evidence-commentary',
  label: 'B',
  title: 'Evidence and Commentary',
  maxPoints: 4,
  description:
    'Selects and uses specific, relevant evidence to support all claims in a line ' +
    'of reasoning, and provides commentary that explains how that evidence supports ' +
    'the reasoning. The load-bearing idea is a single sustained line of reasoning, ' +
    'not a scatter of disconnected observations. On synthesis, the number of provided ' +
    'sources used as evidence sets a hard ceiling on this row.',
  levels: [
    {
      points: 0,
      summary: 'No relevant evidence',
      criteria: [
        'Restates the thesis (if present), repeats provided information, or offers material irrelevant to the prompt.',
        'On synthesis: draws on fewer than two of the provided sources.',
      ],
    },
    {
      points: 1,
      summary: 'General evidence, summarizing commentary',
      criteria: [
        'Evidence is mostly general rather than specific.',
        'Commentary summarizes the evidence rather than explaining how it supports the argument.',
        'On synthesis: uses at least two of the provided sources.',
      ],
    },
    {
      points: 2,
      summary: 'Some specific evidence, no working line of reasoning',
      criteria: [
        'Includes some specific, relevant evidence.',
        'Commentary explains how some evidence relates to the argument.',
        'No line of reasoning is established, or the line of reasoning does not hold together.',
        'On synthesis: uses at least three of the provided sources.',
      ],
    },
    {
      points: 3,
      summary: 'Line of reasoning supported, explained in part',
      criteria: [
        'Specific evidence supports all claims in a line of reasoning.',
        'Commentary explains how some of the evidence supports that line of reasoning.',
        'On rhetorical analysis: explains how at least one rhetorical choice contributes to the writer\'s purpose.',
      ],
    },
    {
      points: 4,
      summary: 'Consistent commentary across a coherent line of reasoning',
      criteria: [
        'Specific evidence supports all claims in a coherent line of reasoning.',
        'Commentary consistently explains how the evidence supports the line of reasoning.',
        'On rhetorical analysis: explains how MULTIPLE rhetorical choices contribute to the writer\'s argument, purpose, or message.',
      ],
    },
  ],
  commonFailures: [
    'Walking through sources one per paragraph instead of synthesizing them into one argument.',
    'Summarizing a source rather than using it as evidence for the student\'s own claim.',
    'Naming a rhetorical device without explaining its effect on the audience.',
    'Cataloging devices in sequence instead of building an argument about how they work together.',
    'Vague evidence — "studies show", "many people believe" — with nothing specific behind it.',
    'Abandoning the thesis after the first body paragraph, breaking the line of reasoning.',
  ],
};

const SOPHISTICATION_ROW: ApEnglishLangRubricRow = {
  rowId: 'sophistication',
  label: 'C',
  title: 'Sophistication',
  maxPoints: 1,
  description:
    'Demonstrates sophistication of thought and/or a complex understanding of the ' +
    'rhetorical situation. Sophistication must be part of a well-considered argument ' +
    'sustained across the response — it is never earned by a single ornate phrase, an ' +
    'impressive vocabulary, or one tacked-on sentence of counterargument.',
  levels: [
    {
      points: 0,
      summary: 'No sophistication',
      criteria: [
        'Attempts complexity only through sweeping generalization.',
        'Uses ornate or elevated language in place of genuine insight.',
        'Mentions a counterargument or limitation in passing without developing it.',
        'Style is uneven — a strong opening followed by flat prose.',
      ],
    },
    {
      points: 1,
      summary: 'Sophisticated argument',
      criteria: [
        'Crafts a nuanced argument by recognizing and engaging genuine tensions or complexities in the issue.',
        'Articulates the implications or limitations of the argument or of the rhetorical situation.',
        'Situates the argument in a broader context that genuinely illuminates it.',
        'Sustains a vivid, persuasive, and controlled style THROUGHOUT the response.',
      ],
    },
  ],
  commonFailures: [
    'Forced sophistication — big words and false profundity instead of genuine complexity.',
    'A single throwaway "some may disagree" sentence presented as counterargument.',
    'Sweeping generalizations about society or human nature that readers are trained to reject.',
    'One vivid paragraph in an otherwise plain essay — style must be sustained.',
  ],
};

export const AP_ENGLISH_LANG_RUBRIC = {
  rubricId: AP_ENGLISH_LANG_RUBRIC_ID,
  totalPoints: AP_ENGLISH_LANG_RUBRIC_TOTAL_POINTS,
  rows: [THESIS_ROW, EVIDENCE_COMMENTARY_ROW, SOPHISTICATION_ROW],
} as const;

export function getApEnglishLangRubricRow(
  rowId: ApEnglishLangRubricRowId,
): ApEnglishLangRubricRow {
  const row = AP_ENGLISH_LANG_RUBRIC.rows.find((r) => r.rowId === rowId);
  if (!row) {
    throw new Error(`Unknown AP English Language rubric row: ${rowId}`);
  }
  return row;
}

/**
 * On the synthesis question, Row B carries source-count floors that no amount
 * of writing quality can override. A response drawing on only one source
 * cannot reach the "at least two sources" bullet that defines a score of 1.
 */
export const SYNTHESIS_SOURCE_RULES = {
  /** Provided sources on a real exam prompt (at least one of them a visual). */
  providedSources: { min: 6, max: 7 },
  minSourcesForOnePoint: 2,
  minSourcesForTwoOrMorePoints: 3,
} as const;

/**
 * The highest Evidence & Commentary score reachable given how many provided
 * sources a synthesis response actually uses as evidence.
 *
 *   0-1 sources → 0    (below the floor for a score of 1)
 *   2 sources   → 1
 *   3+ sources  → 4    (no source-driven cap; quality decides)
 */
export function maxEvidenceCommentaryForSourcesCited(
  sourcesCited: number,
): number {
  if (!Number.isInteger(sourcesCited) || sourcesCited < 0) {
    throw new Error(
      `sourcesCited must be a non-negative integer, received: ${sourcesCited}`,
    );
  }
  if (sourcesCited >= SYNTHESIS_SOURCE_RULES.minSourcesForTwoOrMorePoints) {
    return EVIDENCE_COMMENTARY_ROW.maxPoints;
  }
  if (sourcesCited >= SYNTHESIS_SOURCE_RULES.minSourcesForOnePoint) {
    return 1;
  }
  return 0;
}
