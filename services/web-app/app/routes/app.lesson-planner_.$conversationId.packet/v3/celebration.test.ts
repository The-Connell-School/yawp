import { describe, expect, test } from 'bun:test';
import { celebrationParts, CELEBRATION_MS, YAWP_LINE } from './celebration';

describe("setting the lesson celebrates (Brian's round 5, item 11)", () => {
  test('the yawp line, word for word', () => {
    expect(YAWP_LINE).toBe('Hear me yawp, hear me yawp, hear me yaaaaaawp!');
  });
  test('confetti and the line; with Reduce Motion, the line only', () => {
    expect(celebrationParts(false)).toEqual({ confetti: true, line: YAWP_LINE });
    expect(celebrationParts(true)).toEqual({ confetti: false, line: YAWP_LINE });
  });
  test('it is short', () => {
    expect(CELEBRATION_MS).toBeLessThanOrEqual(3000);
  });
});
