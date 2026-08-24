import { describe, expect, test } from 'bun:test';

import { buildLessonRecap } from './lesson-recap';

const LESSON = `# Passive Voice

## Why This Matters
"Mistakes were made." You have heard politicians say this.

## The Rule
In **active voice**, the subject does the action:
- *The dog bit the mailman.*

In **passive voice**, the subject receives the action:
- *The mailman was bitten by the dog.*

Let's be clear: passive voice isn't grammatically wrong.

Compare:
- Passive: *The experiment was conducted by the researchers.*
- Active: *The researchers conducted the experiment.*

**How to spot it:** Look for a form of "to be".

## See It In Action

**Example 1: Basic fix**
- ❌ Passive: The ball was thrown by Marcus.
- ✅ Active: Marcus threw the ball.
- *Why:* The active version is shorter.

**Example 2: Hidden actor**
- ❌ Passive: The homework was not completed.
- ✅ Active: I didn't complete the homework.

**Example 3: Sluggish sentence**
- ❌ Passive: The song was written by Beyoncé.
- ✅ Active: Beyoncé wrote the song.

## Quick Tip
**The "by zombies" test:** If you can add "by zombies" after the verb, it's passive.

---

## Practice Time

**Exercise 1:**
Rewrite in active voice:
"The test was failed by half the class."
`;

describe('buildLessonRecap', () => {
  const recap = buildLessonRecap(LESSON);

  test('leads with the rule the student is being asked to apply', () => {
    expect(recap).toContain('## The Rule');
    expect(recap).toContain('In **active voice**, the subject does the action');
  });

  test('is abridged: the rule stops before its every last aside', () => {
    // The panel sits beside a problem the student is mid-way through, so it
    // carries the top of the rule, not the whole lesson.
    expect(recap).toContain("Let's be clear");
    expect(recap).not.toContain('**How to spot it:**');
    expect(recap.length).toBeLessThan(LESSON.length);
  });

  test('keeps a couple of worked examples', () => {
    expect(recap).toContain('**Example 1: Basic fix**');
    expect(recap).toContain('**Example 2: Hidden actor**');
    expect(recap).not.toContain('**Example 3: Sluggish sentence**');
  });

  test('keeps the quick tip, which is the part worth re-reading mid-problem', () => {
    expect(recap).toContain('## Quick Tip');
    expect(recap).toContain('by zombies');
  });

  test('drops the framing and the exercises', () => {
    // "Why This Matters" sells the skill — a student already practising it has
    // bought in. The exercises are the set they are already working.
    expect(recap).not.toContain('## Why This Matters');
    expect(recap).not.toContain('## Practice Time');
    expect(recap).not.toContain('Exercise 1');
  });

  test('falls back to the opening of the lesson when it has no rule section', () => {
    const odd = `# Odd Lesson

Some opening paragraph.

Another paragraph.

A third paragraph.
`;
    const fallback = buildLessonRecap(odd);
    expect(fallback).toContain('Some opening paragraph.');
    expect(fallback).toContain('Another paragraph.');
    expect(fallback).not.toContain('A third paragraph.');
  });

  test('returns nothing for content it cannot read, rather than a blank panel', () => {
    expect(buildLessonRecap('')).toBe('');
    expect(buildLessonRecap('# Title only')).toBe('');
  });
});
