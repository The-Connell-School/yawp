/**
 * The picture editor (Nov 22, night): a small model names the subject for
 * each teaching slide the planner left without one. On the live preview the
 * planner asked on two of fourteen slides; five big-idea statements stayed
 * bare.
 */
import { describe, expect, test } from 'bun:test';
import {
  pictureEditorPrompt,
  readPictureEditorAnswer,
  slidesWithoutSubjects,
  withNamedSubjects,
} from './picture-subjects.server';
import type { Slide, SlideDeck } from './slide-deck';

const DECK: SlideDeck = {
  title: 'America, 1950',
  unit: 'Howl',
  slides: [
    { layout: 'title', title: 'America, 1950', speakerNotes: 'n' },
    {
      layout: 'agenda',
      title: 'Today',
      agenda: [{ title: 'Starter', minutes: 5 }],
      speakerNotes: 'n',
    },
    {
      layout: 'big_idea',
      title: 'After the war',
      body: 'Every other major power had bombed factories. America’s were untouched.',
      speakerNotes: 'n',
    },
    {
      layout: 'big_idea',
      title: 'Fitting in',
      body: 'Same house, same car, same lawn: the Organization Man.',
      speakerNotes: 'n',
    },
    {
      layout: 'notes',
      title: 'Who the dream left out',
      facts: ['Black veterans were denied GI Bill loans.'],
      wants: { subject: 'Allen Ginsberg' },
      speakerNotes: 'n',
    },
    {
      layout: 'write',
      title: 'Write',
      body: 'What do you think this poem is about?',
      speakerNotes: 'n',
    },
    {
      layout: 'discuss',
      title: 'Talk',
      question: 'What were you right about?',
      speakerNotes: 'n',
    },
    {
      layout: 'exit',
      title: 'Before you go',
      body: 'Ginsberg was angry about ___.',
      speakerNotes: 'n',
    },
  ] as Slide[],
};

describe('which slides the editor is asked about', () => {
  test('teaching slides with no picture and no request, by their number in the deck', () => {
    expect(slidesWithoutSubjects(DECK).map(({ number }) => number)).toEqual([
      3, 4, 7,
    ]);
  });

  test('the prompt names the deck and each slide with its words, and nothing routine', () => {
    const prompt = pictureEditorPrompt(DECK, slidesWithoutSubjects(DECK));
    expect(prompt).toContain('Deck: America, 1950 (Howl)');
    expect(prompt).toContain('Slide 3 (big_idea): After the war');
    expect(prompt).toContain('Every other major power had bombed factories.');
    expect(prompt).not.toContain('Slide 5');
    expect(prompt).not.toContain('Slide 6');
    expect(prompt).not.toContain('Ginsberg was angry');
  });

  test('a slide’s words are cut short, not sent whole', () => {
    const long = {
      ...DECK,
      slides: [
        {
          layout: 'big_idea',
          title: 'Long',
          body: 'word '.repeat(300),
          speakerNotes: 'n',
        },
      ] as Slide[],
    };
    expect(
      pictureEditorPrompt(long, slidesWithoutSubjects(long)).length
    ).toBeLessThan(520);
  });
});

describe('reading the answer', () => {
  test('the JSON in the answer, nulls and junk left out', () => {
    expect(
      readPictureEditorAnswer(
        'Here you go:\n{"slides": [{"slide": 3, "subject": "Marshall Plan", "shows": "aid arriving in Europe"}, {"slide": 4, "subject": "Levittown, New York"}, {"slide": 7, "subject": null}, {"slide": 9, "subject": "null"}]}'
      )
    ).toEqual([
      { slide: 3, subject: 'Marshall Plan', shows: 'aid arriving in Europe' },
      { slide: 4, subject: 'Levittown, New York' },
    ]);
    expect(readPictureEditorAnswer('I could not decide.')).toEqual([]);
    expect(readPictureEditorAnswer('{"slides": "none"}')).toEqual([]);
    expect(readPictureEditorAnswer('{"slides": [ broken')).toEqual([]);
  });
});

describe('withNamedSubjects', () => {
  test('what the editor names becomes the slide’s request; nothing else changes', async () => {
    let seen = '';
    const { deck, named } = await withNamedSubjects(
      DECK,
      async (_system, prompt) => {
        seen = prompt;
        return '{"slides": [{"slide": 3, "subject": "Marshall Plan"}, {"slide": 4, "subject": "Levittown, New York", "shows": "identical houses from the air"}, {"slide": 7, "subject": null}]}';
      }
    );
    expect(seen).toContain('Slide 4');
    expect(named).toBe(2);
    expect(deck.slides[2]!.wants).toEqual({ subject: 'Marshall Plan' });
    expect(deck.slides[3]!.wants).toEqual({
      subject: 'Levittown, New York',
      shows: 'identical houses from the air',
    });
    expect(deck.slides[6]!.wants).toBeUndefined();
    // The planner's own request is never replaced.
    expect(deck.slides[4]!.wants).toEqual({ subject: 'Allen Ginsberg' });
  });

  test('a slide number it was not asked about is ignored, even one that asks already', async () => {
    const { deck, named } = await withNamedSubjects(
      DECK,
      async () =>
        '{"slides": [{"slide": 5, "subject": "Jack Kerouac"}, {"slide": 1, "subject": "United States"}, {"slide": 40, "subject": "X"}]}'
    );
    expect(named).toBe(0);
    expect(deck).toBe(DECK);
  });

  test('a failure or a silence leaves the deck as the planner wrote it', async () => {
    expect(
      (
        await withNamedSubjects(DECK, async () =>
          Promise.reject(new Error('timeout'))
        )
      ).deck
    ).toBe(DECK);
    expect((await withNamedSubjects(DECK, async () => '')).deck).toBe(DECK);
  });

  test('a deck with nothing to name asks nothing', async () => {
    let asked = false;
    const plain = {
      title: 'x',
      slides: [{ layout: 'title', title: 'x', speakerNotes: 'n' }] as Slide[],
    };
    await withNamedSubjects(plain, async () => {
      asked = true;
      return '';
    });
    expect(asked).toBe(false);
  });
});
