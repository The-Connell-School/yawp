// Builds the map data in resources/geo/ (Nov 19). Run by hand, rarely:
//
//   mkdir /tmp/geo && cd /tmp/geo && npm init -y
//   npm install world-atlas sane-topojson all-the-cities i18n-iso-countries
//   node <repo>/services/web-app/scripts/geo/build-geo-data.mjs /tmp/geo <repo>/services/web-app/resources/geo
//
// The packages are sources, not dependencies of the app: the app reads only
// the files written here. Sources and licences are in resources/geo/README.md.
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [from, to] = process.argv.slice(2);
if (!from || !to) throw new Error('usage: build-geo-data.mjs <dir with node_modules> <out dir>');
const require = createRequire(join(from, 'package.json'));

/** A topology holding only the named objects and the arcs they use. */
function prune(topology, keep) {
  const used = new Map();
  const arcs = [];
  const remap = (index) => {
    const at = index < 0 ? ~index : index;
    if (!used.has(at)) {
      used.set(at, arcs.length);
      arcs.push(topology.arcs[at]);
    }
    return index < 0 ? ~used.get(at) : used.get(at);
  };
  const walk = (value) => (Array.isArray(value) ? value.map(walk) : remap(value));
  const objects = {};
  for (const name of keep) {
    const object = topology.objects[name];
    objects[name] = {
      type: object.type,
      geometries: object.geometries.map((geometry) => ({
        type: geometry.type,
        ...(geometry.id === undefined ? {} : { id: geometry.id }),
        ...(geometry.properties?.name ? { properties: { name: geometry.properties.name } } : {}),
        arcs: walk(geometry.arcs ?? []),
      })),
    };
  }
  return { type: 'Topology', transform: topology.transform, objects, arcs };
}

// Countries, at two levels of detail.
for (const detail of ['50m', '110m']) {
  const topology = prune(require(`world-atlas/countries-${detail}.json`), ['countries']);
  writeFileSync(join(to, `countries-${detail}.json`), JSON.stringify(topology));
}

// Rivers and lakes.
writeFileSync(join(to, 'water-50m.json'), JSON.stringify(prune(require('sane-topojson/dist/world_50m.json'), ['rivers', 'lakes'])));

// What each country is called. Natural Earth abbreviates ("S. Sudan"); a
// teacher and a planner write "South Sudan".
const iso = require('i18n-iso-countries');
iso.registerLocale(require('i18n-iso-countries/langs/en.json'));
const EXTRA = {
  GB: ['Britain', 'England', 'Scotland', 'Wales'],
  US: ['America', 'United States of America'],
  RU: ['Russia'],
  IR: ['Persia', 'Iran'],
  MM: ['Burma', 'Myanmar'],
  TH: ['Siam'],
  LK: ['Ceylon'],
  NL: ['Holland'],
  CZ: ['Czech Republic'],
  CI: ['Ivory Coast'],
  CD: ['DR Congo', 'Congo-Kinshasa'],
  CG: ['Republic of the Congo', 'Congo-Brazzaville'],
  KR: ['South Korea'],
  KP: ['North Korea'],
  SY: ['Syria'],
  VN: ['Vietnam'],
  LA: ['Laos'],
  TZ: ['Tanzania'],
  BO: ['Bolivia'],
  VE: ['Venezuela'],
  MD: ['Moldova'],
  PS: ['Palestine'],
  TR: ['Turkey'],
};
const shapes = require('world-atlas/countries-50m.json').objects.countries.geometries;
const countries = [];
for (const shape of shapes) {
  const iso2 = shape.id ? iso.numericToAlpha2(shape.id) : undefined;
  const official = iso2 ? iso.getName(iso2, 'en', { select: 'official' }) : undefined;
  const names = [...new Set([official, shape.properties.name, ...(iso2 ? iso.getName(iso2, 'en', { select: 'all' }) : []), ...(iso2 ? (EXTRA[iso2] ?? []) : [])].filter(Boolean))];
  countries.push({ id: shape.id ?? null, shape: shape.properties.name, iso2: iso2 ?? null, name: EXTRA[iso2]?.at(-1) && ['IR', 'MM', 'SY', 'VN', 'LA', 'TZ', 'BO', 'VE', 'MD', 'KR', 'KP', 'RU', 'TR', 'PS'].includes(iso2) ? EXTRA[iso2].at(-1) : (official ?? shape.properties.name), names });
}
// A name two countries answer to finds neither.
const count = new Map();
for (const country of countries) for (const name of country.names) count.set(name.toLowerCase(), (count.get(name.toLowerCase()) ?? 0) + 1);
for (const country of countries) country.names = country.names.filter((name) => count.get(name.toLowerCase()) === 1 || name === country.name);
writeFileSync(join(to, 'countries.json'), JSON.stringify(countries));

// Places: towns of 5,000 people or more, and every capital. Largest first,
// so the first match on a name is the one most people mean.
const cities = require('all-the-cities')
  .filter((city) => city.population >= 5000 || city.featureCode === 'PPLC')
  .sort((a, b) => b.population - a.population)
  .map((city) => [city.name, city.country, city.adminCode || '', city.population, Math.round(city.loc.coordinates[0] * 1000) / 1000, Math.round(city.loc.coordinates[1] * 1000) / 1000, city.featureCode === 'PPLC' ? 1 : 0]);
writeFileSync(join(to, 'places.json'), JSON.stringify(cities));
console.log(`countries ${countries.length}, places ${cities.length}`);
