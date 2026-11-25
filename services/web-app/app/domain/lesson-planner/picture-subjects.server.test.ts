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
  withTitlePicture,
  readPictureEditorAuthor,
  readPictureEditorWorld,
  eventsWithoutSubjects,
  readPictureEditorEvents,
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
    // Slide 7 is a Talk slide: routine, words only (visuals review, Nov 22).
    expect(slidesWithoutSubjects(DECK).map(({ number }) => number)).toEqual([3, 4]);
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

describe('the vetted kit and the title slide (visuals review, Nov 22)', () => {
  const KIT = {
    title: 'Dulce et Decorum Est',
    author: 'Wilfred Owen',
    visuals: [
      { subject: 'Wilfred Owen', shows: 'Owen in uniform, about 1916', use: 'author' },
      { subject: 'Lord Kitchener Wants You', shows: 'the 1914 recruiting poster', use: 'period' },
    ],
  };
  const deck = (slides: unknown[]) => ({ title: 'Dulce', slides }) as never;

  test('the editor is offered the kit, by exact title', () => {
    const prompt = pictureEditorPrompt(DECK, slidesWithoutSubjects(DECK), KIT);
    expect(prompt).toContain('Vetted pictures for Dulce et Decorum Est');
    expect(prompt).toContain('- Lord Kitchener Wants You — the 1914 recruiting poster (period)');
  });

  test('the title slide asks for the work’s world, to be drawn as a print, not the author’s face (Kevin, Nov 25)', () => {
    const out = withTitlePicture(deck([{ layout: 'title', title: 'Dulce', speakerNotes: 'n' }, { layout: 'big_idea', title: 'The old Lie', body: 'x', speakerNotes: 'n' }]), { kit: KIT }) as { slides: Array<{ wants?: { subject: string; print?: boolean } }> };
    expect(out.slides[0]!.wants?.subject).toBe('Lord Kitchener Wants You');
    expect(out.slides[0]!.wants?.print).toBe(true);
  });

  test('with no world anywhere, the author, as their own article, and not printed', () => {
    const noWorld = { ...KIT, visuals: KIT.visuals.filter((visual) => !['setting', 'period'].includes(visual.use)) };
    const out = withTitlePicture(deck([{ layout: 'title', title: 'Dulce', speakerNotes: 'n' }]), { kit: noWorld }) as { slides: Array<{ wants?: unknown }> };
    expect(out.slides[0]!.wants).toEqual({ subject: 'Wilfred Owen', shows: 'Owen in uniform, about 1916', own: true });
  });

  test('no kit: the world the editor named, then the author', () => {
    const slides = [{ layout: 'title', title: 'Chronicle of a Death Foretold', speakerNotes: 'n' }];
    const out = withTitlePicture(deck(slides), { author: 'Gabriel García Márquez', world: 'Aracataca' }) as { slides: Array<{ wants?: { subject: string; print?: boolean } }> };
    expect(out.slides[0]!.wants).toMatchObject({ subject: 'Aracataca', print: true });
    expect(readPictureEditorWorld('{"author": "Gabriel García Márquez", "world": "Aracataca", "slides": []}')).toBe('Aracataca');
    expect(readPictureEditorWorld('{"author": null, "world": null, "slides": []}')).toBeNull();
  });

  test('a slide already shows the author where the lesson talks about him: the title takes a picture of the work’s world', () => {
    const out = withTitlePicture(
      deck([{ layout: 'title', title: 'Dulce', speakerNotes: 'n' }, { layout: 'notes', title: 'Owen', facts: ['Born 1893'], speakerNotes: 'n', wants: { subject: 'Wilfred Owen' } }]),
      { kit: KIT }
    ) as { slides: Array<{ wants?: { subject: string } }> };
    expect(out.slides[0]!.wants?.subject).toBe('Lord Kitchener Wants You');
  });

  test('no kit: the author the editor named; no author, no picture', () => {
    const slides = [{ layout: 'title', title: 'A Letter', speakerNotes: 'n' }];
    expect((withTitlePicture(deck(slides), { author: 'Martin Luther King Jr.' }) as { slides: Array<{ wants?: { subject: string } }> }).slides[0]!.wants?.subject).toBe('Martin Luther King Jr.');
    expect((withTitlePicture(deck(slides), {}) as { slides: Array<{ wants?: unknown }> }).slides[0]!.wants).toBeUndefined();
  });

  test('the editor’s answer names the author', () => {
    expect(readPictureEditorAuthor('{"author": "Martin Luther King Jr.", "slides": []}')).toBe('Martin Luther King Jr.');
    expect(readPictureEditorAuthor('{"author": null, "slides": []}')).toBeNull();
  });
});

