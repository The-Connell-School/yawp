import { describe, expect, test } from 'bun:test';

import { getParagraphMode } from '~/domain/assignment-types/daily-pages-paragraph-modes';
import { DAILY_PAGES_ANALYZE_SAMPLE_ASSIGNMENT } from '~/domain/assignment-types/daily-pages-analyze-sample-entries';

import { dailyPagesTutorEvaluationV1 } from './daily-pages-tutor-evaluation.v1';

const suite = dailyPagesTutorEvaluationV1;
const byId = (id: string) => suite.cases.find((c) => c.id === id)!;

/**
 * Scenarios for the Daily Pages tutor, one per phase of a student's draft:
 * no point yet, a quote with no analysis, a revision after feedback, a
 * finished paragraph, a request to write it for them, a hedged opener, a
 * safety disclosure — and the Argue paragraph type's two failure shapes.
 */
describe('the Daily Pages tutor evaluation', () => {
  test('covers each phase of an Analyze draft', () => {
    for (const id of [
      'analyze-no-claim',
      'analyze-quote-no-analysis',
      'analyze-analysis-added',
      'analyze-complete',
      'analyze-write-it-for-me',
      'analyze-hedged',
      'safety-disclosure',
    ]) {
      expect(byId(id)).toBeDefined();
    }
  });

  test('covers Argue a position too', () => {
    expect(byId('argue-straddle').paragraphMode).toBe('argue');
    expect(byId('argue-untested').paragraphMode).toBe('argue');
  });

  test('gives every case a unique id, a phase, a message and something to judge', () => {
    const ids = suite.cases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of suite.cases) {
      expect(c.phase.length).toBeGreaterThan(3);
      expect(c.studentMessage.trim().length).toBeGreaterThan(0);
      expect(c.criteria.length).toBeGreaterThan(0);
      for (const criterion of c.criteria) {
        expect(criterion.requirement.length).toBeGreaterThan(20);
      }
    }
  });

  test('uses only paragraph types that are switched on', () => {
    for (const c of suite.cases) {
      if (c.paragraphMode) expect(getParagraphMode(c.paragraphMode)).not.toBeNull();
    }
  });

  test('runs the Analyze cases on the seeded Analyze assignment', () => {
    for (const c of suite.cases.filter((c) => c.paragraphMode === 'analyze')) {
      expect(c.assignment?.prompt as string).toBe(
        DAILY_PAGES_ANALYZE_SAMPLE_ASSIGNMENT.prompt
      );
    }
  });

  /** A follow-up is only a follow-up if there is an earlier answer to build on. */
  test('gives the revision case an earlier tutor question to answer', () => {
    const followUp = byId('analyze-analysis-added');
    expect(followUp.history.some((m) => m.agent === 'assistant')).toBe(true);
    expect(followUp.studentMessage).toBe('Give me feedback');
  });

  test('holds the safety case to the redirect, not to coaching', () => {
    const safety = byId('safety-disclosure');
    const requirements = safety.criteria.map((c) => c.requirement).join(' ');
    expect(requirements.toLowerCase()).toContain('counselor');
  });
});
