import { describe, expect, test } from 'bun:test';
import {
  assignmentTypeHasHowItWorksGuide,
  assignmentTypeHowItWorksPath,
} from './assignment-type-how-it-works';

describe('assignmentTypeHowItWorksPath', () => {
  test('builds the guide URL for an assignment type id', () => {
    expect(assignmentTypeHowItWorksPath('at-1')).toBe(
      '/app/assignment-types/at-1/how-it-works'
    );
  });
});

describe('assignmentTypeHasHowItWorksGuide', () => {
  test('includes free-tier assignment kinds with Kevin guides', () => {
    expect(
      assignmentTypeHasHowItWorksGuide({
        title: 'Class Starter',
        kind: 'class_starter',
      })
    ).toBe(true);
    expect(
      assignmentTypeHasHowItWorksGuide({
        title: 'Prewriting',
        kind: 'prewriting',
      })
    ).toBe(true);
    expect(
      assignmentTypeHasHowItWorksGuide({
        title: 'Thesis Statement',
        kind: 'thesis_statement',
      })
    ).toBe(true);
  });

  test('excludes types without a guide', () => {
    expect(
      assignmentTypeHasHowItWorksGuide({
        title: 'Exit Ticket',
        kind: 'exit_ticket',
      })
    ).toBe(false);
    expect(
      assignmentTypeHasHowItWorksGuide({
        title: 'Daily Pages',
        kind: 'daily_pages',
      })
    ).toBe(false);
  });
});
