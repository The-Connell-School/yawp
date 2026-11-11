import { describe, expect, it } from 'bun:test';

import { PREWRITING_PROMPT_CONFIG } from '~/domain/assignment-types/prewriting-assignment-type';
import { THESIS_STATEMENT_PROMPT_CONFIG } from '~/domain/assignment-types/thesis-statement-assignment-type';

import { isWritingStepKind, scoringLine, WRITING_STEP_COPY } from './content';

describe('isWritingStepKind', () => {
  it('is true only for the standalone Prewriting and Thesis Statement kinds', () => {
    expect(isWritingStepKind('prewriting')).toBe(true);
    expect(isWritingStepKind('thesis_statement')).toBe(true);
    expect(isWritingStepKind('class_starter')).toBe(false);
    expect(isWritingStepKind(null)).toBe(false);
  });
});

describe('scoringLine', () => {
  it('names the one category when there is one', () => {
    expect(scoringLine(WRITING_STEP_COPY.prewriting.rubric)).toBe(
      'Scored 1–5 on Focus and exploration.'
    );
  });

  it('names each category with its weight when there are several', () => {
    expect(scoringLine(WRITING_STEP_COPY.thesis_statement.rubric)).toBe(
      'Scored 1–5 on Thesis/Content (85%) and Grammar/Syntax (15%).'
    );
  });
});

describe('parity with the grader', () => {
  it('says prewriting does not grade grammar because the grader is told not to', () => {
    expect(PREWRITING_PROMPT_CONFIG.gradingInstructions).toMatch(
      /do not grade grammar/i
    );
    expect(WRITING_STEP_COPY.prewriting.scoringNote).toMatch(
      /grammar.*not graded/i
    );
  });

  it('says only the thesis sentence is graded because the grader is told so', () => {
    expect(THESIS_STATEMENT_PROMPT_CONFIG.gradingInstructions).toMatch(
      /thesis sentence only/i
    );
    expect(WRITING_STEP_COPY.thesis_statement.scoringNote).toMatch(
      /only the thesis sentence is graded/i
    );
  });
});
