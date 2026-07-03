// Curated public-domain artwork for class headers. Each (artwork, crop) pair
// has a stable composite key stored on Class.classArtKey.

import {
  classArtKeyFromLegacyPoolIndex,
  LEGACY_CLASS_ART_KEY_BY_POOL_INDEX,
} from './class-art-legacy-pool-keys';

export type ClassArtLibraryEntry = {
  src: string;
  credit: string;
  positions: readonly string[];
};

export type ClassArtEntry = ClassArtLibraryEntry & {
  key: string;
};

export type ClassArtSelection = {
  key: string;
  artworkKey: string;
  src: string;
  credit: string;
  backgroundPosition: string;
};

const CLASS_ART_LIBRARY_RAW: readonly ClassArtLibraryEntry[] = [
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
  {
    src: '/img/class-art/monet-water-lilies.jpg',
    credit: 'Claude Monet — Water Lilies, public domain',
    positions: ['center 0%', 'center 50%', 'center 100%'],
  },
  {
    src: '/img/class-art/monet-impression-sunrise.jpg',
    credit: 'Claude Monet — Impression, Sunrise, public domain',
    positions: ['center 0%', 'center 50%', 'center 100%'],
  },
  {
    src: '/img/class-art/monet-japanese-bridge.jpg',
    credit: 'Claude Monet — The Japanese Footbridge, public domain',
    positions: ['center 0%', 'center 50%', 'center 100%'],
  },
  {
    src: '/img/class-art/van-gogh-starry-night.jpg',
    credit: 'Vincent van Gogh — The Starry Night, public domain',
    positions: ['center 0%', 'center 50%', 'center 100%'],
  },
  {
    src: '/img/class-art/van-gogh-irises.jpg',
    credit: 'Vincent van Gogh — Irises, public domain',
    positions: ['center 0%', 'center 50%', 'center 100%'],
  },
  {
    src: '/img/class-art/hiroshige-sudden-shower.jpg',
    credit:
      'Utagawa Hiroshige — Sudden Shower over Shin-Ōhashi Bridge and Atake, public domain',
    positions: ['center 10%', 'center 40%', 'center 85%'],
  },
  {
    src: '/img/class-art/hiroshige-plum-garden.jpg',
    credit: 'Utagawa Hiroshige — Plum Garden at Kameido, public domain',
    positions: ['center 10%', 'center 40%', 'center 85%'],
  },
  {
    src: '/img/class-art/hiroshige-whirlpool.jpg',
    credit: 'Utagawa Hiroshige — Naruto Whirlpools, public domain',
    positions: ['center 10%', 'center 40%', 'center 85%'],
  },
  {
    src: '/img/class-art/hiroshige-tago-bay.jpg',
    credit: 'Utagawa Hiroshige — Tago Bay near Ejiri, public domain',
    positions: ['center 10%', 'center 40%', 'center 85%'],
  },
  {
    src: '/img/class-art/hokusai-chrysanthemums.jpg',
    credit:
      'Katsushika Hokusai — Sparrows and Chrysanthemums, public domain',
    positions: ['center 0%', 'center 50%', 'center 100%'],
  },
  {
    src: '/img/class-art/hokusai-moon-beneath-fuji.jpg',
    credit: 'Katsushika Hokusai — Mount Fuji from the Sea, public domain',
    positions: ['center 0%', 'center 50%', 'center 100%'],
  },
  {
    src: '/img/class-art/hokusai-kirifuri-falls.jpg',
    credit: 'Katsushika Hokusai — Kirifuri Waterfall, public domain',
    positions: ['center 10%', 'center 40%', 'center 85%'],
  },
  {
    src: '/img/class-art/ohara-koson-cranes.jpg',
    credit: 'Ohara Koson — Two White Cranes, public domain',
    positions: ['center 10%', 'center 40%', 'center 85%'],
  },
  {
    src: '/img/class-art/ohara-koson-kingfisher.jpg',
    credit: 'Ohara Koson — Kingfisher on a Branch, public domain',
    positions: ['center 10%', 'center 40%', 'center 85%'],
  },
  {
    src: '/img/class-art/ohara-koson-carp.jpg',
    credit: 'Ohara Koson — Carp, public domain',
    positions: ['center 10%', 'center 40%', 'center 85%'],
  },
  {
    src: '/img/class-art/cezanne-mont-sainte-victoire.jpg',
    credit: 'Paul Cézanne — Mont Sainte-Victoire, public domain',
    positions: ['center 0%', 'center 50%', 'center 100%'],
  },
  {
    src: '/img/class-art/franz-marc-blue-horse.jpg',
    credit: 'Franz Marc — Blue Horse I, public domain',
    positions: ['center 10%', 'center 40%', 'center 85%'],
  },
  {
    src: '/img/class-art/paul-klee-senecio.jpg',
    credit: 'Paul Klee — Senecio, public domain',
    positions: ['center 10%', 'center 40%', 'center 85%'],
  },
  {
    src: '/img/class-art/paul-klee-castle-and-sun.jpg',
    credit: 'Paul Klee — Castle and Sun, public domain',
    positions: ['center 10%', 'center 40%', 'center 85%'],
  },
  {
    src: '/img/class-art/kandinsky-composition-viii.jpg',
    credit: 'Wassily Kandinsky — Composition VIII, public domain',
    positions: ['center 0%', 'center 50%', 'center 100%'],
  },
  {
    src: '/img/class-art/mondrian-composition-red-blue-yellow.jpg',
    credit:
      'Piet Mondrian — Composition with Red, Blue and Yellow, public domain',
    positions: ['center 0%', 'center 50%', 'center 100%'],
  },
  {
    src: '/img/class-art/turner-fighting-temeraire.jpg',
    credit: 'J. M. W. Turner — The Fighting Temeraire, public domain',
    positions: ['center 0%', 'center 50%', 'center 100%'],
  },
  {
    src: '/img/class-art/constable-hay-wain.jpg',
    credit: 'John Constable — The Hay Wain, public domain',
    positions: ['center 0%', 'center 50%', 'center 100%'],
  },
  {
    src: '/img/class-art/bierstadt-yosemite-valley.jpg',
    credit: 'Albert Bierstadt — Yosemite Valley, public domain',
    positions: ['center 0%', 'center 50%', 'center 100%'],
  },
  {
    src: '/img/class-art/cole-the-oxbow.jpg',
    credit: 'Thomas Cole — The Oxbow, public domain',
    positions: ['center 0%', 'center 50%', 'center 100%'],
  },
  {
    src: '/img/class-art/homer-breezing-up.jpg',
    credit: 'Winslow Homer — Breezing Up, public domain',
    positions: ['center 0%', 'center 50%', 'center 100%'],
  },
  {
    src: '/img/class-art/el-greco-view-of-toledo.jpg',
    credit: 'El Greco — View of Toledo, public domain',
    positions: ['center 0%', 'center 50%', 'center 100%'],
  },
  {
    src: '/img/class-art/canaletto-venice-grand-canal.jpg',
    credit: 'Canaletto — The Grand Canal in Venice, public domain',
    positions: ['center 0%', 'center 50%', 'center 100%'],
  },
  {
    src: '/img/class-art/bonnard-dining-room.jpg',
    credit: 'Pierre Bonnard — The Dining Room in the Country, public domain',
    positions: ['center 0%', 'center 50%', 'center 100%'],
  },
  {
    src: '/img/class-art/redon-ophelia-flowers.jpg',
    credit: 'Odilon Redon — Ophelia among the Flowers, public domain',
    positions: ['center 0%', 'center 50%', 'center 100%'],
  },
  {
    src: '/img/class-art/rousseau-exotic-landscape.jpg',
    credit: 'Henri Rousseau — Exotic Landscape, public domain',
    positions: ['center 0%', 'center 50%', 'center 100%'],
  },
  {
    src: '/img/class-art/munch-the-scream.jpg',
    credit: 'Edvard Munch — The Scream, public domain',
    positions: ['center 10%', 'center 40%', 'center 85%'],
  },
  {
    src: '/img/class-art/seurat-sunday-afternoon.jpg',
    credit:
      'Georges Seurat — A Sunday Afternoon on the Island of La Grande Jatte, public domain',
    positions: ['center 0%', 'center 50%', 'center 100%'],
  },
  {
    src: '/img/class-art/georges-seurat-the-channel.jpg',
    credit:
      'Georges Seurat — The Channel of Gravelines, Petit Fort Philippe, public domain',
    positions: ['center 0%', 'center 50%', 'center 100%'],
  },
  {
    src: '/img/class-art/degas-dancers.jpg',
    credit: 'Edgar Degas — The Dance Class, public domain',
    positions: ['center 10%', 'center 40%', 'center 85%'],
  },
] as const;

