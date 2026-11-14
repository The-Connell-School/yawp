import { describe, expect, test } from 'bun:test';
import {
  assignmentTypeHasHowItWorksGuide,
  assignmentTypeHowItWorksPath,
  siteLicenseLockedTileHasHowItWorksGuide,
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
        title: 'Pre-writing',
        kind: 'prewriting',
      })
    ).toBe(true);
    expect(
      assignmentTypeHasHowItWorksGuide({
        title: 'Thesis Builder',
        kind: 'thesis_statement',
      })
    ).toBe(true);
  });

  test('recognizes site-license locked carousel tile keys', () => {
    expect(siteLicenseLockedTileHasHowItWorksGuide('daily_pages')).toBe(true);
    expect(siteLicenseLockedTileHasHowItWorksGuide('not-a-tile')).toBe(false);
  });

  test('excludes types without a rendered guide', () => {
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

describe('the Exit Ticket guide (behind assignment-type-landing-v2)', () => {
  const exitTicket = { title: 'Exit Ticket', kind: 'exit_ticket' };

  test('has a guide when the landing pages are on', () => {
    expect(
      assignmentTypeHasHowItWorksGuide(exitTicket, { exitTicketGuide: true })
    ).toBe(true);
  });

  test('has none while they are off, as before', () => {
    expect(assignmentTypeHasHowItWorksGuide(exitTicket)).toBe(false);
    expect(
      assignmentTypeHasHowItWorksGuide(exitTicket, { exitTicketGuide: false })
    ).toBe(false);
  });

  test('the option opens no guide for any other type', () => {
    expect(
      assignmentTypeHasHowItWorksGuide(
        { title: 'Daily Pages', kind: 'daily_pages' },
        { exitTicketGuide: true }
      )
    ).toBe(false);
  });
});
