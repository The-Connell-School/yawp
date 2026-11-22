/**
 * A picture on every teaching slide (Kevin, Nov 22: dual coding). A slide
 * says what picture it wants (`wants`), Yawp! finds it and sets `image`, and
 * the kit draws it beside the words: on a facts slide, a big idea, and the
 * event of a timeline that is in focus.
 */
import { describe, expect, test } from 'bun:test';
import { layoutKitV4Slide, type KitV4Element } from './deck-kit-v4';
import { withSlideFocus } from './context-slides';
import { withoutSlidePicture, withSlidePicture } from './deck-edit';
import {
  deckPictureIds,
  fenceSlideDeck,
  parseSlideDeck,
  type Slide,
  type SlideDeck,
} from './slide-deck';
import {
  pictureKey,
  wantedPictures,
  withFoundPictures,
  withoutEmptyPictureSlides,
} from './picture-wants';

const BOOM: Slide = {
  layout: 'notes',
  title: 'The postwar boom',
  facts: [
    'Between 1945 and 1960, the U.S. economy nearly doubled in size.',
    'Levittown, New York: 17,000 identical houses built in four years.',
    'By 1960, 90% of American homes had a television.',
  ],
  wants: {
    subject: 'Levittown, New York',
    shows: 'the rows of identical houses from the air',
  },
  speakerNotes: 'n',
} as Slide;
const BEATS: Slide = {
  layout: 'big_idea',
  title: 'The Beats',
  body: 'The Beat writers decided the dream was not theirs. They wrote about everything the suburbs left out.',
  wants: { subject: 'Allen Ginsberg' },
  speakerNotes: 'n',
} as Slide;
const FIFTIES: Slide = {
  layout: 'timeline',
  title: 'The 1950s in America',
  events: [
    {
      date: '1950',
      title: 'Korean War begins',
      wants: { subject: 'Korean War' },
    },
    {
      date: '1954',
      title: 'Brown v. Board',
      detail: 'The Supreme Court rules school segregation unconstitutional.',
    },
    {
      date: '1956',
      title: 'Howl published',
      wants: { subject: 'Howl (poem)', shows: 'the first edition' },
    },
    {
      date: '1957',
      title: 'Sputnik launched',
      wants: { subject: 'Sputnik 1' },
    },
  ],
  speakerNotes: 'n',
} as Slide;
const deckOf = (slides: Slide[]): SlideDeck => ({
  title: 'America, 1955',
  kit: 'v4.1',
  slides: [
    { layout: 'title', title: 'America, 1955', speakerNotes: 'n' } as Slide,
    ...slides,
  ],
});
const read = (slides: Slide[]) =>
  parseSlideDeck(fenceSlideDeck(deckOf(slides)))!.deck!;
const pictures = (elements: KitV4Element[]) =>
  elements
    .filter((element) => element.kind === 'picture')
    .map((element) => (element as { id: string }).id);
const texts = (elements: KitV4Element[]) =>
  elements.flatMap((element) =>
    element.kind === 'text'
      ? element.paras.flatMap((para) => para.runs.map((run) => run.text.trim()))
      : []
  );

describe('a slide says what picture it wants', () => {
  test('on the slide and on a timeline’s events, read from a reply', () => {
    const deck = read([BOOM, FIFTIES]);
    expect(deck.slides[1]!.wants).toEqual({
      subject: 'Levittown, New York',
      shows: 'the rows of identical houses from the air',
    });
    expect(deck.slides[2]!.events![2]!.wants).toEqual({
      subject: 'Howl (poem)',
      shows: 'the first edition',
    });
  });

  test('a bare subject is a want, and an address is never an image', () => {
    const deck = read([
      {
        ...BOOM,
        wants: 'Levittown, New York',
        image: 'https://example.com/levittown.jpg',
      } as unknown as Slide,
      {
        ...FIFTIES,
        events: [
          { date: '1950', title: 'War', image: 'http://x/y.png' },
          { date: '1957', title: 'Sputnik', wants: 'Sputnik 1' },
        ],
      } as unknown as Slide,
    ]);
    expect(deck.slides[1]!.wants).toEqual({ subject: 'Levittown, New York' });
    expect(deck.slides[1]!.image).toBeUndefined();
    expect(deck.slides[2]!.events![0]!.image).toBeUndefined();
    expect(deck.slides[2]!.events![1]!.wants).toEqual({ subject: 'Sputnik 1' });
  });

  test('every request still without a picture, once per subject', () => {
    const wanted = wantedPictures(
      deckOf([BOOM, BEATS, FIFTIES, { ...BEATS, title: 'Again' } as Slide])
    );
    // What the planner asked for first; then the event it said nothing about, found by its title and date.
    expect(wanted.map((want) => want.subject)).toEqual([
      'Levittown, New York',
      'Allen Ginsberg',
      'Korean War',
      'Howl (poem)',
      'Sputnik 1',
      'Brown v. Board',
    ]);
    expect(wanted.at(-1)).toEqual({
      subject: 'Brown v. Board',
      find: 'Brown v. Board 1954',
    });
    // A slide that has its picture asks for nothing.
    expect(
      wantedPictures(deckOf([{ ...BOOM, image: 'ckpicture0001' } as Slide]))
    ).toEqual([]);
  });

  test('found pictures go on the slides and events that asked, and nowhere else', () => {
    const deck = withFoundPictures(
      deckOf([BOOM, BEATS, FIFTIES]),
      new Map([
        [pictureKey('Allen Ginsberg'), 'ckginsberg001'],
        [pictureKey('howl (Poem)'), 'ckhowl0000001'],
      ])
    );
    expect(deck.slides[1]!.image).toBeUndefined();
    expect(deck.slides[2]!.image).toBe('ckginsberg001');
    expect(deck.slides[3]!.events!.map((event) => event.image)).toEqual([
      undefined,
      undefined,
      'ckhowl0000001',
      undefined,
    ]);
    expect(deckPictureIds(deck)).toEqual(['ckginsberg001', 'ckhowl0000001']);
  });
});

