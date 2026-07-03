import { describe, expect, it } from 'bun:test';
import { sanitizeCircularProgress } from './circular-progress';

describe('sanitizeCircularProgress', () => {
  it('uses zero for non-finite progress values', () => {
    expect(sanitizeCircularProgress(Number.NaN)).toBe(0);
    expect(sanitizeCircularProgress(Number.POSITIVE_INFINITY)).toBe(0);
    expect(sanitizeCircularProgress(Number.NEGATIVE_INFINITY)).toBe(0);
  });

  it('clamps progress to the SVG range', () => {
    expect(sanitizeCircularProgress(-10)).toBe(0);
    expect(sanitizeCircularProgress(42)).toBe(42);
    expect(sanitizeCircularProgress(150)).toBe(100);
  });
});
