/**
 * Minutes that agree (13-lesson review, Nov 22): the plan's steps are the
 * truth for the deck's agenda and its slides' minutes. Fixtures are real
 * replies from the review (Macbeth's deck said 53 minutes for a 50-minute
 * plan).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { deckMatchingPlan, withDeckMatchingPlan } from './deck-plan-minutes';
import { readPlanSteps } from './plan-steps';
import { deckDurationMinutes, readSlideDeck, type Slide, type SlideDeck } from './slide-deck';

const fixture = (name: string) => readFileSync(join(import.meta.dir, 'fixtures', name), 'utf8');

describe('withDeckMatchingPlan on real replies', () => {
  for (const name of ['reply-macbeth-1-3.md', 'reply-things-fall-apart-day-1.md', 'reply-gatsby-ch-1.md']) {
    test(`${name}: the deck’s minutes and agenda come to the plan’s`, () => {
      const reply = fixture(name);
      const before = readSlideDeck(reply);
      if (before.kind !== 'deck') throw new Error('fixture has no deck');
      const planTotal = readPlanSteps(before.body).reduce((sum, step) => sum + (step.minutes ?? 0), 0);
      const after = readSlideDeck(withDeckMatchingPlan(reply));
      if (after.kind !== 'deck') throw new Error('deck lost');
      const agenda = after.deck.slides.find((slide) => slide.layout === 'agenda');
      const slidesOnly = after.deck.slides.filter((slide) => slide.layout !== 'agenda');
      expect(slidesOnly.reduce((sum, slide) => sum + (slide.minutes ?? 0), 0)).toBe(planTotal);
      if (agenda) expect(agenda.agenda!.reduce((sum, item) => sum + (item.minutes ?? 0), 0)).toBe(planTotal);
      // Nothing else about the deck changes.
      expect(after.deck.slides.length).toBe(before.deck.slides.length);
      expect(after.deck.slides.map((slide) => slide.layout)).toEqual(before.deck.slides.map((slide) => slide.layout));
    });
  }
});

describe('deckMatchingPlan', () => {
  const deck = (slides: Partial<Slide>[]): SlideDeck => ({ title: 'x', slides: slides.map((slide) => ({ speakerNotes: 'n', title: 't', ...slide }) as Slide) });

  test('a short deck grows on its longest slide that is not a timed writing slide', () => {
    const out = deckMatchingPlan(
      deck([{ layout: 'write', minutes: 12 }, { layout: 'discuss', minutes: 8 }, { layout: 'read', minutes: 10 }]),
      [{ title: 'Starter', minutes: 20 }, { title: 'Read', minutes: 15 }, { title: 'Write', minutes: 15 }]
    );
    expect(out.slides.map((slide) => slide.minutes)).toEqual([12, 8, 30]);
    expect(deckDurationMinutes(out)).toBe(50);
  });

  test('a long deck shrinks, never below a minute a slide', () => {
    const out = deckMatchingPlan(deck([{ layout: 'discuss', minutes: 2 }, { layout: 'read', minutes: 2 }]), [{ title: 'A', minutes: 1 }, { title: 'B', minutes: 1 }]);
    expect(out.slides.map((slide) => slide.minutes)).toEqual([1, 1]);
  });

  test('the agenda lists the plan’s steps, by the first part of their titles', () => {
    const out = deckMatchingPlan(deck([{ layout: 'agenda', agenda: [{ title: 'Old', minutes: 9 }] }, { layout: 'discuss', minutes: 50 }]), [
      { title: 'Class starter', minutes: 5 },
      { title: 'Context: Igbo society and Achebe’s purpose', minutes: 15 },
      { title: 'Close read', minutes: 30 },
    ]);
    expect(out.slides[0]!.agenda).toEqual([
      { title: 'Class starter', minutes: 5 },
      { title: 'Context', minutes: 15 },
      { title: 'Close read', minutes: 30 },
    ]);
  });

  test('a plan without timed steps changes nothing', () => {
    const d = deck([{ layout: 'discuss', minutes: 7 }]);
    expect(deckMatchingPlan(d, [{ title: 'A', minutes: null }])).toBe(d);
  });
});
