/**
 * Timelines and maps (Nov 19): the schema takes them, older looks get a
 * list, and a stepped slide knows its steps.
 */
import { describe, expect, test } from 'bun:test';
import { legacyContextSlide, nextFocus, slideSteps, withSlideFocus } from './context-slides';
import { planGalleryDeck } from './deck-gallery';
import { classicSlide, fenceSlideDeck, parseSlideDeck, validateSlideDeck, type Slide, type SlideDeck } from './slide-deck';

const TIMELINE: Slide = {
  layout: 'timeline',
  title: 'Sudan before the novel',
  body: 'Sixty years, two flags.',
  tracks: ['In Sudan', 'The novel'],
  events: [
    { date: '1899', title: 'Britain and Egypt rule together', detail: 'The Condominium: two flags, one ruler in practice.', track: 1 },
    { date: '1956', title: 'Independence', track: 1 },
    { date: '1966', title: 'Salih publishes the novel', track: 2 },
  ],
  speakerNotes: 'Step through.',
} as Slide;

const MAP: Slide = {
  layout: 'map',
  title: 'The narrator’s journey',
  route: true,
  shade: ['Sudan', 'South Sudan'],
  shadeLabel: 'Sudan in 1956',
  places: [
    { name: 'Khartoum', where: 'Sudan', note: 'Where two Niles meet.', lat: 15.55, lon: 32.53, found: 'Khartoum, Sudan' },
    { name: 'Cairo', where: 'Egypt' },
    { name: 'London', where: 'United Kingdom', label: 'London', note: 'Seven years of study.' },
  ],
  view: { w: -10, s: 0, e: 45, n: 56 },
  speakerNotes: 'Follow the route.',
} as Slide;

const deck = (slides: Slide[]): SlideDeck => ({ title: 'Background', slides });

describe('the schema takes a timeline and a map', () => {
  test('both validate and survive being stored and read back', () => {
    const stored = parseSlideDeck(fenceSlideDeck(deck([TIMELINE, MAP])))!.deck;
    expect(stored.slides[0]).toMatchObject({ layout: 'timeline', tracks: ['In Sudan', 'The novel'] });
    expect(stored.slides[0]!.events).toHaveLength(3);
    expect(stored.slides[1]).toMatchObject({ layout: 'map', route: true, shade: ['Sudan', 'South Sudan'], view: { w: -10, s: 0, e: 45, n: 56 } });
    expect(stored.slides[1]!.places![0]).toMatchObject({ lat: 15.55, lon: 32.53, found: 'Khartoum, Sudan' });
  });

  test('a timeline needs two events, a map a place, and each event its date and title', () => {
    const fails = (slide: unknown) => expect(validateSlideDeck(JSON.stringify({ title: 'x', slides: [slide] })).ok).toBe(false);
    fails({ layout: 'timeline', title: 'T', speakerNotes: 'n' });
    fails({ layout: 'timeline', title: 'T', speakerNotes: 'n', events: [{ date: '1899', title: 'One only' }] });
    fails({ layout: 'timeline', title: 'T', speakerNotes: 'n', events: [{ date: '1899' }, { date: '1956', title: 'x' }] });
    fails({ layout: 'map', title: 'M', speakerNotes: 'n' });
    fails({ layout: 'map', title: 'M', speakerNotes: 'n', places: [{ name: 'Khartoum', lat: 200 }] });
  });

  test('the focus is never stored', () => {
    const focused = withSlideFocus(deck([TIMELINE]), 0, 1);
    expect(focused.slides[0]!.focus).toBe(1);
    expect(fenceSlideDeck(focused)).not.toContain('focus');
    expect(parseSlideDeck(fenceSlideDeck(focused))!.deck.slides[0]!.focus).toBeUndefined();
  });

  test('"timeline" as a model’s old word for a notes slide is still a notes slide', () => {
    const old = { title: 'Old', slides: [{ layout: 'timeline', title: 'Know', facts: ['Drafted at 21'], speakerNotes: 'n' }, { layout: 'Timeline', title: 'Dates', timeline: [{ year: '1899', caption: 'Rule together' }], speakerNotes: 'n' }] };
    const read = validateSlideDeck(JSON.stringify(old));
    expect(read.ok && read.deck.slides.map((slide) => slide.layout)).toEqual(['notes', 'notes']);
    // With events, it is the timeline.
    const now = validateSlideDeck(JSON.stringify({ title: 'New', slides: [TIMELINE] }));
    expect(now.ok && now.deck.slides[0]!.layout).toBe('timeline');
  });

  test('every deck written before these layouts still validates', () => {
    const old = { title: 'Old', slides: [{ layout: 'notes', title: 'Know', timeline: [{ year: '1899', caption: 'Rule together' }], speakerNotes: 'n' }] };
    expect(validateSlideDeck(JSON.stringify(old)).ok).toBe(true);
  });
});

