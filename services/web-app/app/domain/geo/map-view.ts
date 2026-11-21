/**
 * The area a map slide shows, and where a place falls inside it (Nov 19).
 *
 * Pure, and shared by the server (which draws the countries and water as a
 * picture) and the browser (which lays the pins over that picture), so a pin
 * always sits on the town it names. A Mercator projection: shapes look the
 * way a classroom wall map shows them, which matters more here than area.
 */

/** West, south, east, north, in degrees. */
export type MapView = { w: number; s: number; e: number; n: number };

/** What the picture of a map is drawn from. */
export type MapSpec = {
  view: MapView;
  /** Countries filled in the deck color, by today's names. */
  shade: string[];
  /** The deck color, as #RRGGBB. */
  color: string;
  /** A journey: positions joined in order, as [lon, lat]. */
  route: [number, number][];
};

/** The map's box on a slide, in kit pixels: the left of a 1280 × 720 slide, edge to edge. */
export const MAP_BOX = { w: 820, h: 720 } as const;

const MAX_LAT = 82;
const clampLat = (lat: number) => Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
const mercator = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (clampLat(lat) * Math.PI) / 360));
const unmercator = (y: number) => ((2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180) / Math.PI;
const round = (value: number) => Math.round(value * 100) / 100;

/** A position inside the view, as fractions of its width and height from the top left. */
export function mapPoint(view: MapView, lon: number, lat: number): { x: number; y: number } {
  const top = mercator(view.n);
  const bottom = mercator(view.s);
  return { x: (lon - view.w) / (view.e - view.w), y: (top - mercator(lat)) / (top - bottom) };
}

/** Whether a position is inside the view. */
export function inMapView(view: MapView, lon: number, lat: number): boolean {
  const { x, y } = mapPoint(view, lon, lat);
  return x >= 0 && x <= 1 && y >= 0 && y <= 1;
}

/**
 * The view that frames these areas (a place is an area with no size) at the
 * map box's shape, with room around them. One town alone gets a region
 * around it, never a map zoomed to a dot.
 */
export function fitMapView(areas: MapView[], aspect: number = MAP_BOX.w / MAP_BOX.h, margin: number = 0.14): MapView | null {
  if (!areas.length) return null;
  let w = Math.min(...areas.map((area) => area.w));
  let e = Math.max(...areas.map((area) => area.e));
  let top = mercator(Math.max(...areas.map((area) => area.n)));
  let bottom = mercator(Math.min(...areas.map((area) => area.s)));
  const toDegrees = 180 / Math.PI;

  // One place gets a region around it (about 5 degrees across). Several get
  // as close as their spread asks, down to about a degree and a half (an
  // island and its shore: Long Island, demo pass Nov 21). Then a margin.
  const MIN_SPAN = areas.length > 1 ? 1.5 : 5;
  if (e - w < MIN_SPAN) {
    const middle = (w + e) / 2;
    w = middle - MIN_SPAN / 2;
    e = middle + MIN_SPAN / 2;
  }
  if ((top - bottom) * toDegrees < MIN_SPAN) {
    const middle = (top + bottom) / 2;
    top = middle + MIN_SPAN / 2 / toDegrees;
    bottom = middle - MIN_SPAN / 2 / toDegrees;
  }
  const padX = (e - w) * margin;
  const padY = (top - bottom) * margin;
  w -= padX;
  e += padX;
  top += padY;
  bottom -= padY;

  // The box's shape: widen whichever way is short.
  const width = (e - w) / toDegrees;
  const height = top - bottom;
  if (width / height > aspect) {
    const grow = (width / aspect - height) / 2;
    top += grow;
    bottom -= grow;
  } else {
    const grow = ((height * aspect - width) / 2) * toDegrees;
    w -= grow;
    e += grow;
  }
  const limit = mercator(MAX_LAT);
  if (top > limit) {
    bottom -= top - limit;
    top = limit;
  }
  if (bottom < -limit) {
    top = Math.min(limit, top + (-limit - bottom));
    bottom = -limit;
  }
  return { w: round(Math.max(-180, w)), s: round(unmercator(bottom)), e: round(Math.min(180, e)), n: round(unmercator(top)) };
}

/** A place as an area with no size, for `fitMapView`. */
export const pointArea = (lon: number, lat: number): MapView => ({ w: lon, e: lon, s: lat, n: lat });

/** The address of the map's picture: everything it is drawn from, so it can be cached for good. */
export function mapImageSrc(spec: MapSpec): string {
  const params = new URLSearchParams({ v: [spec.view.w, spec.view.s, spec.view.e, spec.view.n].join(',') });
  if (spec.shade.length) params.set('shade', spec.shade.join('|'));
  if (spec.route.length > 1) params.set('route', spec.route.map(([lon, lat]) => `${round(lon)},${round(lat)}`).join(';'));
  params.set('c', spec.color.replace('#', ''));
  return `/api/lesson-planner-map.svg?${params.toString()}`;
}

/** The same, read back from the address. Null when it is not a view. */
export function readMapSpec(params: URLSearchParams): MapSpec | null {
  const [w, s, e, n] = (params.get('v') ?? '').split(',').map(Number);
  if (![w, s, e, n].every((value) => Number.isFinite(value))) return null;
  if (!(w! < e!) || !(s! < n!) || w! < -180 || e! > 180 || s! < -90 || n! > 90) return null;
  const color = /^[0-9a-fA-F]{6}$/.test(params.get('c') ?? '') ? `#${params.get('c')}` : '#1F3532';
  const shade = (params.get('shade') ?? '').split('|').map((name) => name.trim()).filter(Boolean).slice(0, 4);
  const route = (params.get('route') ?? '')
    .split(';')
    .map((pair) => pair.split(',').map(Number) as [number, number])
    .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lat!) <= 90 && Math.abs(lon!) <= 180)
    .slice(0, 8);
  return { view: { w: w!, s: s!, e: e!, n: n! }, shade, color, route };
}
