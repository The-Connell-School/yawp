import { describe, expect, test } from 'bun:test';
import { mapPoint } from './map-view';
import { findCountry, findPlace, placeKey, resolveDeckPlaces } from './places.server';
import type { Slide, SlideDeck } from '~/domain/lesson-planner/slide-deck';

const near = (found: { lat: number; lon: number } | null, lat: number, lon: number) => {
  expect(found).not.toBeNull();
  expect(Math.abs(found!.lat - lat)).toBeLessThan(0.3);
  expect(Math.abs(found!.lon - lon)).toBeLessThan(0.3);
};

describe('findPlace', () => {
  test('the places the bot lessons needed, each where it is', () => {
    near(findPlace('Khartoum', 'Sudan'), 15.55, 32.53);
    near(findPlace('London', 'United Kingdom'), 51.51, -0.13);
    near(findPlace('Cairo'), 30.04, 31.24);
    near(findPlace('Birmingham', 'Alabama'), 33.52, -86.8);
    expect(findPlace('Khartoum', 'Sudan')!.found).toBe('Khartoum, Sudan');
    expect(findPlace('Birmingham', 'Alabama')!.found).toBe('Birmingham, Alabama, United States of America');
  });

  test('two towns of one name: where says which, and without it the largest', () => {
    near(findPlace('Birmingham'), 52.48, -1.9);
    near(findPlace('Birmingham', 'England'), 52.48, -1.9);
    near(findPlace('Salinas', 'California'), 36.68, -121.66);
    near(findPlace('Soledad', 'California, United States'), 36.42, -121.33);
    near(findPlace('Monroeville', 'Alabama'), 31.53, -87.32);
    // "Name, Place" in the name itself works the same.
    near(findPlace('Monroeville, Alabama'), 31.53, -87.32);
  });

  test('accents, case and "the" do not matter; a former name finds the city of today', () => {
    expect(placeKey('  São Paulo ')).toBe('sao paulo');
    expect(placeKey('The Hague')).toBe('hague');
    near(findPlace('sao paulo'), -23.55, -46.64);
    const istanbul = findPlace('Constantinople');
    near(istanbul, 41.01, 28.95);
    expect(istanbul!.found).toBe('Istanbul, Turkey');
    near(findPlace('Leningrad'), 59.94, 30.31);
    near(findPlace('New York'), 40.71, -74.01);
  });

  test('a country by its name is the country, at its mainland', () => {
    const sudan = findPlace('Sudan');
    expect(sudan!.found).toBe('Sudan (the country)');
    expect(sudan!.lat).toBeGreaterThan(9);
    expect(sudan!.lat).toBeLessThan(22);
    expect(sudan!.lon).toBeGreaterThan(22);
    expect(sudan!.lon).toBeLessThan(38);
    // France is in Europe, whatever islands it has.
    const france = findPlace('France')!;
    expect(france.lat).toBeGreaterThan(41);
    expect(france.lon).toBeGreaterThan(-6);
    expect(france.lon).toBeLessThan(10);
    expect(findCountry('South Sudan')?.shape).toBe('S. Sudan');
    expect(findCountry('Burma')?.name).toBe('Myanmar');
    expect(findCountry('Narnia')).toBeNull();
  });

  test('a place the list does not have, or a town that is not in the country named, is not found', () => {
    expect(findPlace('Maycomb', 'Alabama')).toBeNull();
    expect(findPlace('Khartoum', 'France')).toBeNull();
    expect(findPlace('')).toBeNull();
    expect(findPlace(' , ')).toBeNull();
  });
});

describe('resolveDeckPlaces', () => {
  const map: Slide = {
    layout: 'map',
    title: 'The narrator’s journey',
    shade: ['Sudan', 'South Sudan'],
    places: [
      // A position the planner wrote: in the Atlantic. It is thrown away.
      { name: 'Khartoum', where: 'Sudan', lat: 0, lon: -30, found: 'I made this up' },
      { name: 'Wad Hamid', where: 'Sudan' },
      { name: 'London', where: 'United Kingdom' },
    ],
    view: { w: 0, s: 0, e: 1, n: 1 },
    speakerNotes: 'n',
  } as Slide;
  const deck: SlideDeck = { title: 'D', kit: 'v4.1', slides: [{ layout: 'title', title: 'T', speakerNotes: 'n' } as Slide, map] };

  test('positions are Yawp!’s own, whatever the planner wrote; a place not found has none', () => {
    const resolved = resolveDeckPlaces(deck);
    const [khartoum, village, london] = resolved.slides[1]!.places!;
    near(khartoum as never, 15.55, 32.53);
    expect(khartoum!.found).toBe('Khartoum, Sudan');
    expect(village).toEqual({ name: 'Wad Hamid', where: 'Sudan' });
    near(london as never, 51.51, -0.13);
    expect(resolved.kit).toBe('v4.1');
    expect(resolved.slides[0]).toBe(deck.slides[0]!);
  });

  test('the view frames the places and the shaded countries', () => {
    const view = resolveDeckPlaces(deck).slides[1]!.view!;
    for (const [lon, lat] of [[32.53, 15.55], [-0.13, 51.51], [31.58, 4.85]]) {
      const point = mapPoint(view, lon!, lat!);
      expect(point.x).toBeGreaterThan(0);
      expect(point.x).toBeLessThan(1);
      expect(point.y).toBeGreaterThan(0);
      expect(point.y).toBeLessThan(1);
    }
  });

  test('a deck with no map is not touched; a map with nothing found has no view', () => {
    const plain: SlideDeck = { title: 'D', slides: [deck.slides[0]!] };
    expect(resolveDeckPlaces(plain)).toBe(plain);
    const lost = resolveDeckPlaces({ title: 'D', slides: [{ ...map, shade: undefined, places: [{ name: 'Maycomb' }] } as Slide] });
    expect(lost.slides[0]!.view).toBeUndefined();
    expect(lost.slides[0]!.places).toEqual([{ name: 'Maycomb' }]);
  });
});

