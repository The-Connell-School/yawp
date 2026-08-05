import { describe, expect, test } from 'bun:test';
import { extractFirstJsonObject } from './json-parse';
import { containsWholeWordName, scanTextsForName } from './leak-scan';
import {
  computeCategoryDeltas,
  summarizeDistribution,
  weightedPercent,
} from './scoring';

describe('extractFirstJsonObject', () => {
  test('parses clean JSON directly', () => {
    expect(extractFirstJsonObject('{"a":1}')).toEqual({ a: 1 });
  });

  test('extracts the first balanced object from surrounding prose', () => {
    const text = 'Sure, here is the JSON:\n{"a": 1, "b": {"c": 2}}\nHope that helps!';
    expect(extractFirstJsonObject(text)).toEqual({ a: 1, b: { c: 2 } });
  });

  test('extracts JSON from a markdown code fence', () => {
    const text = '```json\n{"overallComment": "Hi, {name}"}\n```';
    expect(extractFirstJsonObject(text)).toEqual({
      overallComment: 'Hi, {name}',
    });
  });

  test('ignores braces inside string values when matching depth', () => {
    const text = '{"overallComment": "Use {curly} braces carefully"}';
    expect(extractFirstJsonObject(text)).toEqual({
      overallComment: 'Use {curly} braces carefully',
    });
  });

  test('returns null when no JSON object is present', () => {
    expect(extractFirstJsonObject('no json here')).toBeNull();
  });
});

describe('containsWholeWordName', () => {
  test('matches case-insensitively', () => {
    expect(containsWholeWordName('MAYA did great work', 'maya')).toBe(true);
  });

  test('matches possessive forms', () => {
    expect(containsWholeWordName("Maya's thesis was strong", 'Maya')).toBe(
      true
    );
  });

  test('does not match substrings inside other words', () => {
    expect(containsWholeWordName('Mayans built pyramids', 'Maya')).toBe(
      false
    );
  });

  test('returns false for empty inputs', () => {
    expect(containsWholeWordName('', 'Maya')).toBe(false);
    expect(containsWholeWordName('some text', '')).toBe(false);
  });
});

describe('scanTextsForName', () => {
  test('reports every label where the name leaks', () => {
    const result = scanTextsForName(
      { system: 'no mention here', prompt: 'Essay by Maya Thompson' },
      'Maya'
    );
    expect(result.found).toBe(true);
    expect(result.matches).toEqual(['prompt']);
  });

  test('reports no leak when name is absent from all texts', () => {
    const result = scanTextsForName(
      { system: 'redacted', prompt: 'Essay by Alex' },
      'Maya'
    );
    expect(result.found).toBe(false);
    expect(result.matches).toEqual([]);
  });
});

describe('weightedPercent', () => {
  const weights = [
    { key: 'a', weight: 0.5, maxScore: 5 },
    { key: 'b', weight: 0.5, maxScore: 5 },
  ];

  test('computes a weighted 0-100 composite', () => {
    // a=5/5 (max), b=1/5 (min): 0.5*100 + 0.5*20 = 60
    const pct = weightedPercent(
      [
        { key: 'a', score: 5 },
        { key: 'b', score: 1 },
      ],
      weights
    );
    expect(pct).toBe(60);
  });

  test('all-max scores produce 100', () => {
    const pct = weightedPercent(
      [
        { key: 'a', score: 5 },
        { key: 'b', score: 5 },
      ],
      weights
    );
    expect(pct).toBe(100);
  });

  test('ignores categories not present in the weight table', () => {
    const pct = weightedPercent(
      [
        { key: 'a', score: 5 },
        { key: 'unknown', score: 1 },
      ],
      weights
    );
    // only 'a' contributes: 0.5 * 100 = 50
    expect(pct).toBe(50);
  });
});

describe('summarizeDistribution', () => {
  test('computes mean/median/stdev/min/max', () => {
    const dist = summarizeDistribution([1, 2, 3, 4, 5]);
    expect(dist.mean).toBe(3);
    expect(dist.median).toBe(3);
    expect(dist.min).toBe(1);
    expect(dist.max).toBe(5);
    expect(dist.n).toBe(5);
  });

  test('handles an even-length array (median averages the middle two)', () => {
    const dist = summarizeDistribution([1, 2, 3, 4]);
    expect(dist.median).toBe(2.5);
  });

  test('handles an empty array without throwing', () => {
    const dist = summarizeDistribution([]);
    expect(dist).toEqual({ mean: 0, median: 0, stdev: 0, min: 0, max: 0, n: 0 });
  });
});

describe('computeCategoryDeltas', () => {
  test('pairs categories by key and computes treatment-minus-control', () => {
    const deltas = computeCategoryDeltas(
      [
        { key: 'thesis', score: 4 },
        { key: 'evidence', score: 3 },
      ],
      [
        { key: 'thesis', score: 5 },
        { key: 'evidence', score: 3 },
      ]
    );
    expect(deltas).toEqual([
      { key: 'thesis', control: 4, treatment: 5, delta: 1 },
      { key: 'evidence', control: 3, treatment: 3, delta: 0 },
    ]);
  });
});