export function artworkKeyFromSrc(src: string): string {
  return src.replace(/^\/img\/class-art\//, '').replace(/\.jpg$/, '');
}

export function slugifyClassArtCropPosition(position: string): string {
  return position.trim().toLowerCase().replace(/\s+/g, '-').replace(/%/g, 'pct');
}

export function buildClassArtKey(
  artworkKey: string,
  backgroundPosition: string
): string {
  return `${artworkKey}::${slugifyClassArtCropPosition(backgroundPosition)}`;
}

export const CLASS_ART_LIBRARY: readonly ClassArtEntry[] =
  CLASS_ART_LIBRARY_RAW.map((entry) => ({
    ...entry,
    key: artworkKeyFromSrc(entry.src),
  }));

export const CLASS_ART_POOL: readonly ClassArtSelection[] =
  CLASS_ART_LIBRARY.flatMap((entry) =>
    entry.positions.map((backgroundPosition) => ({
      key: buildClassArtKey(entry.key, backgroundPosition),
      artworkKey: entry.key,
      src: entry.src,
      credit: entry.credit,
      backgroundPosition,
    }))
  );

export const CLASS_ART_POOL_SIZE = CLASS_ART_POOL.length;
export const CLASS_ARTWORK_COUNT = CLASS_ART_LIBRARY.length;
export const CLASS_ART_KEYS = CLASS_ART_POOL.map((entry) => entry.key);

const CLASS_ART_BY_KEY = new Map(
  CLASS_ART_POOL.map((entry) => [entry.key, entry])
);

export function formatClassArtCredit(credit: string): string {
  return credit.replace(/, public domain$/i, '');
}

export function getClassArtByKey(key: string): ClassArtSelection | null {
  return CLASS_ART_BY_KEY.get(key) ?? null;
}

function poolOffsetForArtwork(artworkIndex: number): number {
  let offset = 0;
  for (let i = 0; i < artworkIndex; i++) {
    offset += CLASS_ART_LIBRARY[i].positions.length;
  }
  return offset;
}

/** Maps a library artwork index and crop index to a flat pool index. */
export function buildClassArtPoolIndex(
  artworkIndex: number,
  cropIndex: number
): number {
  const normalizedArtwork =
    ((artworkIndex % CLASS_ARTWORK_COUNT) + CLASS_ARTWORK_COUNT) %
    CLASS_ARTWORK_COUNT;
  const positions = CLASS_ART_LIBRARY[normalizedArtwork].positions.length;
  const normalizedCrop =
    ((cropIndex % positions) + positions) % positions;
  return poolOffsetForArtwork(normalizedArtwork) + normalizedCrop;
}

export function getArtworkIndexFromPoolIndex(poolIndex: number): number {
  const normalized =
    ((poolIndex % CLASS_ART_POOL_SIZE) + CLASS_ART_POOL_SIZE) %
    CLASS_ART_POOL_SIZE;
  let cursor = 0;
  for (let i = 0; i < CLASS_ART_LIBRARY.length; i++) {
    const span = CLASS_ART_LIBRARY[i].positions.length;
    if (normalized < cursor + span) return i;
    cursor += span;
  }
  return CLASS_ART_LIBRARY.length - 1;
}

export function getCropIndexFromPoolIndex(poolIndex: number): number {
  const normalized =
    ((poolIndex % CLASS_ART_POOL_SIZE) + CLASS_ART_POOL_SIZE) %
    CLASS_ART_POOL_SIZE;
  let cursor = 0;
  for (let i = 0; i < CLASS_ART_LIBRARY.length; i++) {
    const span = CLASS_ART_LIBRARY[i].positions.length;
    if (normalized < cursor + span) return normalized - cursor;
    cursor += span;
  }
  return 0;
}

/** Looks up a pool entry by legacy flat index, wrapping out-of-range values. */
export function getClassArtByIndex(index: number): ClassArtSelection {
  const normalized =
    ((index % CLASS_ART_POOL_SIZE) + CLASS_ART_POOL_SIZE) % CLASS_ART_POOL_SIZE;
  return CLASS_ART_POOL[normalized];
}

function hashSeed(seed: string): number {
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
 * Deterministic fallback for classes without a persisted classArtKey.
 * Same seed always yields the same stable key.
 */
export function generateClassArt(seed: string): ClassArtSelection {
  const rng = mulberry32(hashSeed(seed));
  return CLASS_ART_POOL[Math.floor(rng() * CLASS_ART_POOL.length)];
}

export function resolveClassArtSelection({
  classArtKey,
  legacyClassArtIndex,
  seed,
}: {
  classArtKey?: string | null;
  legacyClassArtIndex?: number | null;
  seed: string;
}): ClassArtSelection {
  if (classArtKey) {
    const art = getClassArtByKey(classArtKey);
    if (art) return art;
  }

  if (legacyClassArtIndex != null) {
    const legacyKey = classArtKeyFromLegacyPoolIndex(legacyClassArtIndex);
    if (legacyKey) {
      const art = getClassArtByKey(legacyKey);
      if (art) return art;
    }
    return getClassArtByIndex(legacyClassArtIndex);
  }

  return generateClassArt(seed);
}

function artworkCropSlotKey(artworkIndex: number, cropIndex: number): string {
  return `${artworkIndex}:${cropIndex}`;
}

function artworkCropSlotFromKey(key: string): string | null {
  const art = getClassArtByKey(key);
  if (!art) return null;

  const artworkIndex = CLASS_ART_LIBRARY.findIndex(
    (entry) => entry.key === art.artworkKey
  );
  if (artworkIndex < 0) return null;

  const cropIndex = CLASS_ART_LIBRARY[artworkIndex].positions.indexOf(
    art.backgroundPosition
  );
  if (cropIndex < 0) return null;

  return artworkCropSlotKey(artworkIndex, cropIndex);
}

/**
 * Picks the next stable key for an organization. Each crop pass assigns every
 * artwork once before any artwork gets the next crop.
 */
export function pickNextClassArtKeyForOrganization(
  assignedKeys: readonly string[],
  random: () => number = Math.random
): string {
  const assigned = new Set<string>();
  for (const key of assignedKeys) {
    const slot = artworkCropSlotFromKey(key);
    if (slot) assigned.add(slot);
  }

  const maxCrops = Math.max(
    ...CLASS_ART_LIBRARY.map((entry) => entry.positions.length)
  );

  for (let crop = 0; crop < maxCrops; crop++) {
    const availableArtworks: number[] = [];
    for (let artwork = 0; artwork < CLASS_ARTWORK_COUNT; artwork++) {
      if (!assigned.has(artworkCropSlotKey(artwork, crop))) {
        availableArtworks.push(artwork);
      }
    }
    if (availableArtworks.length > 0) {
      const artwork =
        availableArtworks[Math.floor(random() * availableArtworks.length)];
      return getClassArtByIndex(buildClassArtPoolIndex(artwork, crop)).key;
    }
  }

  const artwork = Math.floor(random() * CLASS_ARTWORK_COUNT);
  return getClassArtByIndex(buildClassArtPoolIndex(artwork, 0)).key;
}

/** @deprecated Use pickNextClassArtKeyForOrganization */
export function pickNextClassArtIndexForOrganization(
  assignedPoolIndices: readonly number[],
  random: () => number = Math.random
): number {
  const assignedKeys = assignedPoolIndices.map(
    (index) => getClassArtByIndex(index).key
  );
  const nextKey = pickNextClassArtKeyForOrganization(assignedKeys, random);
  const art = getClassArtByKey(nextKey);
  if (!art) return 0;
  return CLASS_ART_POOL.findIndex((entry) => entry.key === art.key);
}

export { classArtKeyFromLegacyPoolIndex, LEGACY_CLASS_ART_KEY_BY_POOL_INDEX };
