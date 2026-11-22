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

describe('a subtitle is not a step (re-test, Nov 22)', () => {
  test('"## Book 9 · 9th Grade · 50 min" over 50 minutes of steps is 50 minutes', () => {
    const body = ['## Book 9, *The Odyssey* · 9th Grade · 50 min', '', '## Class starter (5 min)', '', '## Close reading (45 min)'].join('\n');
    expect(planMinutes(body)).toBe(50);
  });
});

describe('a two-part subtitle is not a step (round 4, Nov 22: Hamlet’s plan "ran" 100 minutes)', () => {
  test('"## 12th Grade English · 50 minutes" over 50 minutes of steps is 50 minutes', () => {
    const body = ['## 12th Grade English · 50 minutes', '', '## Class starter (5 min)', '', '## Close reading (45 min)'].join('\n');
    expect(planMinutes(body)).toBe(50);
  });
  test('a step written with a dot is still a step', () => {
    const body = ['## Read aloud · 10 min', '', '## Close reading · 40 min'].join('\n');
    expect(planMinutes(body)).toBe(50);
  });
});
