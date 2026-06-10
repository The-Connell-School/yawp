// Deterministic, code-generated class artwork in the Yawp palette.
// Same seed (class id) always yields the same sparse, plotter-style spec.

export const CLASS_ART_WIDTH = 320;
export const CLASS_ART_HEIGHT = 128;

export const CLASS_ART_PALETTE = {
  paper: '#FAFAF9',
  orange: '#D27050',
  orangeDeep: '#9A3F23',
  charcoal: '#262626',
  slate: '#404040',
  neutral: '#A8A29E',
  neutralLight: '#D6D3D1',
  neutralFaint: '#E7E5E4',
} as const;

export type ClassArtMotif =
  | 'grid-blocks'
  | 'ruled-lines'
  | 'glyph-field'
  | 'contour';

export type ClassArtRect = {
  kind: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
};

export type ClassArtLine = {
  kind: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: string;
  strokeWidth: number;
};

export type ClassArtGlyph = {
  kind: 'glyph';
  x: number;
  y: number;
  text: string;
  fill: string;
  fontSize: number;
};

export type ClassArtPolyline = {
  kind: 'polyline';
  points: Array<[number, number]>;
  stroke: string;
  strokeWidth: number;
};

export type ClassArtElement =
  | ClassArtRect
  | ClassArtLine
  | ClassArtGlyph
  | ClassArtPolyline;

export type ClassArtSpec = {
  motif: ClassArtMotif;
  background: string;
  elements: ClassArtElement[];
};

function hashSeed(seed: string): number {
  // FNV-1a 32-bit
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

// Weighted mark color: mostly quiet neutrals, occasional charcoal, rare orange.
function markColor(rng: () => number): string {
  const roll = rng();
  if (roll < 0.5) return CLASS_ART_PALETTE.neutralLight;
  if (roll < 0.7) return CLASS_ART_PALETTE.neutral;
  if (roll < 0.85) return CLASS_ART_PALETTE.charcoal;
  if (roll < 0.95) return CLASS_ART_PALETTE.orange;
  return CLASS_ART_PALETTE.orangeDeep;
}

function gridBlocks(rng: () => number): ClassArtElement[] {
  const elements: ClassArtElement[] = [];
  const cell = 20;
  const cols = CLASS_ART_WIDTH / cell;
  const rows = Math.floor(CLASS_ART_HEIGHT / cell);
  const inset = 4 + Math.floor(rng() * 3);
  const size = cell - inset * 2;

  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      if (rng() > 0.16) continue;
      elements.push({
        kind: 'rect',
        x: col * cell + inset,
        y: row * cell + inset + 4,
        width: size,
        height: size,
        fill: markColor(rng),
      });
    }
  }

  const baselineY = (1 + Math.floor(rng() * (rows - 1))) * cell + 4;
  elements.push({
    kind: 'line',
    x1: 0,
    y1: baselineY,
    x2: CLASS_ART_WIDTH,
    y2: baselineY,
    stroke: CLASS_ART_PALETTE.neutralFaint,
    strokeWidth: 1,
  });

  return elements;
}

function ruledLines(rng: () => number): ClassArtElement[] {
  const elements: ClassArtElement[] = [];
  for (let y = 16; y < CLASS_ART_HEIGHT; y += 16) {
    elements.push({
      kind: 'line',
      x1: 0,
      y1: y,
      x2: CLASS_ART_WIDTH,
      y2: y,
      stroke: CLASS_ART_PALETTE.neutralFaint,
      strokeWidth: 1,
    });
  }

  const strokes = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < strokes; i++) {
    const x1 = round(rng() * (CLASS_ART_WIDTH - 80));
    const y1 = round(12 + rng() * (CLASS_ART_HEIGHT - 24));
    const length = round(40 + rng() * 120);
    const rise = round((rng() - 0.5) * 48);
    elements.push({
      kind: 'line',
      x1,
      y1,
      x2: round(Math.min(x1 + length, CLASS_ART_WIDTH)),
      y2: round(Math.min(Math.max(y1 + rise, 6), CLASS_ART_HEIGHT - 6)),
      stroke: i === 0 ? CLASS_ART_PALETTE.orange : markColor(rng),
      strokeWidth: rng() < 0.3 ? 2 : 1.5,
    });
  }

  return elements;
}

const GLYPHS = ['+', '×', '·', '—'] as const;

function glyphField(rng: () => number): ClassArtElement[] {
  const elements: ClassArtElement[] = [];
  const cell = 24;
  const cols = Math.floor(CLASS_ART_WIDTH / cell);
  const rows = Math.floor(CLASS_ART_HEIGHT / cell);

  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      if (rng() > 0.22) continue;
      elements.push({
        kind: 'glyph',
        x: col * cell + cell / 2 + 4,
        y: row * cell + cell / 2 + 10,
        text: pick(rng, GLYPHS),
        fill: markColor(rng),
        fontSize: 10,
      });
    }
  }

  return elements;
}

function contour(rng: () => number): ClassArtElement[] {
  const elements: ClassArtElement[] = [];
  const traces = 3 + Math.floor(rng() * 2);
  const orangeTrace = Math.floor(rng() * traces);

  for (let i = 0; i < traces; i++) {
    const points: Array<[number, number]> = [];
    let y = 16 + rng() * (CLASS_ART_HEIGHT - 32);
    for (let x = 0; x <= CLASS_ART_WIDTH; x += 16) {
      y = Math.min(Math.max(y + (rng() - 0.5) * 20, 8), CLASS_ART_HEIGHT - 8);
      points.push([x, round(y)]);
    }
    elements.push({
      kind: 'polyline',
      points,
      stroke:
        i === orangeTrace
          ? CLASS_ART_PALETTE.orange
          : pick(rng, [
              CLASS_ART_PALETTE.neutral,
              CLASS_ART_PALETTE.neutralLight,
              CLASS_ART_PALETTE.slate,
            ]),
      strokeWidth: i === orangeTrace ? 1.5 : 1,
    });
  }

  return elements;
}

const MOTIFS: ClassArtMotif[] = [
  'grid-blocks',
  'ruled-lines',
  'glyph-field',
  'contour',
];

export function generateClassArt(seed: string): ClassArtSpec {
  const rng = mulberry32(hashSeed(seed));
  const motif = MOTIFS[Math.floor(rng() * MOTIFS.length)];

  const elements =
    motif === 'grid-blocks'
      ? gridBlocks(rng)
      : motif === 'ruled-lines'
        ? ruledLines(rng)
        : motif === 'glyph-field'
          ? glyphField(rng)
          : contour(rng);

  return {
    motif,
    background: CLASS_ART_PALETTE.paper,
    elements,
  };
}
