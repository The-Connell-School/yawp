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

export const CLASS_ARTWORK_COUNT = CLASS_ART_LIBRARY.length;

export function formatClassArtCredit(credit: string): string {
  return credit.replace(/, public domain$/i, '');
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
 * Picks the next pool index for an organization. Each crop pass assigns every
 * artwork once before any artwork gets the next crop.
 */
export function pickNextClassArtIndexForOrganization(
  assignedPoolIndices: readonly number[],
  random: () => number = Math.random
): number {
  const assigned = new Set<string>();
  for (const poolIndex of assignedPoolIndices) {
    assigned.add(
      `${getArtworkIndexFromPoolIndex(poolIndex)}:${getCropIndexFromPoolIndex(poolIndex)}`
    );
  }

  const maxCrops = Math.max(
    ...CLASS_ART_LIBRARY.map((entry) => entry.positions.length)
  );

  for (let crop = 0; crop < maxCrops; crop++) {
    const availableArtworks: number[] = [];
    for (let artwork = 0; artwork < CLASS_ARTWORK_COUNT; artwork++) {
      if (!assigned.has(`${artwork}:${crop}`)) {
        availableArtworks.push(artwork);
      }
    }
    if (availableArtworks.length > 0) {
      const artwork =
        availableArtworks[Math.floor(random() * availableArtworks.length)];
      return buildClassArtPoolIndex(artwork, crop);
    }
  }

  const artwork = Math.floor(random() * CLASS_ARTWORK_COUNT);
  return buildClassArtPoolIndex(artwork, 0);
}