describe('stepping through a slide', () => {
  test('a timeline steps through its events, a map its places, anything else has none', () => {
    expect(slideSteps(TIMELINE)).toBe(3);
    expect(slideSteps(MAP)).toBe(3);
    expect(slideSteps({ layout: 'notes' } as Slide)).toBe(0);
  });

  test('forward: the overview, each step, then on to the next slide', () => {
    expect(nextFocus(TIMELINE, undefined, 1)).toBe(0);
    expect(nextFocus(TIMELINE, 0, 1)).toBe(1);
    expect(nextFocus(TIMELINE, 2, 1)).toBe('leave');
    expect(nextFocus({ layout: 'notes' } as Slide, undefined, 1)).toBe('leave');
  });

  test('back: each step, the overview, then the slide before', () => {
    expect(nextFocus(TIMELINE, 2, -1)).toBe(1);
    expect(nextFocus(TIMELINE, 0, -1)).toBeUndefined();
    expect(nextFocus(TIMELINE, undefined, -1)).toBe('leave');
  });

  test('the focus stays inside the slide’s steps, and an ordinary slide has none', () => {
    expect(withSlideFocus(deck([TIMELINE]), 0, 9).slides[0]!.focus).toBe(2);
    const plain = deck([{ layout: 'title', title: 'T', speakerNotes: 'n' } as Slide]);
    expect(withSlideFocus(plain, 0, 1)).toBe(plain);
    const same = withSlideFocus(deck([TIMELINE]), 0, undefined);
    expect(same.slides[0]!.focus).toBeUndefined();
  });
});

describe('older looks draw a list', () => {
  test('spec v3: a timeline as dated lines, a map as its places', () => {
    expect(legacyContextSlide(TIMELINE)).toMatchObject({
      layout: 'notes',
      timeline: [
        { year: '1899', caption: 'Britain and Egypt rule together' },
        { year: '1956', caption: 'Independence' },
        { year: '1966', caption: 'Salih publishes the novel' },
      ],
    });
    expect(legacyContextSlide(TIMELINE).events).toBeUndefined();
    expect(legacyContextSlide(MAP)).toMatchObject({ layout: 'notes', facts: ['Khartoum: Where two Niles meet.', 'Cairo', 'London: Seven years of study.'] });
    const other = { layout: 'title', title: 'T', speakerNotes: 'n' } as Slide;
    expect(legacyContextSlide(other)).toBe(other);
  });

  test('the list form validates, so the older renderers can draw it', () => {
    for (const slide of [TIMELINE, MAP]) {
      expect(validateSlideDeck(JSON.stringify(deck([legacyContextSlide(slide)]))).ok).toBe(true);
    }
  });

  test('spec v3: a diagram as three lines at most, every part still there (Nov 22)', () => {
    const sonnet = {
      layout: 'diagram',
      title: 'How Sonnet 73 is built',
      diagram: {
        kind: 'parts',
        items: [
          { label: 'Quatrain 1', text: 'Autumn', weight: 4 },
          { label: 'Quatrain 2', text: 'Twilight', weight: 4 },
          { label: 'Quatrain 3', text: 'A dying fire', weight: 4 },
          { label: 'Couplet', text: 'So love well', weight: 2 },
        ],
      },
      speakerNotes: 'n',
    } as Slide;
    const legacy = legacyContextSlide(sonnet);
    expect(legacy).toMatchObject({ layout: 'notes', facts: ['Quatrain 1: Autumn; Quatrain 2: Twilight', 'Quatrain 3: A dying fire; Couplet: So love well'] });
    expect(legacy.diagram).toBeUndefined();
    expect(validateSlideDeck(JSON.stringify(deck([legacy]))).ok).toBe(true);
    // The spec v3 plan knows what to do with it.
    expect(planGalleryDeck(deck([sonnet])).map((plan) => plan.template)).toEqual(['notes']);
  });

  test('the classic looks: bullets', () => {
    expect(classicSlide(TIMELINE)).toMatchObject({ layout: 'bullets', bullets: ['1899: Britain and Egypt rule together', '1956: Independence', '1966: Salih publishes the novel'] });
    expect(classicSlide(MAP)).toMatchObject({ layout: 'bullets', bullets: ['Khartoum: Where two Niles meet.', 'Cairo', 'London: Seven years of study.'] });
  });
});
