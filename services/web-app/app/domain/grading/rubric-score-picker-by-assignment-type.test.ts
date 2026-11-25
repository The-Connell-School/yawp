import { describe, expect, test } from 'bun:test';
import { buildScoreOptions } from './rubric-display';
import { EXIT_TICKET_SCORE_BANDS } from '~/domain/assignment-types/exit-ticket-rubric';
import { CLASS_STARTER_SCORE_LABELS } from '~/domain/assignment-types/class-starter-rubric';
import { GALS_CLAIMS_SCORE_LABELS } from '~/domain/assignment-types/gals-claims-rubric';

type AssignmentRubricCase = {
  assignmentType: string;
  min: number;
  max: number;
  scoreLabels?: { value: number; label: string }[];
  bands?: { min: number; max: number; label: string; description: string }[];
  step?: number;
};

const CASES: AssignmentRubricCase[] = [
  {
    assignmentType: 'class_starter',
    min: 0,
    max: 3,
    scoreLabels: CLASS_STARTER_SCORE_LABELS,
  },
  {
    assignmentType: 'exit_ticket',
    min: 0,
    max: 100,
    bands: EXIT_TICKET_SCORE_BANDS,
    step: 1,
  },
  {
    assignmentType: 'short_response',
    min: 1,
    max: 5,
    bands: [
      { min: 1, max: 1, label: 'Absent', description: '' },
      { min: 2, max: 2, label: 'Hardly there', description: '' },
      { min: 3, max: 3, label: 'Showed up', description: '' },
      { min: 4, max: 5, label: 'All in', description: '' },
    ],
  },
  {
    assignmentType: 'claim_evidence_reasoning',
    min: 1,
    max: 5,
  },
  {
    assignmentType: 'gals_claims',
    min: 0,
    max: 1,
    scoreLabels: GALS_CLAIMS_SCORE_LABELS,
  },
  {
    assignmentType: 'five_paragraph_essay',
    min: 1,
    max: 5,
  },
  {
    assignmentType: 'thesis_statement',
    min: 1,
    max: 5,
  },
  {
    assignmentType: 'prewriting',
    min: 1,
    max: 5,
  },
];

describe('grading score pickers by assignment type', () => {
  for (const rubric of CASES) {
    test(`${rubric.assignmentType} lists each band/category once`, () => {
      const options = buildScoreOptions(
        rubric.min,
        rubric.max,
        rubric.scoreLabels,
        rubric.step,
        rubric.bands
      );
      const labels = options.map((option) => option.label);
      expect(new Set(labels).size).toBe(labels.length);
      expect(options.length).toBeGreaterThan(0);
    });
  }
});