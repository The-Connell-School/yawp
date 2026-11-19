import { describe, expect, test } from 'bun:test';
import { MAP_BOX, fitMapView, inMapView, mapImageSrc, mapPoint, pointArea, readMapSpec } from './map-view';

const KHARTOUM = pointArea(32.53, 15.55);
const LONDON = pointArea(-0.13, 51.51);
const CAIRO = pointArea(31.24, 30.04);

describe('fitMapView', () => {
  test('frames every place with room around it, at the map box’s shape', () => {
    const view = fitMapView([KHARTOUM, CAIRO, LONDON])!;
    for (const place of [KHARTOUM, CAIRO, LONDON]) {
      const { x, y } = mapPoint(view, place.w, place.n);
      expect(x).toBeGreaterThan(0.05);
      expect(x).toBeLessThan(0.95);
      expect(y).toBeGreaterThan(0.05);
      expect(y).toBeLessThan(0.95);
    }
    // Width over height, in projected units, is the box's.
    const corner = mapPoint(view, view.e, view.s);
    expect(corner).toEqual({ x: 1, y: 1 });
    const mercator = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
    const shape = (((view.e - view.w) * Math.PI) / 180) / (mercator(view.n) - mercator(view.s));
    expect(shape).toBeCloseTo(MAP_BOX.w / MAP_BOX.h, 1);
  });

  test('one town gets a region around it, not a dot', () => {
    const view = fitMapView([KHARTOUM])!;
    expect(view.e - view.w).toBeGreaterThan(8);
    expect(mapPoint(view, 32.53, 15.55).x).toBeCloseTo(0.5, 1);
    expect(mapPoint(view, 32.53, 15.55).y).toBeCloseTo(0.5, 1);
  });

  test('north is up and east is right', () => {
    const view = fitMapView([KHARTOUM, LONDON])!;
    expect(mapPoint(view, -0.13, 51.51).y).toBeLessThan(mapPoint(view, 32.53, 15.55).y);
    expect(mapPoint(view, -0.13, 51.51).x).toBeLessThan(mapPoint(view, 32.53, 15.55).x);
    expect(inMapView(view, 31.24, 30.04)).toBe(true);
    expect(inMapView(view, 139.7, 35.7)).toBe(false);
  });

  test('nothing to frame, no view', () => {
    expect(fitMapView([])).toBeNull();
  });
});

describe('the map picture’s address', () => {
  const spec = { view: { w: 20, s: 3, e: 40, n: 24 }, shade: ['Sudan', 'South Sudan'], color: '#2F5873', route: [[32.53, 15.55], [31.24, 30.04]] as [number, number][] };

  test('carries everything the picture is drawn from, and reads back the same', () => {
    const src = mapImageSrc(spec);
    expect(src.startsWith('/api/lesson-planner-map.svg?')).toBe(true);
    expect(readMapSpec(new URL(src, 'http://x').searchParams)).toEqual(spec);
  });

  test('an address that is not a view is turned down', () => {
    expect(readMapSpec(new URLSearchParams('v=1,2,3'))).toBeNull();
    expect(readMapSpec(new URLSearchParams('v=40,3,20,24'))).toBeNull();
    expect(readMapSpec(new URLSearchParams('v=20,3,40,240'))).toBeNull();
    // A color that is not a color falls back to the house pine.
    expect(readMapSpec(new URLSearchParams('v=20,3,40,24&c=url(x)'))!.color).toBe('#1F3532');
  });
});
