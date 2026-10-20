import { describe, expect, test } from 'bun:test';
import { clockText, countdown, slideForStep } from './run-show';

describe('Run the show: the clock', () => {
  test('time reads as minutes and seconds', () => {
    expect(clockText(0)).toBe('0:00');
    expect(clockText(245)).toBe('4:05');
    expect(clockText(3729)).toBe('1:02:09');
  });

  test('a countdown: left, a heads-up at two minutes, then calm overtime', () => {
    expect(countdown(60, 15)).toMatchObject({ left: 840, over: 0, headsUp: false });
    expect(countdown(14 * 60, 15)).toMatchObject({ left: 60, headsUp: true });
    expect(countdown(16 * 60, 15)).toMatchObject({ left: 0, over: 60, headsUp: false, progress: 1 });
  });
});

describe('Run the show: the slide for a step', () => {
  const steps = [{ title: 'Four minutes of writing' }, { title: 'Hook activity: What’s in your bag?' }, { title: 'Closing' }];
  test('a slide marked with the step wins', () => {
    const deck = { slides: [{ layout: 'title', title: 'Day One' }, { layout: 'prompt', title: 'x', step: 2 }, { layout: 'bullets', title: 'y' }] } as any;
    expect(slideForStep(deck, 1, steps)).toBe(1);
  });
  test('else a slide that shares the step’s words', () => {
    const deck = { slides: [{ layout: 'title', title: 'Day One' }, { layout: 'prompt', title: 'Start writing' }, { layout: 'statement', title: 'What’s in your bag?' }] } as any;
    expect(slideForStep(deck, 1, steps)).toBe(2);
  });
  test('else its place, after a title slide', () => {
    const deck = { slides: [{ layout: 'title', title: 'Day One' }, { layout: 'prompt', title: 'a' }, { layout: 'prompt', title: 'b' }] } as any;
    expect(slideForStep(deck, 0, steps)).toBe(1);
    expect(slideForStep(deck, 2, steps)).toBe(2);
    expect(slideForStep(null, 0, steps)).toBeNull();
  });
});
