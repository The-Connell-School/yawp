import { describe, expect, test } from 'bun:test';
import { buildMapDrawing, mapSvg, MAP_COLORS } from './map-drawing.server';
import { MAP_BOX, fitMapView, pointArea, type MapSpec } from './map-view';

const view = fitMapView([pointArea(32.53, 15.55), pointArea(31.24, 30.04)])!;
const spec: MapSpec = { view, shade: ['Sudan', 'South Sudan'], color: '#2F5873', route: [[32.53, 15.55], [31.24, 30.04]] };

describe('buildMapDrawing', () => {
  test('land, the shaded countries in a tint of the deck color, water, then the route on top', () => {
    const { layers, width, height, background } = buildMapDrawing(spec);
    expect([width, height]).toEqual([MAP_BOX.w, MAP_BOX.h]);
    expect(background).toBe(MAP_COLORS.sea);
    expect(layers.map((layer) => layer.fill ?? layer.stroke)).toEqual([MAP_COLORS.land, expect.stringMatching(/^#[0-9A-F]{6}$/), MAP_COLORS.sea, MAP_COLORS.water, MAP_COLORS.route]);
    const shaded = layers[1]!;
    expect(shaded.stroke).toBe('#2F5873');
    // A tint, not the color itself and not the land.
    expect(shaded.fill).not.toBe('#2F5873');
    expect(shaded.fill).not.toBe(MAP_COLORS.land);
    expect(layers.at(-1)).toMatchObject({ dash: [7, 6] });
    expect(layers.at(-1)!.d.startsWith('M')).toBe(true);
  });

  test('nothing shaded, no route: land and water only', () => {
    const { layers } = buildMapDrawing({ ...spec, shade: [], route: [] });
    expect(layers.map((layer) => layer.fill ?? layer.stroke)).toEqual([MAP_COLORS.land, MAP_COLORS.sea, MAP_COLORS.water]);
    // A country nobody has heard of is not shaded, and nothing breaks.
    expect(buildMapDrawing({ ...spec, shade: ['Narnia'], route: [] }).layers).toHaveLength(3);
  });

  test('only what is in view is drawn: a map of the Nile is a small picture', () => {
    const regional = mapSvg(spec);
    expect(regional.length).toBeLessThan(200_000);
    expect(regional).toContain('viewBox="0 0 820 720"');
    expect(regional).toContain('fill-rule="evenodd"');
    expect(regional).not.toContain('NaN');
    // The whole world, at the coarse level of detail, with every river: still one modest picture.
    const world = mapSvg({ view: { w: -170, s: -55, e: 175, n: 78 }, shade: [], color: '#2F5873', route: [] });
    expect(world.length).toBeLessThan(400_000);
    expect(world).not.toContain('NaN');
  });
});

describe('a shape across the 180th meridian draws no line across the map (demo pass, Nov 20)', () => {
  test('Russia’s far east does not cut across a map of Europe', () => {
    const view = { w: -9.05, s: 40.43, e: 46.63, n: 67.75 };
    const drawing = buildMapDrawing({ view, shade: [], color: '#2F4858', route: [] });
    const long: string[] = [];
    for (const layer of drawing.layers) {
      for (const sub of layer.d.split('M').filter(Boolean)) {
        const points = sub.replace(/Z/g, '').split('L').map((pair) => pair.trim().split(/\s+/).map(Number));
        for (let i = 1; i < points.length; i += 1) {
          const [x0, y0] = points[i - 1]!;
          const [x1, y1] = points[i]!;
          const inside = (y: number) => y > 0 && y < drawing.height;
          if (Math.abs(x1! - x0!) > drawing.width * 0.4 && Math.abs(y1! - y0!) < 4 && inside(y0!)) long.push(`${x0},${y0} → ${x1},${y1}`);
        }
      }
    }
    expect(long).toEqual([]);
  });
});