describe('timeline events name the historical event (Kevin, Nov 23)', () => {
  const TIMELINE: SlideDeck = {
    title: 'Letter from Birmingham Jail',
    slides: [
      { layout: 'title', title: 'Letter from Birmingham Jail', speakerNotes: 'n' },
      {
        layout: 'timeline',
        title: 'Birmingham, spring 1963',
        events: [
          { date: 'April 3, 1963', title: 'Marches begin', detail: 'Sit-ins and marches start downtown.' },
          { date: 'April 12, 1963', title: 'King arrested' },
          { date: 'April 16, 1963', title: 'King writes back', wants: { subject: 'Letter from Birmingham Jail' } },
          { date: 'May 1963', title: 'Children march' },
        ],
        speakerNotes: 'n',
      },
    ],
  };

  test('the events with no picture and no request are offered, by slide and place', () => {
    expect(eventsWithoutSubjects(TIMELINE).map(({ id }) => id)).toEqual(['2.1', '2.2', '2.4']);
    const prompt = pictureEditorPrompt(TIMELINE, [], null, eventsWithoutSubjects(TIMELINE));
    expect(prompt).toContain('Event 2.1: April 3, 1963 — Marches begin. Sit-ins and marches start downtown.');
    expect(prompt).not.toContain('King writes back');
  });

  test('the answer for events is read by id; nulls and junk left out', () => {
    const text = JSON.stringify({
      author: null,
      slides: [],
      events: [
        { event: '2.1', subject: 'Birmingham campaign', shows: 'marchers downtown' },
        { event: 'Event 2.2', subject: null, shows: '' },
        { event: 'two', subject: 'Something', shows: '' },
      ],
    });
    expect(readPictureEditorEvents(text)).toEqual([{ event: '2.1', subject: 'Birmingham campaign', shows: 'marchers downtown' }]);
  });

  test('each event gets its own article; one already asked for, or named twice, is not used again', async () => {
    const answer = JSON.stringify({
      author: 'Martin Luther King Jr.',
      slides: [],
      events: [
        { event: '2.1', subject: 'Birmingham campaign', shows: 'marchers' },
        { event: '2.2', subject: 'Letter from Birmingham Jail', shows: 'the letter' },
        { event: '2.4', subject: 'Birmingham campaign', shows: 'children' },
      ],
    });
    const { deck, named } = await withNamedSubjects(TIMELINE, async () => answer);
    const events = deck.slides[1]!.events!;
    expect(named).toBe(1);
    expect(events[0]!.wants).toEqual({ subject: 'Birmingham campaign', shows: 'marchers' });
    expect(events[1]!.wants).toBeUndefined();
    expect(events[2]!.wants).toEqual({ subject: 'Letter from Birmingham Jail' });
    expect(events[3]!.wants).toBeUndefined();
  });

  test('a deck whose only pictures are on a timeline still asks the editor', async () => {
    let asked = '';
    await withNamedSubjects(TIMELINE, async (_system, prompt) => {
      asked = prompt;
      return '{}';
    });
    expect(asked).toContain('Event 2.4: May 1963 — Children march');
  });
});

describe('a world slide’s pictures are named like timeline events (Kevin, Nov 23)', () => {
  const WORLD: SlideDeck = {
    title: 'Antigone',
    slides: [
      { layout: 'title', title: 'Antigone', speakerNotes: 'n' },
      {
        layout: 'world',
        title: 'Athens, 441 BCE',
        scenes: [{ label: 'The Acropolis today' }, { label: 'Where the play was seen', note: 'The stone seats.' }, { label: 'Pericles', wants: { subject: 'Pericles' } }],
        speakerNotes: 'n',
      } as Slide,
    ],
  };

  test('the pictures with no request are offered, and what the editor names is each one’s request', async () => {
    expect(eventsWithoutSubjects(WORLD).map(({ id }) => id)).toEqual(['2.1', '2.2']);
    let asked = '';
    const { deck } = await withNamedSubjects(WORLD, async (_system, prompt) => {
      asked = prompt;
      return JSON.stringify({
        author: null,
        slides: [],
        events: [
          { event: '2.1', subject: 'Acropolis of Athens', shows: 'the hill and its temples' },
          { event: '2.2', subject: 'Theatre of Dionysus', shows: 'the stone seats' },
          { event: '2.3', subject: 'Parthenon', shows: 'x' },
        ],
      });
    });
    expect(asked).toContain('Picture 2.2: Where the play was seen. The stone seats.');
    expect(deck.slides[1]!.scenes!.map((scene) => scene.wants?.subject)).toEqual(['Acropolis of Athens', 'Theatre of Dionysus', 'Pericles']);
  });
});
