import { describe, expect, it } from 'bun:test';
import { planFittingPeriod } from './plan-fit';
import { readPlanSteps } from './plan-steps';

const total = (reply: string) => readPlanSteps(reply).reduce((sum, step) => sum + (step.minutes ?? 0), 0);

// The Douglass memoir lesson of the Nov 24 types test: 4+7+14+8+8+12+4 = 57 for a 50-minute period.
const MEMOIR = `# Learning to Read and Write

## Class starter (4 min)
Students write.

## Context (7 min)
Douglass and his world.

## Read and annotate Chapter 7 (14 min)
Read aloud, then annotate.

## Discussion (8 min)
What did Auld understand?

## Mini-lesson: analysis (8 min)
Quote and run.

## Short Response (12 min)
Students write.

## Closing and exit ticket (4 min)
Exit ticket.`;

describe('planFittingPeriod (S9: minutes that agree)', () => {
  it('brings a plan that runs long back to the period, from the longest step that is not writing', () => {
    const out = planFittingPeriod(MEMOIR, 50);
    expect(total(out)).toBe(50);
    expect(out).toContain('## Read and annotate Chapter 7 (7 min)');
    // Writing time is kept (Y1: students write a lot).
    expect(out).toContain('## Short Response (12 min)');
    expect(out).toContain('## Class starter (4 min)');
  });

  it('spreads a long overrun across steps rather than cutting one step to nothing', () => {
    const out = planFittingPeriod(MEMOIR, 42);
    expect(total(out)).toBe(42);
    for (const step of readPlanSteps(out)) expect(step.minutes!).toBeGreaterThanOrEqual(2);
    expect(out).toContain('## Short Response (12 min)');
  });

  it('gives the minutes of a plan that runs short to its longest step', () => {
    // Macbeth, Nov 24: "13 slides · 47 min" for a 50-minute period.
    const plan = `## Class starter (5 min)\nWrite.\n\n## Context (10 min)\nMap.\n\n## Read Act 1, Scene 1 together (12 min)\nRead.\n\n## Discussion (8 min)\nTalk.\n\n## Short Response (7 min)\nWrite.\n\n## Exit ticket (5 min)\nExit.`;
    const out = planFittingPeriod(plan, 50);
    expect(total(out)).toBe(50);
    expect(out).toContain('## Read Act 1, Scene 1 together (15 min)');
  });

  it('writes a range as the one number it now is', () => {
    const plan = `## Starter (5 min)\nWrite.\n\n## Read (20–25 min)\nRead.\n\n## Talk (25 min)\nTalk.`;
    const out = planFittingPeriod(plan, 50);
    expect(total(out)).toBe(50);
    expect(out).toContain('## Read (20 min)');
    expect(out).toContain('## Talk (25 min)');
  });

  it('changes nothing when the plan fits, the period is unknown, or nothing is timed', () => {
    const fits = MEMOIR.replace('(14 min)', '(7 min)');
    expect(planFittingPeriod(fits, 50)).toBe(fits);
    expect(planFittingPeriod(MEMOIR, null)).toBe(MEMOIR);
    expect(planFittingPeriod('## One\nText.\n\n## Two\nText.', 50)).toBe('## One\nText.\n\n## Two\nText.');
  });

  it('leaves a plan alone when it is far from the period (a two-day plan, a block)', () => {
    expect(planFittingPeriod(MEMOIR, 100)).toBe(MEMOIR);
    expect(planFittingPeriod(MEMOIR, 25)).toBe(MEMOIR);
  });

  it('never touches the slide deck or the subtitle', () => {
    const reply = `# Lesson\n\n## Douglass · English 11 · 50 min\n\n${MEMOIR.split('\n').slice(2).join('\n')}\n\n\`\`\`yawp-slides\n{"slides":[{"title":"Read (14 min)","minutes":14}]}\n\`\`\``;
    const out = planFittingPeriod(reply, 50);
    expect(out).toContain('## Douglass · English 11 · 50 min');
    expect(out).toContain('"title":"Read (14 min)","minutes":14');
    expect(total(out)).toBe(50);
  });

  it('fits a plan written with bold steps', () => {
    const plan = `**1. Starter (5 min)**\nWrite.\n\n**2. Read aloud (20 min)**\nRead.\n\n**3. Discussion (20 min)**\nTalk.\n\n**4. Exit ticket (10 min)**\nExit.`;
    const out = planFittingPeriod(plan, 50);
    expect(total(out)).toBe(50);
  });
});