describe('the kit draws the picture beside the words', () => {
  const layoutOf = (slide: Slide, focus?: number) => {
    const deck = deckOf([slide]);
    return layoutKitV4Slide(
      focus === undefined ? deck : withSlideFocus(deck, 1, focus),
      1
    ).elements;
  };

  test('a facts slide: its picture, and every fact still there', () => {
    const elements = layoutOf({ ...BOOM, image: 'cklevittown01' } as Slide);
    expect(pictures(elements)).toEqual(['cklevittown01']);
    for (const fact of BOOM.facts!) expect(texts(elements)).toContain(fact);
    expect(texts(elements)).toContain('The postwar boom');
    // Without one, the slide is as it was.
    expect(pictures(layoutOf(BOOM))).toEqual([]);
  });

  test('a big idea: its picture beside the statement', () => {
    const elements = layoutOf({ ...BEATS, image: 'ckginsberg001' } as Slide);
    expect(pictures(elements)).toEqual(['ckginsberg001']);
    expect(texts(elements).join(' ')).toContain(
      'The Beat writers decided the dream was not theirs.'
    );
  });

  test('a timeline: the event in focus shows its picture, the overview none', () => {
    const slide = {
      ...FIFTIES,
      events: FIFTIES.events!.map((event, i) =>
        i === 2 ? { ...event, image: 'ckhowl0000001' } : event
      ),
    } as Slide;
    expect(pictures(layoutOf(slide))).toEqual([]);
    expect(pictures(layoutOf(slide, 2))).toEqual(['ckhowl0000001']);
    expect(pictures(layoutOf(slide, 1))).toEqual([]);
  });

  test('nothing is drawn off the slide', () => {
    for (const elements of [
      layoutOf({ ...BOOM, image: 'cklevittown01' } as Slide),
      layoutOf({ ...BEATS, image: 'ckginsberg001' } as Slide),
    ]) {
      for (const element of elements) {
        expect(element.x).toBeGreaterThanOrEqual(0);
        expect(element.y).toBeGreaterThanOrEqual(0);
        expect(element.x + element.w).toBeLessThanOrEqual(1280);
        expect(element.y + element.h).toBeLessThanOrEqual(720);
      }
    }
  });
});

describe('the studio: a teaching slide keeps its kind when its picture changes', () => {
  test('swapping or adding a picture on a facts slide or a big idea', () => {
    expect(withSlidePicture(BOOM, 'ckmine0000001')).toMatchObject({
      layout: 'notes',
      image: 'ckmine0000001',
      facts: BOOM.facts,
    });
    expect(withSlidePicture(BEATS, 'ckmine0000001')).toMatchObject({
      layout: 'big_idea',
      image: 'ckmine0000001',
    });
  });

  test('taking it off leaves the slide as it was', () => {
    const without = withoutSlidePicture({
      ...BOOM,
      image: 'ckmine0000001',
    } as Slide);
    expect(without.layout).toBe('notes');
    expect(without.image).toBeUndefined();
    expect(without.facts).toEqual(BOOM.facts);
  });
});

