/**
 * A timeline and a map as the kit draws them (Nov 19), in every renderer:
 * the layout's boxes, Present's canvas, the PDF, PowerPoint, and the list
 * the older looks fall back to.
 */
import { describe, expect, test } from 'bun:test';
import JSZip from 'jszip';
import { layoutKitV4Slide, planKitV4Deck, type KitV4Element, type KitV4Run } from './deck-kit-v4';
import { withSlideFocus } from './context-slides';
import { sourceText } from './deck-on-slide';
import { resolveDeckPlaces } from '~/domain/geo/places.server';
import { MAP_BOX } from '~/domain/geo/map-view';
import { renderSlidesPdf } from './lesson-pdf.server';
import { renderDeckPptxGallery } from './lesson-pptx-gallery.server';
import { planGalleryDeck } from './deck-gallery';
import type { Slide, SlideDeck } from './slide-deck';

const TIMELINE: Slide = {
  layout: 'timeline',
  title: 'Sudan before the novel',
  body: 'Sixty years, two flags.',
  events: [
    { date: '1899', title: 'Britain and Egypt rule together', detail: 'The Condominium: two flags, one ruler in practice.' },
    { date: '1924', title: 'Egyptian troops sent home' },
    { date: '1956', title: 'Independence', detail: 'Sudan becomes independent on January 1.' },
    { date: '1966', title: 'The novel is published' },
  ],
  speakerNotes: 'Step through.',
} as Slide;

const TWO_ROWS: Slide = {
  ...TIMELINE,
  tracks: ['In Sudan', 'The novel'],
  events: [
    { date: '1899', title: 'Rule together', track: 1 },
    { date: '1956', title: 'Independence', track: 1 },
    { date: '1929', title: 'Salih is born', track: 2 },
    { date: '1966', title: 'The novel', track: 2 },
  ],
} as Slide;

const MAP: Slide = {
  layout: 'map',
  title: 'The narrator’s journey',
  route: true,
  shade: ['Sudan', 'South Sudan'],
  shadeLabel: 'Sudan in 1956',
  places: [
    { name: 'Khartoum', where: 'Sudan', note: 'Where the two Niles meet.' },
    { name: 'Cairo', where: 'Egypt', note: 'The first stop north.' },
    { name: 'London', where: 'United Kingdom', note: 'Seven years of study.' },
    { name: 'Wad Hamid', where: 'Sudan', note: 'The village of the novel.' },
  ],
  speakerNotes: 'Follow the route.',
} as Slide;

const deck = resolveDeckPlaces<SlideDeck>({ title: 'Background', kit: 'v4.1', slides: [{ layout: 'title', title: 'Background', speakerNotes: 'n' } as Slide, TIMELINE, TWO_ROWS, MAP] });
const runsOf = (elements: KitV4Element[]) => elements.flatMap((element) => (element.kind === 'text' ? element.paras.flatMap((para) => para.runs) : []));
const texts = (elements: KitV4Element[]) => runsOf(elements).map((run) => run.text.trim());

describe('the timeline', () => {
  test('a line in the deck color, a mark and a date and title for every event, all inside the slide', () => {
    const { elements, template } = layoutKitV4Slide(deck, 1);
    expect(template).toBe('timeline');
    const marks = elements.filter((element) => element.kind === 'rect' && element.role === 'mark');
    // The line, then one mark an event.
    expect(marks).toHaveLength(5);
    expect(marks[0]).toMatchObject({ w: 1120, h: 6 });
    expect(texts(elements)).toEqual(expect.arrayContaining(['Sudan before the novel', 'Sixty years, two flags.', '1899', 'Britain and Egypt rule together', '1966', 'The novel is published']));
    for (const element of elements) {
      expect(element.x).toBeGreaterThanOrEqual(0);
      expect(element.x + element.w).toBeLessThanOrEqual(1280);
      expect(element.y).toBeGreaterThanOrEqual(0);
      expect(element.y + element.h).toBeLessThanOrEqual(720);
    }
    // Four events and none in focus: each one's sentence is beside it.
    expect(texts(elements)).toContain('Sudan becomes independent on January 1.');
  });

  test('events alternate above and below the line, so each has room', () => {
    const boxes = layoutKitV4Slide(deck, 1).elements.filter((element) => element.kind === 'text' && element.step !== undefined);
    expect(boxes.map((box) => (box.y < 456 ? 'above' : 'below'))).toEqual(['above', 'below', 'above', 'below']);
  });

  test('two rows: the rows are named, and each event sits in its own', () => {
    const { elements } = layoutKitV4Slide(deck, 2);
    expect(texts(elements)).toEqual(expect.arrayContaining(['In Sudan', 'The novel']));
    const boxes = elements.filter((element) => element.kind === 'text' && element.step !== undefined);
    expect(boxes.map((box) => (box.y < 456 ? 'above' : 'below'))).toEqual(['above', 'above', 'below', 'below']);
  });

  test('in focus: that event’s sentence under the headline, and the others out of the way', () => {
    const focused = layoutKitV4Slide(withSlideFocus(deck, 1, 2), 1).elements;
    expect(texts(focused)).toContain('Sudan becomes independent on January 1.');
    // The slide's own line gives way to it.
    expect(texts(focused)).not.toContain('Sixty years, two flags.');
    const colorOf = (text: string) => runsOf(focused).find((run) => run.text === text)!.color;
    expect(colorOf('Independence')).toBe('#1B1B1B');
    expect(colorOf('Britain and Egypt rule together')).not.toBe('#1B1B1B');
    // An event with no sentence shows its title there.
    expect(texts(layoutKitV4Slide(withSlideFocus(deck, 1, 1), 1).elements).filter((text) => text === 'Egyptian troops sent home')).toHaveLength(2);
  });

  test('every word typed on reads back to its field', () => {
    for (const index of [1, 2]) {
      for (const focus of [undefined, 0, 2]) {
        const of = withSlideFocus(deck, index, focus);
        const sourced = runsOf(layoutKitV4Slide(of, index).elements).filter((run): run is KitV4Run & { source: NonNullable<KitV4Run['source']> } => Boolean(run.source));
        expect(sourced.length).toBeGreaterThan(8);
        for (const run of sourced) expect(run.text).toBe(sourceText(of, index, run.source) ?? '');
      }
    }
  });
});