describe('a map that starts wider than the place (Kevin, Nov 21)', () => {
  const mapOf = (wide: boolean) =>
    resolveDeckPlaces({
      title: 'Italy',
      slides: [{ layout: 'map', title: 'Where is Italy?', shade: ['Italy'], places: [{ name: 'Rome', where: 'Italy' }], speakerNotes: 'n', wide } as Slide],
    }).slides[0]!.view!;

  test('wide shows the country among its neighbours: a much larger area, still around it', () => {
    const close = mapOf(false);
    const wide = mapOf(true);
    expect(wide.e - wide.w).toBeGreaterThan((close.e - close.w) * 1.8);
    // Still Italy in the middle of it.
    expect(wide.w).toBeLessThan(6.6);
    expect(wide.e).toBeGreaterThan(18.5);
    expect(wide.s).toBeLessThan(36.6);
    expect(wide.n).toBeGreaterThan(47.1);
  });
});

describe('the names an English class uses (demo pass, Nov 20–21)', () => {
  test('English and older names find today’s town', () => {
    const cases: [string, string, string][] = [
      ['Geneva', 'Switzerland', 'Genève, Switzerland'],
      ['Mantua', 'Italy', 'Mantova, Italy'],
      ['Padua', 'Italy', 'Padova, Italy'],
      ['Syracuse', 'Italy', 'Siracusa, Italy'],
      ['Cologne', 'Germany', 'Köln, Germany'],
      ['Archangel', 'Russia', 'Arkhangel’sk, Russia'],
      ['Ypres', 'Belgium', 'Ieper, Belgium'],
      ['Auschwitz', 'Poland', 'Oświęcim, Poland'],
      ['Gleiwitz', 'Poland', 'Gliwice, Poland'],
      ['Breslau', 'Poland', 'Wrocław, Poland'],
      ['Königsberg', 'Russia', 'Kaliningrad, Russia'],
      ['Kiev', 'Ukraine', 'Kyiv, Ukraine'],
      ['Marseilles', 'France', 'Marseille, France'],
      ['Leopoldville', 'Democratic Republic of the Congo', 'Kinshasa, Democratic Republic of the Congo'],
    ];
    for (const [name, where, found] of cases) expect(findPlace(name, where)?.found).toBe(found);
  });

  test('a town that really has the English name keeps it', () => {
    expect(findPlace('Syracuse', 'New York')?.found).toBe('Syracuse, New York, United States of America');
  });

  test('a transliteration with or without its apostrophe', () => {
    expect(findPlace('Arkhangelsk', 'Russia')?.found).toBe('Arkhangel’sk, Russia');
    expect(findPlace('Arkhangel’sk', 'Russia')?.found).toBe('Arkhangel’sk, Russia');
  });
});

describe('a state by its own name (preview, Nov 22: The Grapes of Wrath)', () => {
  test('Oklahoma, Texas, Kansas and California are the states, not a town that shares the name', () => {
    for (const [name, lat, lon] of [['Oklahoma', 35.6, -97.5], ['Texas', 31.5, -99.3], ['Kansas', 38.5, -98.4], ['California', 37.2, -119.5]] as const) {
      const found = findPlace(name, 'United States');
      expect(found?.found).toBe(`${name} (the state)`);
      expect(found?.lat).toBeCloseTo(lat, 1);
      expect(found?.lon).toBeCloseTo(lon, 1);
    }
    expect(findPlace('California')?.found).toBe('California (the state)');
  });

  test('a city of the name is still the city, and a town in a named state is still the town', () => {
    expect(findPlace('New York', 'United States')?.found).toContain('New York');
    expect(findPlace('New York', 'United States')?.found).not.toContain('(the state)');
    expect(findPlace('Washington', 'United States')?.found).toBe('Washington, D.C., District Of Columbia, United States of America');
    expect(findPlace('Washington State')?.found).toBe('Washington (the state)');
    expect(findPlace('Washington', 'Utah')?.found).toContain('Utah');
    expect(findPlace('California', 'Maryland')?.found ?? '').not.toContain('(the state)');
  });

  test('every state has a middle', () => {
    for (const name of ['Alaska', 'Hawaii', 'Rhode Island', 'West Virginia', 'Wyoming', 'Maine']) expect(findPlace(name)?.found).toBe(`${name} (the state)`);
  });
});

describe('a deck’s first map starts wide unless the planner says otherwise (13-lesson review, Nov 22)', () => {
  const map = (title: string, extra: Partial<Slide> = {}) => ({ layout: 'map', title, places: [{ name: 'Montgomery', where: 'Alabama' }], speakerNotes: 'n', ...extra }) as Slide;
  test('the first map is wide; a later one keeps its close view; one marked not wide stays close', () => {
    const out = resolveDeckPlaces({ title: 'D', slides: [map('Where'), map('Closer')] });
    expect(out.slides[0]!.wide).toBe(true);
    expect(out.slides[1]!.wide).toBeUndefined();
    expect(resolveDeckPlaces({ title: 'D', slides: [map('Where', { wide: false })] }).slides[0]!.wide).toBe(false);
  });
});
