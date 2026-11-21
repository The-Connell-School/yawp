/**
 * Finding a place by its name (Nov 19), so a pin on a map slide is never
 * where a model guessed. The planner names a place and, when the name is a
 * common one, where it is; this looks it up in the bundled place list and
 * answers with its position and what it matched, which the studio shows.
 * Not found is an answer too: the place is left off the map, and said so.
 */
import { fitMapView, pointArea, type MapView } from './map-view';
import { countryList, countryShapes, placeList, type Country, type PlaceRow } from './geo-data.server';
import type { SlideDeck } from '~/domain/lesson-planner/slide-deck';

export type FoundPlace = { lat: number; lon: number; found: string };

/** Names a text or a teacher uses for a city that goes by another today. */
const FORMER_NAMES: Record<string, string> = {
  constantinople: 'Istanbul',
  byzantium: 'Istanbul',
  bombay: 'Mumbai',
  calcutta: 'Kolkata',
  madras: 'Chennai',
  peking: 'Beijing',
  canton: 'Guangzhou',
  leningrad: 'Saint Petersburg',
  petrograd: 'Saint Petersburg',
  'st petersburg': 'Saint Petersburg',
  stalingrad: 'Volgograd',
  saigon: 'Ho Chi Minh City',
  rangoon: 'Yangon',
  batavia: 'Jakarta',
  edo: 'Tokyo',
  danzig: 'Gdańsk',
  'new york': 'New York City',
  'washington dc': 'Washington',
  'washington d c': 'Washington',
};

/**
 * English and older names an English class uses for a town the place list
 * spells its own way (demo pass, Nov 20–21). Unlike FORMER_NAMES, these are
 * only tried when the name as written finds nothing, so a real town with the
 * English name (Syracuse, New York) is still found first.
 */
const ENGLISH_NAMES: Record<string, string> = {
  geneva: 'Genève',
  mantua: 'Mantova',
  padua: 'Padova',
  leghorn: 'Livorno',
  syracuse: 'Siracusa',
  cologne: 'Köln',
  nuremberg: 'Nürnberg',
  cracow: 'Kraków',
  krakow: 'Kraków',
  archangel: 'Arkhangel’sk',
  antwerp: 'Antwerpen',
  ghent: 'Gent',
  bruges: 'Brugge',
  ypres: 'Ieper',
  seville: 'Sevilla',
  salonika: 'Thessaloníki',
  thessalonica: 'Thessaloníki',
  auschwitz: 'Oświęcim',
  gleiwitz: 'Gliwice',
  breslau: 'Wrocław',
  konigsberg: 'Kaliningrad',
  koenigsberg: 'Kaliningrad',
  lemberg: 'Lviv',
  lvov: 'Lviv',
  pressburg: 'Bratislava',
  kiev: 'Kyiv',
  dunkirk: 'Dunkerque',
  marseilles: 'Marseille',
  leopoldville: 'Kinshasa',
  stanleyville: 'Kisangani',
  salisbury: 'Harare',
};

const US_STATES: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO', connecticut: 'CT', delaware: 'DE',
  florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY',
  louisiana: 'LA', maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO',
  montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI',
  'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA',
  washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY', 'district of columbia': 'DC',
};
const STATE_NAMES = Object.fromEntries(Object.entries(US_STATES).map(([name, code]) => [code, name.replace(/\b\w/g, (letter) => letter.toUpperCase())]));