describe('the map', () => {
  const layout = layoutKitV4Slide(deck, 3);
  const map = layout.elements.find((element) => element.kind === 'map') as Extract<KitV4Element, { kind: 'map' }>;

  test('the map’s picture, edge to edge on the left, from the places’ own positions', () => {
    expect(layout.template).toBe('map');
    expect(map).toMatchObject({ x: 0, y: 0, w: MAP_BOX.w, h: MAP_BOX.h });
    expect(map.src).toContain('/api/lesson-planner-map.svg?');
    expect(map.spec.shade).toEqual(['Sudan', 'South Sudan']);
    // The route joins the places that were found, in order.
    expect(map.spec.route).toHaveLength(3);
    expect(map.alt).toContain('Khartoum');
  });

  test('a pin and a name for every place that was found, on the map; none for one that was not', () => {
    const pins = layout.elements.filter((element) => element.kind === 'rect' && element.role === 'mark');
    expect(pins.map((pin) => pin.kind === 'rect' && pin.step)).toEqual([0, 1, 2]);
    for (const pin of pins) {
      expect(pin.x).toBeGreaterThan(0);
      expect(pin.x + pin.w).toBeLessThan(MAP_BOX.w);
      expect(pin.y).toBeGreaterThan(0);
      expect(pin.y + pin.h).toBeLessThan(MAP_BOX.h);
    }
    // London is north and west of Khartoum.
    expect(pins[2]!.y).toBeLessThan(pins[0]!.y);
    expect(pins[2]!.x).toBeLessThan(pins[0]!.x);
    // Names sit on plates that do not run off the map or over each other.
    const plates = layout.elements.filter((element) => element.kind === 'rect' && element.role === 'plate');
    expect(plates).toHaveLength(3);
    for (const plate of plates) expect(plate.x + plate.w).toBeLessThanOrEqual(MAP_BOX.w);
    for (const a of plates) for (const b of plates) if (a !== b) expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h).toBe(false);
    expect(texts(layout.elements)).toContain('not on the map');
  });

  test('beside it: the headline, what is shaded, the places in order, and where the map is from', () => {
    const words = texts(layout.elements);
    expect(words).toEqual(expect.arrayContaining(['The narrator’s journey', 'Sudan in 1956', 'Khartoum', 'Cairo', 'London', 'Wad Hamid']));
    expect(words.join(' ')).toContain('Natural Earth');
    expect(words.join(' ')).toContain('GeoNames');
    expect(words.join(' ')).toContain('today’s');
  });

  test('in focus: that place’s pin is larger, its sentence is shown, and the picture under it does not change', () => {
    const focused = layoutKitV4Slide(withSlideFocus(deck, 3, 2), 3).elements;
    const pins = focused.filter((element) => element.kind === 'rect' && element.role === 'mark');
    expect(pins[2]!.w).toBeGreaterThan(pins[0]!.w);
    expect(texts(focused)).toContain('Seven years of study.');
    expect(texts(focused)).not.toContain('Where the two Niles meet.');
    expect((focused.find((element) => element.kind === 'map') as typeof map).src).toBe(map.src);
  });

  test('a map with nothing found is its list of places, with no picture', () => {
    const lost = resolveDeckPlaces<SlideDeck>({ title: 'D', kit: 'v4.1', slides: [{ ...MAP, shade: undefined, places: [{ name: 'Maycomb' }, { name: 'Wad Hamid' }] } as Slide] });
    const { elements } = layoutKitV4Slide(lost, 0);
    expect(elements.some((element) => element.kind === 'map')).toBe(false);
    expect(texts(elements)).toEqual(expect.arrayContaining(['Maycomb', 'Wad Hamid']));
  });
});

