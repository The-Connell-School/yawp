import { describe, expect, test } from 'bun:test';
import { buildApHistorySnapshot } from './schema';
import {
  AP_HISTORY_DBQ_RUBRIC_POINTS,
  AP_HISTORY_LEQ_RUBRIC_POINTS,
  apHistoryRubricPoints,
} from './rubric';

const libraryEntry = {
  externalKey: 'apush-dbq-new-deal-federal-power',
  course: 'apush',
  prompt: 'Evaluate the extent to which the New Deal changed federal power.',
  period: '1932-1980',
  periodNumber: 7,
  reasoningSkill: 'causation',
  defaultTimeMode: 'untimed',
  defaultDurationMinutes: 60,
  sources: [],
};

describe('AP History rubric points', () => {
  test('the DBQ list carries one row per point on the graded DBQ rubric', () => {
    const snapshot = buildApHistorySnapshot({
      ...libraryEntry,
      essayType: 'dbq',
    });

    expect(AP_HISTORY_DBQ_RUBRIC_POINTS).toHaveLength(
      snapshot.rubric.totalPoints
    );
  });

  test('the LEQ list carries one row per point on the graded LEQ rubric', () => {
    const snapshot = buildApHistorySnapshot({
      ...libraryEntry,
      essayType: 'leq',
    });

    expect(AP_HISTORY_LEQ_RUBRIC_POINTS).toHaveLength(
      snapshot.rubric.totalPoints
    );
  });

  test('point keys are unique within each rubric', () => {
    for (const points of [
      AP_HISTORY_DBQ_RUBRIC_POINTS,
      AP_HISTORY_LEQ_RUBRIC_POINTS,
    ]) {
      const keys = points.map((point) => point.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  test('every row has a label and a plain-language summary', () => {
    for (const point of [
      ...AP_HISTORY_DBQ_RUBRIC_POINTS,
      ...AP_HISTORY_LEQ_RUBRIC_POINTS,
    ]) {
      expect(point.label.trim().length).toBeGreaterThan(0);
      expect(point.summary.trim().length).toBeGreaterThan(0);
    }
  });

  test('the DBQ rubric names the moves the tutor coaches toward', () => {
    const labels = AP_HISTORY_DBQ_RUBRIC_POINTS.map((point) => point.label);

    expect(labels).toContain('Complexity');
    expect(labels).toContain('Sourcing (HIPP)');
  });

  test('the LEQ rubric carries complexity too, and no document rows', () => {
    const keys = AP_HISTORY_LEQ_RUBRIC_POINTS.map((point) => point.key);

    expect(keys).toContain('complexity');
    expect(keys.some((key) => key.startsWith('document_use'))).toBe(false);
  });

  test('rubric points are selected by essay type', () => {
    expect(apHistoryRubricPoints('dbq')).toBe(AP_HISTORY_DBQ_RUBRIC_POINTS);
    expect(apHistoryRubricPoints('leq')).toBe(AP_HISTORY_LEQ_RUBRIC_POINTS);
  });
});
