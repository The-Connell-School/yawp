import { describe, expect, test } from 'bun:test';
import {
  computePromptVersionLabels,
  formatPromptDate,
} from './assignment-type-evaluation.shared';

describe('formatPromptDate', () => {
  test('renders month.day.year with periods', () => {
    expect(formatPromptDate('2026-07-14T16:00:00.000Z')).toBe('7.14.2026');
  });

  test('pads nothing — single-digit month/day stay unpadded', () => {
    expect(formatPromptDate('2026-01-02T16:00:00.000Z')).toBe('1.2.2026');
  });
});

describe('computePromptVersionLabels', () => {
  test('a lone prompt for a day gets the bare date, no letter', () => {
    const labels = computePromptVersionLabels([
      { id: 'p1', createdAt: '2026-07-14T16:00:00.000Z' },
    ]);
    expect(labels.get('p1')).toBe('7.14.2026');
  });

  test('two prompts on the same day get A/B suffixes in creation order', () => {
    const labels = computePromptVersionLabels([
      { id: 'p1', createdAt: '2026-07-14T14:00:00.000Z' },
      { id: 'p2', createdAt: '2026-07-14T16:00:00.000Z' },
    ]);
    expect(labels.get('p1')).toBe('7.14.2026 A');
    expect(labels.get('p2')).toBe('7.14.2026 B');
  });

  test('creation order determines the letter regardless of input array order', () => {
    const labels = computePromptVersionLabels([
      { id: 'later', createdAt: '2026-07-14T16:00:00.000Z' },
      { id: 'earlier', createdAt: '2026-07-14T14:00:00.000Z' },
    ]);
    expect(labels.get('earlier')).toBe('7.14.2026 A');
    expect(labels.get('later')).toBe('7.14.2026 B');
  });

  test('three same-day prompts get A, B, C', () => {
    const labels = computePromptVersionLabels([
      { id: 'p1', createdAt: '2026-07-14T10:00:00.000Z' },
      { id: 'p2', createdAt: '2026-07-14T14:00:00.000Z' },
      { id: 'p3', createdAt: '2026-07-14T18:00:00.000Z' },
    ]);
    expect(labels.get('p1')).toBe('7.14.2026 A');
    expect(labels.get('p2')).toBe('7.14.2026 B');
    expect(labels.get('p3')).toBe('7.14.2026 C');
  });

  test('prompts on different days each get the bare date', () => {
    const labels = computePromptVersionLabels([
      { id: 'p1', createdAt: '2026-07-13T16:00:00.000Z' },
      { id: 'p2', createdAt: '2026-07-14T16:00:00.000Z' },
    ]);
    expect(labels.get('p1')).toBe('7.13.2026');
    expect(labels.get('p2')).toBe('7.14.2026');
  });

  test('returns an empty map for an empty list', () => {
    expect(computePromptVersionLabels([]).size).toBe(0);
  });
});
