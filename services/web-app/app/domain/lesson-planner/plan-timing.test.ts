import { describe, expect, test } from 'bun:test';
import { overTime, planMinutes } from './plan-timing';

describe("planMinutes (Brian's run 2, B2)", () => {
  test('adds up the timed steps, not the title that names the total', () => {
    expect(
      planMinutes(
        '# The Things They Carried — Day 1 (50 min)\n\n## Class starter (8 min)\n\nWrite.\n\n## Read aloud (25 min)\n\nRead.\n\n### Teacher moves (2 min)\n\nCircle.\n\n## Exit ticket (10–12 min)\n\nWrite.'
      )
    ).toBe(45);
  });

  test('reads a plan written as bold steps', () => {
    expect(
      planMinutes('**Class starter (5 min)** — write.\n\n**Read aloud** (30 min): the pages.\n\n**Pair talk (8 minutes)**')
    ).toBe(43);
  });

  test('null when nothing is timed', () => {
    expect(planMinutes('## Objective\n\nEnter the book.\n\n## Reading\n\nRead.')).toBeNull();
  });
});

describe('overTime', () => {
  test('how far past the period, or null when it fits', () => {
    expect(overTime(57, 50)).toBe(7);
    expect(overTime(50, 50)).toBeNull();
    expect(overTime(45, 50)).toBeNull();
    expect(overTime(57, null)).toBeNull();
    expect(overTime(null, 50)).toBeNull();
  });
});
