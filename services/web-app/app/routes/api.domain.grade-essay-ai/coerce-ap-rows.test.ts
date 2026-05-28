import { describe, expect, test } from 'bun:test';
import { coerceApRows } from './coerce-ap-rows';

describe('coerceApRows', () => {
  test('returns all three rows in canonical order', () => {
    const rows = coerceApRows({
      rows: [
        { key: 'sophistication', score: 1, comment: 'Nuanced.' },
        { key: 'thesis', score: 1, comment: 'Defensible.' },
        { key: 'evidence_commentary', score: 3, comment: 'Solid.' },
      ],
    });
    expect(rows).not.toBeNull();
    expect(rows!.map((r) => r.key)).toEqual([
      'thesis',
      'evidence_commentary',
      'sophistication',
    ]);
    expect(rows![1].score).toBe(3);
  });

  test('clamps scores to each row max (evidence 0-4, thesis 0-1)', () => {
    const rows = coerceApRows({
      rows: [
        { key: 'thesis', score: 5, comment: '' },
        { key: 'evidence_commentary', score: 9, comment: '' },
        { key: 'sophistication', score: 3, comment: '' },
      ],
    });
    expect(rows![0].score).toBe(1); // thesis capped at 1
    expect(rows![1].score).toBe(4); // evidence capped at 4
    expect(rows![2].score).toBe(1); // sophistication capped at 1
  });

  test('fills missing rows with 0', () => {
    const rows = coerceApRows({
      rows: [{ key: 'thesis', score: 1, comment: 'Good.' }],
    });
    expect(rows![1].score).toBe(0);
    expect(rows![2].score).toBe(0);
  });

  test('rounds fractional scores', () => {
    const rows = coerceApRows({
      rows: [
        { key: 'thesis', score: 0.4, comment: '' },
        { key: 'evidence_commentary', score: 2.6, comment: '' },
        { key: 'sophistication', score: 0, comment: '' },
      ],
    });
    expect(rows![0].score).toBe(0);
    expect(rows![1].score).toBe(3);
  });

  test('clamps negative scores to 0', () => {
    const rows = coerceApRows({
      rows: [{ key: 'thesis', score: -1, comment: '' }],
    });
    expect(rows![0].score).toBe(0);
  });

  test('returns null when rows is not an array', () => {
    expect(coerceApRows({ rows: 'nope' })).toBeNull();
    expect(coerceApRows({})).toBeNull();
    expect(coerceApRows(null)).toBeNull();
  });

  test('ignores malformed row entries but still returns canonical rows', () => {
    const rows = coerceApRows({
      rows: [
        { key: 'thesis', score: 1, comment: 'ok' },
        { nonsense: true },
        { key: 'evidence_commentary', score: 'bad' },
      ],
    });
    expect(rows).not.toBeNull();
    expect(rows![0].score).toBe(1);
    expect(rows![1].score).toBe(0); // evidence had invalid score → 0
  });
});
