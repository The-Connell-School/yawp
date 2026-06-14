// Curated public-domain artwork for class headers (TeacherClassCard's art
// band and the class detail header strip). Each (artwork, crop) combination
// is one entry in CLASS_ART_POOL, addressed by index via Class.classArtIndex.

export type ClassArtEntry = {
  src: string;
  credit: string;
  positions: readonly string[];
};

export const CLASS_ART_LIBRARY: readonly ClassArtEntry[] = [
  {
    src: '/img/class-art/hokusai-red-fuji.jpg',
    credit:
      'Katsushika Hokusai — Fine Wind, Clear Morning ("Red Fuji"), public domain',
    positions: ['center 10%', 'center 55%', 'center 95%'],
  },
  {
    src: '/img/class-art/hokusai-great-wave.jpg',
    credit: 'Katsushika Hokusai — The Great Wave off Kanagawa, public domain',
    positions: ['center 0%', 'center 50%', 'center 100%'],
  },
  {
    src: '/img/class-art/van-gogh-wheat-field-cypresses.jpg',
    credit: 'Vincent van Gogh — Wheat Field with Cypresses, public domain',
    positions: ['center 0%', 'center 50%', 'center 100%'],
  },
  {
    src: '/img/class-art/af-klint-ten-largest-youth.jpg',
    credit: 'Hilma af Klint — The Ten Largest, No. 3, Youth, public domain',
    positions: ['center 10%', 'center 40%', 'center 85%'],
  },
  {
    src: '/img/class-art/morris-strawberry-thief.jpg',
    credit: 'William Morris — Strawberry Thief, public domain',
    positions: ['center 0%', 'center 50%', 'center 100%'],
  },
] as const;

export type ClassArtSelection = {
  src: string;
  credit: string;
  backgroundPosition: string;
};

export const CLASS_ART_POOL: readonly ClassArtSelection[] = CLASS_ART_LIBRARY.flatMap(
  (entry) =>
    entry.positions.map((backgroundPosition) => ({
      src: entry.src,
      credit: entry.credit,
      backgroundPosition,
    }))
);

export const CLASS_ART_POOL_SIZE = CLASS_ART_POOL.length;

/** Looks up a pool entry by index, wrapping out-of-range values into bounds. */
export function getClassArtByIndex(index: number): ClassArtSelection {
  const normalized =
    ((index % CLASS_ART_POOL_SIZE) + CLASS_ART_POOL_SIZE) % CLASS_ART_POOL_SIZE;
  return CLASS_ART_POOL[normalized];
}

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

/**
 * Deterministic fallback for classes without a persisted classArtIndex
 * (un-backfilled rows, e2e fixtures). Same seed always yields the same
 * artwork and crop.
 */
export function generateClassArt(seed: string): ClassArtSelection {
  const rng = mulberry32(hashSeed(seed));
  return getClassArtByIndex(Math.floor(rng() * CLASS_ART_POOL_SIZE));
}

/**
 * Picks the next pool index for a teacher, avoiding `recentIndices` so a
 * teacher rotates through every combination before any repeats. Falls back
 * to the full pool once every index has been recently used.
 */
export function pickNextClassArtIndex(
  recentIndices: readonly number[],
  random: () => number = Math.random
): number {
  const excluded = new Set(recentIndices);
  const available: number[] = [];
  for (let i = 0; i < CLASS_ART_POOL_SIZE; i++) {
    if (!excluded.has(i)) available.push(i);
  }
  const candidates =
    available.length > 0
      ? available
      : Array.from({ length: CLASS_ART_POOL_SIZE }, (_, i) => i);
  return candidates[Math.floor(random() * candidates.length)];
}
