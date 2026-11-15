import { describe, expect, it } from 'bun:test';
import { DECKS } from './decks';
import { LESSON_PLANS, type PlanStep } from './lesson-plans';
import { SAMPLE_BODY, SAMPLE_CONCLUSION, SAMPLE_INTRODUCTION, SAMPLE_TITLE } from './sample-essay';
import {
  allSpans,
  isWinAnsi,
  renderLessonPlan,
  renderSampleEssayHandout,
  renderSignUpHandout,
  resolveSpan,
  slideLabel,
} from './render-lesson-plan';

function* stepsOf(steps: readonly PlanStep[]): Generator<PlanStep> {
  for (const step of steps) {
    yield step;
    if (step.steps) yield* stepsOf(step.steps);
  }
}

/** Every string a plan prints, for the character check. */
function textsOf(plan: (typeof LESSON_PLANS)[number]): string[] {
  const texts = [
    plan.title,
    plan.overview,
    plan.source,
    ...plan.studentGoals,
    ...(plan.teacherGoals ?? []),
    ...plan.materials,
  ];
  for (const section of plan.sections) {
    texts.push(section.heading, section.intro ?? '');
    for (const step of stepsOf(section.steps)) texts.push(step.text);
  }
  return texts;
}

describe('lesson plans', () => {
  it('has one plan per deck, in deck order', () => {
    expect(LESSON_PLANS.map((plan) => plan.deck)).toEqual(DECKS.map(({ file }) => file));
  });

  for (const plan of LESSON_PLANS) {
    const deck = DECKS.find(({ file }) => file === plan.deck)!.deck;

    describe(plan.deck, () => {
      // The point of the plans: they point at the deck's real slides. A slide
      // that moves renumbers here; one that is renamed or removed fails.
      it('points only at slides that are in its deck', () => {
        for (const span of allSpans(plan)) {
          expect(() => resolveSpan(deck, span)).not.toThrow();
        }
      });

      it('points at the deck from most of its steps', () => {
        const steps = plan.sections.flatMap((section) => [...stepsOf(section.steps)]);
        const pointing = steps.filter((step) => step.see?.length);
        expect(pointing.length).toBeGreaterThanOrEqual(4);
      });

      it('uses only characters the PDF fonts can draw', () => {
        for (const text of textsOf(plan)) {
          const bad = [...text].filter((char) => !isWinAnsi(char));
          expect({ text, bad }).toEqual({ text, bad: [] });
        }
      });

      it('writes a PDF, the same bytes every time', async () => {
        const first = await renderLessonPlan(plan, deck);
        const second = await renderLessonPlan(plan, deck);
        expect(Buffer.from(first.subarray(0, 5)).toString()).toBe('%PDF-');
        expect(Buffer.compare(Buffer.from(first), Buffer.from(second))).toBe(0);
      });
    });
  }

  it('labels single slides, ranges and lists', () => {
    const deck = DECKS.find(({ file }) => file === 'lesson-2-pre-writing')!.deck;
    expect(slideLabel(deck, ['Look at this picture.'])).toBe('Slide 3');
    expect(slideLabel(deck, [['Look at this picture.', 'Fallen Man, Paris, France, 1967']])).toBe(
      'Slides 3–5'
    );
    expect(slideLabel(deck, ['Your essay prompt', 'Your essay prompt#2'])).toBe('Slides 6, 7');
  });

  it('refuses a slide title that is not in the deck', () => {
    const deck = DECKS[0].deck;
    expect(() => resolveSpan(deck, 'No such slide')).toThrow(/No such slide/);
  });

  it('keeps the Body Paragraphs house analogy ahead of the writing slide', () => {
    const deck = DECKS.find(({ file }) => file === 'lesson-5-body-paragraphs')!.deck;
    const [house] = resolveSpan(deck, 'Your essay is a house, and you’re showing it');
    const [writing] = resolveSpan(deck, 'What it looks like');
    expect(house).toBeLessThan(writing);
  });
});

describe('student sign-up handout', () => {
  it('writes a PDF', async () => {
    const bytes = await renderSignUpHandout();
    expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe('%PDF-');
  });
});

describe('sample essay handout', () => {
  it('writes a PDF, the same bytes every time', async () => {
    const first = await renderSampleEssayHandout();
    const second = await renderSampleEssayHandout();
    expect(Buffer.from(first.subarray(0, 5)).toString()).toBe('%PDF-');
    expect(Buffer.compare(Buffer.from(first), Buffer.from(second))).toBe(0);
  });

  it('uses only characters the PDF fonts can draw', () => {
    const texts = [SAMPLE_TITLE, SAMPLE_INTRODUCTION, ...SAMPLE_BODY, SAMPLE_CONCLUSION];
    for (const text of texts) expect([...text].filter((char) => !isWinAnsi(char))).toEqual([]);
  });
});
