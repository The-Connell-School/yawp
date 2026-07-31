// The College Board DBQ and LEQ rubrics in reader-facing wording.
//
// The tutor already carries these rows as coaching instructions
// (`tutor-prompt.ts`) and the AI grader already scores them point by point
// (`api.domain.grade-essay-ai`), but until now nothing showed a teacher or a
// student what the points actually are — "complexity" only ever appeared
// inside a tutor turn. This is the one display copy of the rubric, keyed by
// the same point keys the grader scores so the two can't drift apart.

export type ApHistoryRubricPoint = {
  // Matches the point key the AI grader returns for this row.
  key: string;
  label: string;
  summary: string;
};

export const AP_HISTORY_DBQ_RUBRIC_POINTS = [
  {
    key: 'thesis',
    label: 'Thesis / Claim',
    summary:
      'A defensible claim with a line of reasoning, in the intro or the conclusion. Restating the prompt earns nothing.',
  },
  {
    key: 'contextualization',
    label: 'Contextualization',
    summary:
      'Specific historical context around the prompt — a real arc, not a passing phrase like "it was a turbulent time."',
  },
  {
    key: 'document_use_describes',
    label: 'Evidence: Document Content',
    summary:
      'Accurately describes what at least three of the documents say, tied to the prompt.',
  },
  {
    key: 'document_use_supports_argument',
    label: 'Evidence: Documents as Support',
    summary:
      'Uses at least four documents as evidence for the argument, rather than summarizing them one at a time.',
  },
  {
    key: 'outside_evidence',
    label: 'Evidence: Outside Knowledge',
    summary:
      'At least one specific piece of evidence beyond the documents — a named law, person, case, or event inside the prompt’s window.',
  },
  {
    key: 'sourcing',
    label: 'Sourcing (HIPP)',
    summary:
      'For at least two documents, explains why the point of view, purpose, historical situation, or audience matters to the argument.',
  },
  {
    key: 'complexity',
    label: 'Complexity',
    summary:
      'Sophisticated argument: qualification ("while X dominated, Y persisted"), multiple causes or perspectives, or a connection across periods.',
  },
] as const satisfies readonly ApHistoryRubricPoint[];

export const AP_HISTORY_LEQ_RUBRIC_POINTS = [
  {
    key: 'thesis',
    label: 'Thesis / Claim',
    summary:
      'A defensible claim with a line of reasoning, in the intro or the conclusion. Restating the prompt earns nothing.',
  },
  {
    key: 'contextualization',
    label: 'Contextualization',
    summary:
      'Specific historical context around the prompt — a real arc, not a passing phrase.',
  },
  {
    key: 'evidence',
    label: 'Evidence: Specific Examples',
    summary:
      'At least two specific pieces of historical evidence relevant to the prompt. "Social movements grew" is never specific enough.',
  },
  {
    key: 'supporting_evidence',
    label: 'Evidence: Evidence as Argument',
    summary:
      'Uses at least two of those examples to support the argument, rather than listing facts.',
  },
  {
    key: 'analysis_reasoning',
    label: 'Historical Reasoning',
    summary:
      'Frames the argument with causation, comparison, continuity and change, or periodization — visible in the structure, not just named.',
  },
  {
    key: 'complexity',
    label: 'Complexity',
    summary:
      'Sophisticated argument: qualification ("while X dominated, Y persisted"), multiple causes or perspectives, or a connection across periods.',
  },
] as const satisfies readonly ApHistoryRubricPoint[];

export type ApHistoryDbqPointKey =
  (typeof AP_HISTORY_DBQ_RUBRIC_POINTS)[number]['key'];
export type ApHistoryLeqPointKey =
  (typeof AP_HISTORY_LEQ_RUBRIC_POINTS)[number]['key'];

export function apHistoryRubricPoints(
  essayType: 'dbq' | 'leq'
): readonly ApHistoryRubricPoint[] {
  return essayType === 'dbq'
    ? AP_HISTORY_DBQ_RUBRIC_POINTS
    : AP_HISTORY_LEQ_RUBRIC_POINTS;
}
