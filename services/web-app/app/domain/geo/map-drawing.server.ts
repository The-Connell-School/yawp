/**
 * The picture of a map (Nov 19): the countries, water and route inside a
 * view, as paths, drawn once for every renderer. Present and the studio show
 * it as an SVG image; the PDF draws the same paths. The pins and their names
 * are not here: they are the slide's own boxes, laid over this.
 */
import { countryShapes, lakeShapes, riverShapes } from './geo-data.server';
import { MAP_BOX, mapPoint, type MapSpec, type MapView } from './map-view';
import { findCountry } from './places.server';
import type { GeoShape } from './topojson';

/** Quiet, on the kit's cream: the land is paper, the sea a pale slate. */
export const MAP_COLORS = { sea: '#DCE4E6', land: '#F7F4EC', border: '#B9B3A4', water: '#9FB8C4', route: '#1B1B1B' } as const;

export type MapLayer = {
  /** SVG path data, in the drawing's own pixels. */
  d: string;
  fill?: string;
  stroke?: string;
  width?: number;
  /** Dash and gap, for a route. */
  dash?: [number, number];
  /** Even-odd, so a lake in a country is a hole in it. */
  evenOdd?: boolean;
};

export type MapDrawing = { width: number; height: number; background: string; layers: MapLayer[] };

/** A deck color mixed into the land: a solid tint, never transparency. */
function tint(color: string, amount: number): string {
  const channel = (hex: string, at: number) => parseInt(hex.slice(at, at + 2), 16);
  const mix = (at: number) => Math.round(channel(MAP_COLORS.land, at) + (channel(color, at) - channel(MAP_COLORS.land, at)) * amount);
  return `#${[1, 3, 5].map((at) => mix(at).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

const overlaps = (shape: GeoShape, view: MapView) => shape.box[0] <= view.e && shape.box[2] >= view.w && shape.box[1] <= view.n && shape.box[3] >= view.s;

/** One shape's parts as path data: points to a tenth of a pixel, and none closer than half a pixel to the last. */
function pathOf(shape: GeoShape, view: MapView, width: number, height: number): string {
  let d = '';
  // Room around the view, so a coast that leaves the picture closes out of sight.
  const margin = 0.5;
  for (const part of shape.parts) {
    let last: [number, number] | null = null;
    let drawn = 0;
    let piece = '';
    // A coast that crosses the 180th meridian jumps from -180 to 180 in one
    // step; kept continuous, it runs off the edge instead of drawing a line
    // across the map (Russia's far east over Europe, demo pass Nov 20).
    let offset = 0;
    let previous: number | null = null;
    for (const [rawLon, lat] of part) {
      if (previous !== null) {
        if (rawLon + offset - previous > 180) offset -= 360;
        else if (rawLon + offset - previous < -180) offset += 360;
      }
      const lon = rawLon + offset;
      previous = lon;
      const point = mapPoint(view, lon, lat);
      const x = Math.max(-margin, Math.min(1 + margin, point.x)) * width;
      const y = Math.max(-margin, Math.min(1 + margin, point.y)) * height;
      if (last && Math.abs(x - last[0]) < 0.5 && Math.abs(y - last[1]) < 0.5) continue;
      piece += `${last ? 'L' : 'M'}${Math.round(x * 10) / 10} ${Math.round(y * 10) / 10}`;
      last = [x, y];
      drawn += 1;
    }
    if (drawn < 2 || (shape.kind === 'area' && drawn < 3)) continue;
    d += shape.kind === 'area' ? `${piece}Z` : piece;
  }
  return d;
}

/** The map as layers, back to front: land, shaded countries, lakes, rivers, the route. */
export function buildMapDrawing(spec: MapSpec, size: { w: number; h: number } = MAP_BOX): MapDrawing {
  const { view } = spec;
  // Across continents the coarse shapes are plenty, and a seventh the size.
  const countries = countryShapes(view.e - view.w > 70 ? '110m' : '50m').filter((shape) => overlaps(shape, view));
  const shaded = new Set(spec.shade.map((name) => findCountry(name)?.shape).filter(Boolean));
  const join = (shapes: GeoShape[]) => shapes.map((shape) => pathOf(shape, view, size.w, size.h)).join('');

  const layers: MapLayer[] = [];
  const land = join(countries.filter((shape) => !shaded.has(shape.name ?? '')));
  if (land) layers.push({ d: land, fill: MAP_COLORS.land, stroke: MAP_COLORS.border, width: 0.8, evenOdd: true });
  const marked = join(countries.filter((shape) => shaded.has(shape.name ?? '')));
  if (marked) layers.push({ d: marked, fill: tint(spec.color, 0.34), stroke: spec.color, width: 1.2, evenOdd: true });
  const lakes = join(lakeShapes().filter((shape) => overlaps(shape, view)));
  if (lakes) layers.push({ d: lakes, fill: MAP_COLORS.sea, stroke: MAP_COLORS.water, width: 0.6, evenOdd: true });
  const rivers = join(riverShapes().filter((shape) => overlaps(shape, view)));
  if (rivers) layers.push({ d: rivers, stroke: MAP_COLORS.water, width: 1.4 });
  if (spec.route.length > 1) {
    const d = spec.route
      .map(([lon, lat], i) => {
        const point = mapPoint(view, lon, lat);
        return `${i ? 'L' : 'M'}${Math.round(point.x * size.w * 10) / 10} ${Math.round(point.y * size.h * 10) / 10}`;
      })
      .join('');
    layers.push({ d, stroke: MAP_COLORS.route, width: 2.5, dash: [7, 6] });
  }
  return { width: size.w, height: size.h, background: MAP_COLORS.sea, layers };
}

/** The drawing as an SVG image. */
export function mapSvg(spec: MapSpec, size: { w: number; h: number } = MAP_BOX): string {
  const drawing = buildMapDrawing(spec, size);
  const paths = drawing.layers
    .map(
      (layer) =>
        `<path d="${layer.d}" fill="${layer.fill ?? 'none'}"${layer.evenOdd ? ' fill-rule="evenodd"' : ''}${
          layer.stroke ? ` stroke="${layer.stroke}" stroke-width="${layer.width ?? 1}" stroke-linejoin="round" stroke-linecap="round"` : ''
        }${layer.dash ? ` stroke-dasharray="${layer.dash.join(' ')}"` : ''}/>`
    )
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${drawing.width} ${drawing.height}" width="${drawing.width}" height="${drawing.height}" preserveAspectRatio="none"><rect width="100%" height="100%" fill="${drawing.background}"/>${paths}</svg>`;
}