/** A name as it is compared: no accents, case or punctuation, and no leading "the". */
export function placeKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    // Arkhangel’sk and Arkhangelsk are one name.
    .replace(/['’ʼ`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/^the /, '')
    .trim();
}

let byName: Map<string, PlaceRow[]> | null = null;
function placesNamed(key: string): PlaceRow[] {
  if (!byName) {
    byName = new Map();
    // Largest first already, so each name's list is too.
    for (const row of placeList()) {
      const name = placeKey(row[0]);
      const list = byName.get(name);
      if (list) list.push(row);
      else byName.set(name, [row]);
    }
  }
  return byName.get(key) ?? [];
}

let countriesByName: Map<string, Country> | null = null;
/** The country a name means today, or null. */
export function findCountry(name: string): Country | null {
  if (!countriesByName) {
    countriesByName = new Map();
    for (const country of countryList()) for (const known of country.names) countriesByName.set(placeKey(known), country);
  }
  return countriesByName.get(placeKey(name)) ?? null;
}

/** The box a country's largest piece fits in: the mainland, not a far island. */
export function countryArea(country: Country): MapView | null {
  const shape = countryShapes('110m').find((candidate) => candidate.name === country.shape) ?? countryShapes('50m').find((candidate) => candidate.name === country.shape);
  if (!shape) return null;
  let best: MapView | null = null;
  let bestSize = -1;
  for (const part of shape.parts) {
    const lons = part.map(([lon]) => lon);
    const lats = part.map(([, lat]) => lat);
    const area = { w: Math.min(...lons), e: Math.max(...lons), s: Math.min(...lats), n: Math.max(...lats) };
    const size = (area.e - area.w) * (area.n - area.s);
    if (size > bestSize) {
      best = area;
      bestSize = size;
    }
  }
  return best;
}

const round = (value: number) => Math.round(value * 1000) / 1000;

/**
 * Where a place is. `where` (a country, a US state, or both) tells places of
 * one name apart; among those left the largest is taken. A country's own
 * name finds the country.
 */
export function findPlace(name: string, where?: string | null): FoundPlace | null {
  // "Khartoum, Sudan" is a name and where it is.
  const [first, ...rest] = name.split(',').map((part) => part.trim()).filter(Boolean);
  if (!first) return null;
  const hints = [...rest, ...(where ?? '').split(',')].map((part) => part.trim()).filter(Boolean);
  const country = hints.map(findCountry).find(Boolean) ?? null;
  const state = hints.map((hint) => US_STATES[placeKey(hint)]).find(Boolean) ?? null;

  const key = placeKey(first);
  const today = FORMER_NAMES[key];
  let rows = placesNamed(today ? placeKey(today) : key);
  const narrow = (list: PlaceRow[]) =>
    list.filter((row) => (!country?.iso2 || row[1] === country.iso2) && (!state || (row[1] === 'US' && row[2] === state)));
  rows = narrow(rows);
  // Nothing by the name as written: the English or older name of a town.
  const english = ENGLISH_NAMES[key];
  if (!rows.length && english) rows = narrow(placesNamed(placeKey(english)));

  // A country by its own name. With somewhere named, it is a town that is meant.
  const asCountry = hints.length ? null : findCountry(first);
  if (asCountry) {
    const area = countryArea(asCountry);
    if (area) return { lat: round((area.s + area.n) / 2), lon: round((area.w + area.e) / 2), found: `${asCountry.name} (the country)` };
  }

  const row = rows[0];
  if (!row) return null;
  const inCountry = countryList().find((candidate) => candidate.iso2 === row[1])?.name ?? row[1];
  const inState = row[1] === 'US' ? STATE_NAMES[row[2]] : undefined;
  return { lat: row[5], lon: row[4], found: [row[0], inState, inCountry].filter(Boolean).join(', ') };
}

/**
 * The deck with every map slide's places found: their positions and what
 * each matched written by Yawp!, whatever was there before, and the area the
 * map shows. A place that is not found keeps its name and has no position.
 * A deck with no map comes back as it was.
 */
export function resolveDeckPlaces<T extends SlideDeck>(deck: T): T {
  if (!deck.slides.some((slide) => slide.layout === 'map')) return deck;
  return {
    ...deck,
    slides: deck.slides.map((slide) => {
      if (slide.layout !== 'map') return slide;
      const found: MapView[] = [];
      const places = (slide.places ?? []).map(({ lat: _lat, lon: _lon, found: _found, ...place }) => {
        const hit = findPlace(place.name, place.where);
        if (!hit) return place;
        found.push(pointArea(hit.lon, hit.lat));
        return { ...place, ...hit };
      });
      const areas = [
        ...found,
        ...(slide.shade ?? []).flatMap((name) => {
          const country = findCountry(name);
          const area = country ? countryArea(country) : null;
          return area ? [area] : [];
        }),
      ];
      const { view: _view, ...rest } = slide;
      // A wide map shows the place among its neighbours (Kevin, Nov 21: some
      // students have never found Italy on a world map).
      const view = fitMapView(areas, undefined, slide.wide ? 0.75 : 0.14);
      return { ...rest, places, ...(view ? { view } : {}) };
    }),
  };
}