describe('every renderer draws them', () => {
  test('the PDF: the deck prints, and the map’s countries are drawn into it', async () => {
    const bytes = await renderSlidesPdf({ lessonTitle: 'Background', deck });
    expect(Buffer.from(bytes.slice(0, 4)).toString('latin1')).toBe('%PDF');
    // The same deck with the map's places not found has no map to draw.
    const noMap = resolveDeckPlaces<SlideDeck>({ ...deck, slides: deck.slides.map((slide) => (slide.layout === 'map' ? ({ ...slide, shade: undefined, places: [{ name: 'Maycomb' }] } as Slide) : slide)) });
    const without = await renderSlidesPdf({ lessonTitle: 'Background', deck: noMap });
    expect(bytes.length).toBeGreaterThan(without.length + 10_000);
  });

  test('PowerPoint: the timeline’s words are real text, and the map is a picture in the file', async () => {
    const zip = await JSZip.loadAsync(await renderDeckPptxGallery(deck));
    const names = Object.keys(zip.files);
    expect(names.filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))).toHaveLength(4);
    const timeline = await zip.file('ppt/slides/slide2.xml')!.async('string');
    expect(timeline).toContain('1899');
    expect(timeline).toContain('Britain and Egypt rule together');
    const map = await zip.file('ppt/slides/slide4.xml')!.async('string');
    expect(map).toContain('Khartoum');
    expect(names.some((name) => /^ppt\/media\/.+\.svg$/.test(name))).toBe(true);
  });

  test('the spec v3 look: a list, with the plan’s templates it already knows', () => {
    const { kit: _kit, ...v3 } = deck;
    const plans = planGalleryDeck(v3);
    expect(plans.map((plan) => plan.template)).toEqual(['title', 'notes', 'notes', 'notes']);
    expect(plans[1]!.slide.timeline).toHaveLength(4);
    expect(plans[3]!.slide.facts![0]).toBe('Khartoum: Where the two Niles meet.');
    // The kit's own plan names them as they are.
    expect(planKitV4Deck(deck).map((plan) => plan.template)).toEqual(['title', 'timeline', 'timeline', 'map']);
  });
});

describe('a full timeline never breaks a word (demo pass, Nov 20)', () => {
  test('the longest word of every event fits its box at its size', () => {
    const night = {
      layout: 'timeline',
      title: 'Sixteen years, one boy',
      tracks: ['The war in Europe', 'Elie Wiesel'],
      events: [
        { date: '1928', track: 2, title: 'Born in Sighet' },
        { date: '1933', track: 1, title: 'Hitler comes to power' },
        { date: '1940', track: 1, title: 'Sighet becomes Hungarian' },
        { date: 'March 1944', track: 1, title: 'Germany occupies Hungary' },
        { date: 'May 1944', track: 2, title: 'Deported to Auschwitz' },
        { date: 'April 1945', track: 2, title: 'Liberated at Buchenwald' },
        { date: '1960', track: 2, title: 'Night appears in English' },
      ],
      speakerNotes: 'n',
    } as Slide;
    const of = { title: 'Night', kit: 'v4.1', slides: [{ layout: 'title', title: 'Night', speakerNotes: 'n' } as Slide, night] } as SlideDeck;
    const boxes = layoutKitV4Slide(of, 1).elements.filter((element) => element.kind === 'text' && element.step !== undefined);
    expect(boxes.length).toBe(7);
    for (const box of boxes) {
      if (box.kind !== 'text') continue;
      for (const run of box.paras.flatMap((para) => para.runs)) {
        const longest = Math.max(...run.text.split(/\s+/).map((word) => word.length));
        // A bold sans letter is about 0.62 of its size across.
        expect(longest * run.size * 0.62).toBeLessThanOrEqual(box.w);
      }
    }
  });
});

describe('a name never sits on another place’s pin (demo pass, Nov 21)', () => {
  test('four towns close together: every name clear of every other pin and name', () => {
    const veneto = resolveDeckPlaces<SlideDeck>({
      title: 'Shakespeare’s Italy',
      kit: 'v4.1',
      slides: [
        { layout: 'title', title: 'Italy', speakerNotes: 'n' } as Slide,
        { layout: 'map', title: 'Shakespeare’s Italy', places: [
          { name: 'Verona', where: 'Italy' }, { name: 'Venice', where: 'Italy' }, { name: 'Padova', where: 'Italy', label: 'Padua' }, { name: 'Mantova', where: 'Italy', label: 'Mantua' },
          { name: 'Rome', where: 'Italy' }, { name: 'Messina', where: 'Italy' } ], speakerNotes: 'n' } as Slide,
      ],
    });
    const elements = layoutKitV4Slide(veneto, 1).elements;
    const pins = elements.filter((element) => element.kind === 'rect' && element.role === 'mark');
    const plates = elements.filter((element) => element.kind === 'rect' && element.role === 'plate');
    expect(plates.length).toBe(6);
    const hits = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    for (const plate of plates) {
      const own = (plate as { step?: number }).step;
      for (const pin of pins) if ((pin as { step?: number }).step !== own) expect(hits(plate, pin)).toBe(false);
      for (const other of plates) if (other !== plate) expect(hits(plate, other)).toBe(false);
    }
  });
});
