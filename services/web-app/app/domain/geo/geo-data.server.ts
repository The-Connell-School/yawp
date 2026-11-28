/**
 * The bundled map data (Nov 19), read once and kept: country shapes, rivers
 * and lakes from Natural Earth, what each country is called, and the place
 * list from GeoNames. Built by scripts/geo/build-geo-data.mjs into
 * resources/geo/; sources and licences are in the README there. Nothing is
 * fetched: a map is drawn from these files and nowhere else.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { topoShapes, type GeoShape, type Topology } from './topojson';

function geoFile(name: string): string {
  const found = [path.resolve(process.cwd(), 'resources/geo', name), path.resolve(process.cwd(), 'services/web-app/resources/geo', name)].find((candidate) => existsSync(candidate));
  if (!found) throw new Error(`Map data is missing: resources/geo/${name}`);
  return found;
}

const cache = new Map<string, unknown>();
function once<T>(key: string, load: () => T): T {
  if (!cache.has(key)) cache.set(key, load());
  return cache.get(key) as T;
}
const readJson = <T>(name: string): T => JSON.parse(readFileSync(geoFile(name), 'utf8')) as T;

/** What a country is called, and by whom. */
export type Country = {
  /** ISO 3166-1 numeric, the key of its shape; null for a few disputed areas. */
  id: string | null;
  /** Its shape's own name in the map data. */
  shape: string;
  iso2: string | null;
  /** What Yawp! calls it. */
  name: string;
  /** Every name that finds it. */
  names: string[];
};

/** [name, country (ISO 2), state or province code, population, lon, lat, 1 for a capital]. Largest first. */
export type PlaceRow = [string, string, string, number, number, number, 0 | 1];

export const countryList = () => once('countries', () => readJson<Country[]>('countries.json'));
export const placeList = () => once('places', () => readJson<PlaceRow[]>('places.json'));
/** Country shapes: `50m` for a region, `110m` (a seventh the size) for a view across continents. */
export const countryShapes = (detail: '50m' | '110m'): GeoShape[] => once(`shapes-${detail}`, () => topoShapes(readJson<Topology>(`countries-${detail}.json`), 'countries'));
export const riverShapes = (): GeoShape[] => once('rivers', () => topoShapes(readJson<Topology>('water-50m.json'), 'rivers'));
export const lakeShapes = (): GeoShape[] => once('lakes', () => topoShapes(readJson<Topology>('water-50m.json'), 'lakes'));
