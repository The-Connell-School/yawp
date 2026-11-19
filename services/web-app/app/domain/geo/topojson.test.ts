import { describe, expect, test } from 'bun:test';
import { topoShapes, type Topology } from './topojson';
import { countryShapes, lakeShapes, riverShapes } from './geo-data.server';

describe('topoShapes', () => {
  // A square in two arcs, on a grid of tenths; and the same square walked the other way round.
  const topology: Topology = {
    transform: { scale: [0.1, 0.1], translate: [10, 20] },
    arcs: [
      [[0, 0], [0, 10], [10, 0], [0, -10]], // three sides, from its corner
      [[10, 0], [-10, 0]], // the fourth, back to the corner
      [[10, 10], [0, -10]], // a line on its own
    ],
    objects: {
      squares: {
        geometries: [
          { type: 'Polygon', id: '1', properties: { name: 'Left' }, arcs: [[0, 1]] },
          { type: 'MultiPolygon', id: 2, properties: { name: 'Backwards' }, arcs: [[[~1, ~0]]] },
          { type: 'Point' },
        ],
      },
      lines: { geometries: [{ type: 'LineString', arcs: [2] }, { type: 'MultiLineString', arcs: [[~2], [1]] }] },
    },
  };

  test('steps become positions, arcs join end to start, and a negative index walks an arc backwards', () => {
    const [left, backwards] = topoShapes(topology, 'squares');
    expect(left).toMatchObject({ id: '1', name: 'Left', kind: 'area' });
    expect(left!.parts[0]).toEqual([[10, 20], [10, 21], [11, 21], [11, 20], [10, 20]]);
    expect(left!.box).toEqual([10, 20, 11, 21]);
    expect(backwards).toMatchObject({ id: '2', name: 'Backwards' });
    expect(backwards!.parts[0]).toEqual([[10, 20], [11, 20], [11, 21], [10, 21], [10, 20]]);
  });

  test('lines are lines; a shape this does not know is left out', () => {
    expect(topoShapes(topology, 'squares')).toHaveLength(2);
    const [one, two] = topoShapes(topology, 'lines');
    expect(one).toMatchObject({ kind: 'line' });
    expect(one!.parts).toEqual([[[11, 21], [11, 20]]]);
    expect(two!.parts).toHaveLength(2);
    expect(topoShapes(topology, 'nothing')).toEqual([]);
  });
});

describe('the bundled map data', () => {
  const inside = (shape: { box: [number, number, number, number] }, lon: number, lat: number) => lon >= shape.box[0] && lon <= shape.box[2] && lat >= shape.box[1] && lat <= shape.box[3];

  test('countries are where they are: Khartoum is in Sudan’s box, Juba in South Sudan’s, neither in Germany’s', () => {
    for (const detail of ['50m', '110m'] as const) {
      const shapes = countryShapes(detail);
      const sudan = shapes.find((shape) => shape.name === 'Sudan')!;
      const south = shapes.find((shape) => shape.name === 'S. Sudan')!;
      const germany = shapes.find((shape) => shape.name === 'Germany')!;
      expect(inside(sudan, 32.53, 15.55)).toBe(true);
      expect(inside(south, 31.58, 4.85)).toBe(true);
      expect(inside(sudan, 31.58, 4.85)).toBe(false);
      expect(inside(germany, 32.53, 15.55)).toBe(false);
      expect(inside(germany, 13.4, 52.52)).toBe(true);
    }
    expect(countryShapes('50m').length).toBeGreaterThan(200);
  });

  test('there is water: rivers as lines, lakes as areas, and one of each runs through the Nile’s country', () => {
    const rivers = riverShapes();
    const lakes = lakeShapes();
    expect(rivers.every((river) => river.kind === 'line')).toBe(true);
    expect(lakes.every((lake) => lake.kind === 'area')).toBe(true);
    // A river with a point within a degree of Khartoum, where the two Niles meet.
    const near = (lon: number, lat: number) => rivers.some((river) => river.parts.some((part) => part.some(([x, y]) => Math.abs(x - lon) < 1 && Math.abs(y - lat) < 1)));
    expect(near(32.53, 15.55)).toBe(true);
    // Lake Victoria straddles the equator at about 33 east.
    expect(lakes.some((lake) => inside(lake, 33, -1))).toBe(true);
  });
});
