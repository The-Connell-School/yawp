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
/**
 * Places of the books English classes read (Kevin, Nov 23: Thebes was "not on
 * the map" of an Antigone unit, and the place list put Sparta in New Jersey,
 * Troy in Michigan and Marathon in Florida). The place list holds today's
 * towns of some size; the ancient sites, the legendary ones with a real spot,
 * and the ruins are not in it, or lose to an American town of the name. Each
 * is set by hand from the site itself. They win unless the lesson places the
 * name in another country or in a US state ("Troy, New York").
 */
type StoryPlace = { lat: number; lon: number; iso2: string; found: string };
const STORY_PLACES: Record<string, StoryPlace[]> = {
  thebes: [
    { lat: 38.321, lon: 23.319, iso2: 'GR', found: 'Thebes, Greece (the ancient city; today Thiva)' },
    { lat: 25.72, lon: 32.61, iso2: 'EG', found: 'Thebes, Egypt (the ancient city; today Luxor)' },
  ],
  sparta: [{ lat: 37.074, lon: 22.43, iso2: 'GR', found: 'Sparta, Greece (the ancient city)' }],
  troy: [{ lat: 39.957, lon: 26.239, iso2: 'TR', found: 'Troy (the ancient city; today Hisarlık, Turkey)' }],
  ithaca: [{ lat: 38.4, lon: 20.68, iso2: 'GR', found: 'Ithaca, Greece (the island)' }],
  ithaka: [{ lat: 38.4, lon: 20.68, iso2: 'GR', found: 'Ithaca, Greece (the island)' }],
  mycenae: [{ lat: 37.731, lon: 22.756, iso2: 'GR', found: 'Mycenae, Greece (the ancient city)' }],
  delphi: [{ lat: 38.482, lon: 22.501, iso2: 'GR', found: 'Delphi, Greece (the oracle’s sanctuary)' }],
  colonus: [{ lat: 37.996, lon: 23.71, iso2: 'GR', found: 'Colonus, Athens, Greece' }],
  corinth: [{ lat: 37.906, lon: 22.879, iso2: 'GR', found: 'Corinth, Greece (the ancient city)' }],
  olympia: [{ lat: 37.638, lon: 21.63, iso2: 'GR', found: 'Olympia, Greece (the sanctuary)' }],
  knossos: [{ lat: 35.298, lon: 25.163, iso2: 'GR', found: 'Knossos, Crete, Greece' }],
  marathon: [{ lat: 38.153, lon: 23.963, iso2: 'GR', found: 'Marathon, Greece' }],
  salamis: [{ lat: 37.964, lon: 23.497, iso2: 'GR', found: 'Salamis, Greece (the island)' }],
  thermopylae: [{ lat: 38.797, lon: 22.537, iso2: 'GR', found: 'Thermopylae, Greece (the pass)' }],
  'mount olympus': [{ lat: 40.085, lon: 22.359, iso2: 'GR', found: 'Mount Olympus, Greece' }],
  olympus: [{ lat: 40.085, lon: 22.359, iso2: 'GR', found: 'Mount Olympus, Greece' }],
  pylos: [{ lat: 36.913, lon: 21.696, iso2: 'GR', found: 'Pylos, Greece' }],
  aulis: [{ lat: 38.433, lon: 23.6, iso2: 'GR', found: 'Aulis, Greece' }],
  epidaurus: [{ lat: 37.596, lon: 23.079, iso2: 'GR', found: 'Epidaurus, Greece (the theatre)' }],
  babylon: [{ lat: 32.536, lon: 44.421, iso2: 'IQ', found: 'Babylon (the ancient city; today Iraq)' }],
  nineveh: [{ lat: 36.359, lon: 43.153, iso2: 'IQ', found: 'Nineveh (the ancient city; today Mosul, Iraq)' }],
  uruk: [{ lat: 31.322, lon: 45.636, iso2: 'IQ', found: 'Uruk (the ancient city; today Iraq)' }],
  ur: [{ lat: 30.963, lon: 46.103, iso2: 'IQ', found: 'Ur (the ancient city; today Iraq)' }],
  pompeii: [{ lat: 40.749, lon: 14.485, iso2: 'IT', found: 'Pompeii, Italy (the ruins)' }],
  actium: [{ lat: 38.95, lon: 20.75, iso2: 'GR', found: 'Actium, Greece' }],
  philippi: [{ lat: 41.013, lon: 24.284, iso2: 'GR', found: 'Philippi, Greece (the ancient city)' }],
  dunsinane: [{ lat: 56.469, lon: -3.233, iso2: 'GB', found: 'Dunsinane Hill, Scotland' }],
  birnam: [{ lat: 56.557, lon: -3.576, iso2: 'GB', found: 'Birnam, Scotland' }],
  glamis: [{ lat: 56.605, lon: -3.002, iso2: 'GB', found: 'Glamis, Scotland' }],
  cawdor: [{ lat: 57.524, lon: -3.926, iso2: 'GB', found: 'Cawdor, Scotland' }],
  elsinore: [{ lat: 56.039, lon: 12.621, iso2: 'DK', found: 'Elsinore (Helsingør), Denmark' }],
  somme: [{ lat: 50.05, lon: 2.69, iso2: 'FR', found: 'The Somme, France (the battlefield, near Thiepval)' }],
  craiglockhart: [{ lat: 55.919, lon: -3.236, iso2: 'GB', found: 'Craiglockhart War Hospital, Edinburgh, Scotland' }],
  passchendaele: [{ lat: 50.9, lon: 3.02, iso2: 'BE', found: 'Passchendaele (Passendale), Belgium' }],
  gallipoli: [{ lat: 40.24, lon: 26.28, iso2: 'TR', found: 'Gallipoli, Turkey (the peninsula)' }],
  flushing: [{ lat: 40.765, lon: -73.833, iso2: 'US', found: 'Flushing, Queens, New York, United States of America' }],
  'agincourt': [{ lat: 50.463, lon: 2.142, iso2: 'FR', found: 'Agincourt (Azincourt), France' }],
  'bosworth': [{ lat: 52.59, lon: -1.41, iso2: 'GB', found: 'Bosworth Field, England' }],
  'gettysburg': [{ lat: 39.831, lon: -77.231, iso2: 'US', found: 'Gettysburg, Pennsylvania, United States of America' }],
  'harpers ferry': [{ lat: 39.325, lon: -77.739, iso2: 'US', found: 'Harpers Ferry, West Virginia, United States of America' }],
  'eatonville': [{ lat: 28.615, lon: -81.38, iso2: 'US', found: 'Eatonville, Florida, United States of America' }],
};

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
/** Each state's middle, for a map that names the state itself ("Oklahoma", preview, Nov 22). */
const STATE_CENTERS: Record<string, [lat: number, lon: number]> = {
  AL: [32.8, -86.8], AK: [64.7, -152.0], AZ: [34.3, -111.7], AR: [34.9, -92.4], CA: [37.2, -119.5], CO: [39.0, -105.5], CT: [41.6, -72.7],
  DE: [39.0, -75.5], FL: [28.6, -82.4], GA: [32.7, -83.4], HI: [20.3, -156.4], ID: [44.4, -114.6], IL: [40.0, -89.2], IN: [39.9, -86.3],
  IA: [42.1, -93.5], KS: [38.5, -98.4], KY: [37.5, -85.3], LA: [31.1, -92.0], ME: [45.4, -69.2], MD: [39.0, -76.8], MA: [42.3, -71.8],
  MI: [44.3, -85.4], MN: [46.3, -94.3], MS: [32.7, -89.7], MO: [38.4, -92.5], MT: [47.0, -109.6], NE: [41.5, -99.8], NV: [39.3, -116.6],
  NH: [43.7, -71.6], NJ: [40.2, -74.7], NM: [34.4, -106.1], NY: [42.9, -75.5], NC: [35.6, -79.4], ND: [47.5, -100.5], OH: [40.3, -82.8],
  OK: [35.6, -97.5], OR: [43.9, -120.6], PA: [40.9, -77.8], RI: [41.7, -71.5], SC: [33.9, -80.9], SD: [44.4, -100.2], TN: [35.9, -86.4],
  TX: [31.5, -99.3], UT: [39.3, -111.7], VT: [44.1, -72.7], VA: [37.5, -78.9], WA: [47.4, -120.5], WV: [38.6, -80.6], WI: [44.6, -89.9],
  WY: [43.0, -107.6], DC: [38.9, -77.0],
};
/** A town of a state's name that a map would mean instead of the state: New York. */
const A_CITY = 100_000;
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
  // The capital, however it is written (King's letter, Nov 23: "Washington, D.C." in
  // "District of Columbia" was not found; "Washington D.C." went to England).
  const whole = `${name},${where ?? ''}`;
  if (/^\s*washington\b/i.test(name) && (/\bd\.?\s?c\b\.?|district of columbia/i.test(whole))) {
    return findPlace('Washington', 'United States');
  }
  // "Khartoum, Sudan" is a name and where it is.
  const [first, ...rest] = name.split(',').map((part) => part.trim()).filter(Boolean);
  if (!first) return null;
  const hints = [...rest, ...(where ?? '').split(',')].map((part) => part.trim()).filter(Boolean);
  const state = hints.map((hint) => US_STATES[placeKey(hint)]).find(Boolean) ?? null;
  // "Athens, Georgia": a US state, not the country of that name.
  const country = hints.filter((hint) => !(state && US_STATES[placeKey(hint)])).map(findCountry).find(Boolean) ?? null;

  const key = placeKey(first);
  // A place of the story: the ancient city, not the American town of its name.
  const story = STORY_PLACES[key];
  if (story && (!state || story.some((place) => place.iso2 === 'US'))) {
    const place = country ? story.find((candidate) => candidate.iso2 === country.iso2) : story[0];
    if (place && (!state || place.iso2 === 'US')) return { lat: place.lat, lon: place.lon, found: place.found };
  }
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

  // "Washington" on a map of the country is its capital; the state is "Washington State".
  if (key === 'washington' && !state && (!country || country.iso2 === 'US')) rows = placesNamed(placeKey('Washington, D.C.'));
  // A state by its own name, inside the United States (or with nothing said):
  // the state, not the largest town that shares its name (California,
  // Maryland, on the Grapes of Wrath map). A real city of the name wins.
  const asState = key === 'washington' ? undefined : (US_STATES[key] ?? (key === 'washington state' ? 'WA' : undefined));
  if (asState && (!country || country.iso2 === 'US') && !state && !(rows[0] && rows[0][1] === 'US' && rows[0][3] >= A_CITY)) {
    const [lat, lon] = STATE_CENTERS[asState]!;
    return { lat, lon, found: `${STATE_NAMES[asState]} (the state)` };
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
  const firstMap = deck.slides.findIndex((slide) => slide.layout === 'map');
  return {
    ...deck,
    slides: deck.slides.map((slide, index) => {
      if (slide.layout !== 'map') return slide;
      // A deck's first map starts wide unless the planner said otherwise
      // (R2; 13-lesson review, Nov 22: Alabama with no country around it).
      if (index === firstMap && slide.wide === undefined) slide = { ...slide, wide: true };
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