describe('people and picture slides ask the same way', () => {
  const CAST: Slide = {
    layout: 'person',
    title: 'The Beats',
    people: [
      {
        name: 'Allen Ginsberg',
        role: 'Poet',
        wants: { subject: 'Allen Ginsberg' },
      },
      { name: 'Jack Kerouac', role: 'Novelist', wants: 'Jack Kerouac' },
    ],
    speakerNotes: 'n',
  } as unknown as Slide;
  const LOOK: Slide = {
    layout: 'picture',
    title: 'A dust storm, 1935',
    question: 'What would you do if you saw this coming?',
    wants: { subject: 'Black Sunday (storm)' },
    speakerNotes: 'n',
  } as Slide;

  test('a person’s picture is wanted by their name, and a picture slide may want its picture instead of having it', () => {
    const deck = read([CAST, LOOK]);
    expect(deck.slides[2]!.layout).toBe('picture');
    expect(wantedPictures(deck).map((want) => want.subject)).toEqual([
      'Allen Ginsberg',
      'Jack Kerouac',
      'Black Sunday (storm)',
    ]);
    const filled = withFoundPictures(
      deck,
      new Map([
        [pictureKey('Allen Ginsberg'), 'ckginsberg001'],
        [pictureKey('Black Sunday (storm)'), 'ckstorm000001'],
      ])
    );
    expect(filled.slides[1]!.people!.map((person) => person.image)).toEqual([
      'ckginsberg001',
      undefined,
    ]);
    expect(filled.slides[2]!.image).toBe('ckstorm000001');
  });

  test('a picture slide whose picture was not found becomes its question, never an empty frame', () => {
    const settled = withoutEmptyPictureSlides(
      read([
        LOOK,
        {
          ...LOOK,
          question: undefined,
          title: 'Levittown from the air',
          wants: { subject: 'Levittown, New York' },
        } as Slide,
      ])
    );
    expect(settled.slides[1]).toMatchObject({
      layout: 'discuss',
      question: 'What would you do if you saw this coming?',
    });
    expect(settled.slides[2]).toMatchObject({
      layout: 'big_idea',
      body: 'Levittown from the air',
    });
    // One that has its picture is left alone.
    const kept = withoutEmptyPictureSlides(
      deckOf([{ ...LOOK, image: 'ckstorm000001' } as Slide])
    );
    expect(kept.slides[1]!.layout).toBe('picture');
  });
});

describe('what the planner forgot to ask for (live preview, Nov 22: two requests in a 13-slide deck)', () => {
  const BEAT_PEOPLE: Slide = {
    layout: 'person',
    title: 'The Beats',
    wants: { subject: 'Allen Ginsberg' },
    people: [
      { name: 'Jack Kerouac', role: 'Novelist, On the Road' },
      { name: 'Allen Ginsberg', role: 'Poet, author of Howl' },
      { name: 'Lawrence Ferlinghetti', role: 'Publisher' },
    ],
    speakerNotes: 'n',
  } as Slide;

  test('each person stands for their own name, and each event for its title and date', () => {
    const wanted = wantedPictures(
      deckOf([
        BEAT_PEOPLE,
        {
          ...FIFTIES,
          events: [{ date: '1953', title: 'The Rosenbergs executed' }],
        } as Slide,
      ])
    );
    expect(wanted).toEqual([
      { subject: 'Allen Ginsberg' },
      { subject: 'Jack Kerouac' },
      { subject: 'Lawrence Ferlinghetti' },
      {
        subject: 'The Rosenbergs executed',
        find: 'The Rosenbergs executed 1953',
      },
    ]);
  });

  test('a picture asked for on a person slide goes to the person it names, never to someone else', () => {
    const deck = withFoundPictures(
      deckOf([BEAT_PEOPLE]),
      new Map([['allen ginsberg', 'ckginsberg01']])
    );
    expect(deck.slides[1]!.people!.map((person) => person.image)).toEqual([
      undefined,
      'ckginsberg01',
      undefined,
    ]);
    expect(deck.slides[1]!.image).toBeUndefined();
    expect(pictures(layoutKitV4Slide(deck, 1).elements)).toEqual([
      'ckginsberg01',
    ]);
  });

  test('a picture already on a person slide, with no one pictured, goes to its first person', () => {
    const kept = {
      ...BEAT_PEOPLE,
      wants: undefined,
      image: 'ckkept000001',
    } as Slide;
    const deck = withFoundPictures(
      deckOf([kept]),
      new Map([['lawrence ferlinghetti', 'ckferling001']])
    );
    expect(deck.slides[1]!.people!.map((person) => person.image)).toEqual([
      'ckkept000001',
      undefined,
      'ckferling001',
    ]);
  });

  test('nothing the planner did not ask for is written into the deck', () => {
    const deck = withFoundPictures(
      deckOf([
        {
          ...FIFTIES,
          events: [
            { date: '1953', title: 'The Rosenbergs executed' },
            { date: '1955', title: 'Nothing found' },
          ],
        } as Slide,
      ]),
      new Map([['the rosenbergs executed', 'ckrosenberg1']])
    );
    expect(deck.slides[1]!.events![0]).toEqual({
      date: '1953',
      title: 'The Rosenbergs executed',
      image: 'ckrosenberg1',
    });
    expect(deck.slides[1]!.events![1]).toEqual({
      date: '1955',
      title: 'Nothing found',
    });
  });
});
