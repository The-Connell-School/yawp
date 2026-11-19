import { describe, expect, test } from 'bun:test';
import { withResolvedPlaces } from './context-slides.server';
import { buildContextToolsSection, buildLessonPlannerSystemPromptBlocks } from '~/routes/api.domain.lesson-planner/build-system-prompt';
import { applySlideText, insertSlideListItem, removeSlideListItem, sourceLabel, sourceLimit } from './deck-on-slide';
import { fenceSlideDeck, parseSlideDeck, type Slide, type SlideDeck } from './slide-deck';

const MAP: Slide = {
  layout: 'map',
  title: 'Journey',
  // What a model might write for itself: a pin in the ocean.
  places: [{ name: 'Khartoum', where: 'Sudan', lat: 1, lon: -30, found: 'guessed' }, { name: 'London', where: 'United Kingdom' }],
  speakerNotes: 'n',
} as Slide;
const TIMELINE: Slide = {
  layout: 'timeline',
  title: 'Before the novel',
  events: [{ date: '1899', title: 'Rule together' }, { date: '1956', title: 'Independence', detail: 'January 1.' }],
  speakerNotes: 'n',
} as Slide;
const deck = (slides: Slide[]): SlideDeck => ({ title: 'Background', slides });

describe('withResolvedPlaces: the planner’s reply', () => {
  test('a map’s places are where Yawp! found them, whatever the reply said, and the prose stays', () => {
    const reply = `Here is the deck.\n\n${fenceSlideDeck(deck([MAP]))}\n\nWant to change anything?`;
    const resolved = withResolvedPlaces(reply);
    expect(resolved).toContain('Here is the deck.');
    expect(resolved).toContain('Want to change anything?');
    const [khartoum, london] = parseSlideDeck(resolved)!.deck.slides[0]!.places!;
    expect(khartoum).toMatchObject({ found: 'Khartoum, Sudan' });
    expect(Math.abs(khartoum!.lat! - 15.55)).toBeLessThan(0.3);
    expect(Math.abs(london!.lat! - 51.51)).toBeLessThan(0.3);
    expect(parseSlideDeck(resolved)!.deck.slides[0]!.view).toBeDefined();
  });

  test('no deck, a deck with no map, or a deck that did not validate: the reply as it was', () => {
    expect(withResolvedPlaces('Just words.')).toBe('Just words.');
    const noMap = `Deck.\n\n${fenceSlideDeck(deck([TIMELINE]))}`;
    expect(withResolvedPlaces(noMap)).toBe(noMap);
    const broken = 'Deck.\n\n```yawp-slides\n{"title":"x","slides":[{"layout":"map","title":"M"}]}\n```';
    expect(withResolvedPlaces(broken)).toBe(broken);
  });
});

describe('what the planner is told', () => {
  const text = (flags: Record<string, boolean>) =>
    buildLessonPlannerSystemPromptBlocks({ teacherName: null, organizationName: 'School', ...flags })
      .map((block) => block.text)
      .join('\n');

  test('the two templates, only with the flag and the kit’s v4 look', () => {
    const on = text({ deckGallery: true, deckKitV4: true, deckKitV41: true, contextTools: true });
    expect(on).toContain('timeline — events on a line');
    expect(on).toContain('map — places on a real map');
    expect(text({ deckGallery: true, deckKitV4: true, deckKitV41: true })).not.toContain('timeline — events on a line');
    expect(text({ deckGallery: true, contextTools: true })).not.toContain('timeline — events on a line');
  });

  test('never a position, and only what it is sure of', () => {
    const section = buildContextToolsSection().join('\n');
    expect(section).toContain('Never write a position');
    expect(section).toContain('Only dates and places you are sure of');
    expect(section).toContain('today’s borders');
  });
});

describe('typed on in the studio', () => {
  const of = deck([TIMELINE, MAP]);

  test('an event’s date, title and sentence; a place’s name and sentence', () => {
    expect(applySlideText(of, 0, { on: 'slide', field: 'events', index: 1, key: 'date' }, '1 Jan 1956').slides[0]!.events![1]!.date).toBe('1 Jan 1956');
    expect(applySlideText(of, 0, { on: 'slide', field: 'events', index: 1, key: 'detail' }, 'Sudan is independent.').slides[0]!.events![1]!.detail).toBe('Sudan is independent.');
    expect(applySlideText(of, 1, { on: 'slide', field: 'places', index: 0, key: 'name' }, 'Omdurman').slides[1]!.places![0]!.name).toBe('Omdurman');
    // An event needs its title: emptied, it keeps its words.
    expect(applySlideText(of, 0, { on: 'slide', field: 'events', index: 0, key: 'title' }, '')).toBe(of);
    expect(sourceLimit({ on: 'slide', field: 'events', index: 0, key: 'title' })).toBe(60);
    expect(sourceLimit({ on: 'slide', field: 'places', index: 0, key: 'note' })).toBe(200);
    expect(sourceLabel({ on: 'slide', field: 'events', index: 1, key: 'date' })).toBe('Event 2 date');
    expect(sourceLabel({ on: 'slide', field: 'places', index: 0, key: 'name' })).toBe('Place 1');
  });

  test('Enter adds an event or a place; Backspace removes one, down to what the slide needs', () => {
    const added = insertSlideListItem(of, 0, { on: 'slide', field: 'events', index: 0, key: 'title' })!;
    expect(added.deck.slides[0]!.events).toHaveLength(3);
    expect(added.deck.slides[0]!.events![1]).toEqual({ date: 'Year', title: 'What happened' });
    expect(added.focus).toMatchObject({ field: 'events', index: 1, key: 'title' });
    // A timeline keeps two events.
    expect(removeSlideListItem(of, 0, { on: 'slide', field: 'events', index: 0, key: 'title' })).toBeNull();
    expect(removeSlideListItem(added.deck, 0, { on: 'slide', field: 'events', index: 1, key: 'title' })!.deck.slides[0]!.events).toHaveLength(2);
    const place = insertSlideListItem(of, 1, { on: 'slide', field: 'places', index: 1, key: 'name' })!;
    expect(place.deck.slides[1]!.places![2]).toEqual({ name: 'Place' });
    // A map keeps one place.
    const one = deck([{ ...MAP, places: [{ name: 'Khartoum' }] } as Slide]);
    expect(removeSlideListItem(one, 0, { on: 'slide', field: 'places', index: 0, key: 'name' })).toBeNull();
  });
});
