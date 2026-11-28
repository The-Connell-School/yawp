/**
 * Reading TopoJSON (Nov 19): the format the bundled Natural Earth shapes are
 * kept in, because it is a fifth the size of the same shapes written out.
 * Arcs are shared lines, stored as steps from one point to the next on a
 * grid; a shape is a list of arcs, some walked backwards. That is all this
 * decodes: enough for countries, lakes and rivers, with no package.
 */

export type Topology = {
  transform?: { scale: [number, number]; translate: [number, number] };
  arcs: number[][][];
  objects: Record<string, { geometries: TopoGeometry[] }>;
};

type TopoGeometry = { type: string; id?: string | number; properties?: { name?: string }; arcs?: unknown };

/** A position, as [longitude, latitude]. */
export type Position = [number, number];

export type GeoShape = {
  id: string | null;
  name: string | null;
  /** An area's rings (outer edges and holes alike), or a line's stretches. */
  kind: 'area' | 'line';
  parts: Position[][];
  /** West, south, east, north. */
  box: [number, number, number, number];
};

function decodeArcs(topology: Topology): Position[][] {
  const [sx, sy] = topology.transform?.scale ?? [1, 1];
  const [tx, ty] = topology.transform?.translate ?? [0, 0];
  return topology.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map(([dx, dy]) => {
      // Without a transform the points are positions already, not steps.
      x = topology.transform ? x + dx! : dx!;
      y = topology.transform ? y + dy! : dy!;
      return [x * sx + tx, y * sy + ty] as Position;
    });
  });
}

/** A run of arcs as one line: each arc forwards or (a negative index) backwards, joined end to start. */
function stitch(arcs: Position[][], indexes: number[]): Position[] {
  const line: Position[] = [];
  for (const index of indexes) {
    const arc = index < 0 ? [...arcs[~index]!].reverse() : arcs[index]!;
    line.push(...(line.length ? arc.slice(1) : arc));
  }
  return line;
}

/** Every shape of one object in the file, with its name and the box it fits in. */
export function topoShapes(topology: Topology, object: string): GeoShape[] {
  const arcs = decodeArcs(topology);
  const shapes: GeoShape[] = [];
  for (const geometry of topology.objects[object]?.geometries ?? []) {
    let parts: Position[][];
    let kind: GeoShape['kind'] = 'area';
    switch (geometry.type) {
      case 'Polygon':
        parts = (geometry.arcs as number[][]).map((ring) => stitch(arcs, ring));
        break;
      case 'MultiPolygon':
        parts = (geometry.arcs as number[][][]).flatMap((polygon) => polygon.map((ring) => stitch(arcs, ring)));
        break;
      case 'LineString':
        kind = 'line';
        parts = [stitch(arcs, geometry.arcs as number[])];
        break;
      case 'MultiLineString':
        kind = 'line';
        parts = (geometry.arcs as number[][]).map((line) => stitch(arcs, line));
        break;
      default:
        continue;
    }
    parts = parts.filter((part) => part.length > 1);
    if (!parts.length) continue;
    const box: GeoShape['box'] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const part of parts) {
      for (const [lon, lat] of part) {
        if (lon < box[0]) box[0] = lon;
        if (lat < box[1]) box[1] = lat;
        if (lon > box[2]) box[2] = lon;
        if (lat > box[3]) box[3] = lat;
      }
    }
    shapes.push({ id: geometry.id === undefined ? null : String(geometry.id), name: geometry.properties?.name ?? null, kind, parts, box });
  }
  return shapes;
}
