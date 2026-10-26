/**
 * The gallery deck's art library (Yawp! Lesson Deck Kit, spec v3, "Choosing
 * the art"): a tagged library, not live search at class time. Each work is
 * stored once with its themes, its rights, a focal point for cropping, its
 * pre-sampled deck colors and a wall label. One work per lesson, never text
 * on the art, always credited.
 *
 * Only works whose image ships with the app are listed, so the planner never
 * names a painting a slide cannot hang. Each image is pre-cropped to the
 * boxes that crop it (the swatch, the big-idea strip, the divider), cover-fit
 * from its focal point; the title plate, the Look slide and the exit plate
 * show it whole.
 */

export type DeckArtCrop = 'swatch' | 'strip' | 'divider';

export type DeckArt = {
  id: string;
  title: string;
  artist: string;
  year: string;
  medium: string;
  collection: string;
  /** The whole image, under the app's public folder. */
  src: string;
  /** Pre-cropped versions, for the boxes that crop. */
  crops: Record<DeckArtCrop, string>;
  /** Where the eye goes, 0–1 across and down, for any crop made later. */
  focal: { x: number; y: number };
  /** Two or three colors from the painting, each 4.5:1 or better on paper. */
  colors: string[];
  rights: string;
  /** What the painting shows, in a line: the planner matches on this first. */
  subject: string;
  /** What the work is about, for the planner to match against a lesson. */
  themes: string[];
};

const base = '/lesson-planner/art';

export const DECK_ART: DeckArt[] = [
  {
    id: 'bierstadt-yosemite-valley',
    title: 'Looking Down Yosemite Valley',
    artist: 'Albert Bierstadt',
    year: '1865',
    medium: 'Oil on canvas',
    collection: 'Metropolitan Museum of Art, New York',
    src: `${base}/bierstadt-yosemite-valley.jpg`,
    crops: {
      swatch: `${base}/bierstadt-yosemite-valley--swatch.jpg`,
      strip: `${base}/bierstadt-yosemite-valley--strip.jpg`,
      divider: `${base}/bierstadt-yosemite-valley--divider.jpg`,
    },
    focal: { x: 0.5, y: 0.45 },
    colors: ['#8A4F1C', '#3D5A3A', '#5C4A38'],
    rights: 'Public domain (Metropolitan Museum of Art, CC0)',
    subject: 'a wide view down Yosemite Valley with cliffs, trees, and distant peaks',
    themes: ['landscape', 'awe', 'scale', 'setting the scene', 'opening', 'place', 'vista'],
  },
  {
    id: 'bruegel-childrens-games',
    title: "Children's Games",
    artist: 'Pieter Bruegel the Elder',
    year: '1560',
    medium: 'Oil on panel',
    collection: 'Kunsthistorisches Museum, Vienna',
    src: `${base}/bruegel-childrens-games.jpg`,
    crops: {
      swatch: `${base}/bruegel-childrens-games--swatch.jpg`,
      strip: `${base}/bruegel-childrens-games--strip.jpg`,
      divider: `${base}/bruegel-childrens-games--divider.jpg`,
    },
    focal: { x: 0.5, y: 0.52 },
    colors: ['#A3402B', '#4A4E28', '#5C3A22'],
    rights: 'Public domain',
    subject: 'over two hundred children playing dozens of games in a town square',
    themes: ['play', 'invention', 'observation', 'gathering ideas', 'pre-writing', 'childhood', 'rules'],
  },
  {
    id: 'degas-dance-class',
    title: 'The Dance Class',
    artist: 'Edgar Degas',
    year: '1874',
    medium: 'Oil on canvas',
    collection: 'Metropolitan Museum of Art, New York',
    src: `${base}/degas-dance-class.jpg`,
    crops: {
      swatch: `${base}/degas-dance-class--swatch.jpg`,
      strip: `${base}/degas-dance-class--strip.jpg`,
      divider: `${base}/degas-dance-class--divider.jpg`,
    },
    focal: { x: 0.35, y: 0.55 },
    colors: ['#2E6660', '#9E3F35', '#3A5F8A'],
    rights: 'Public domain (Metropolitan Museum of Art, CC0)',
    subject: 'young ballet dancers rehearsing under a master in a sunlit studio',
    themes: ['practice', 'discipline', 'quoting', 'evidence', 'precision', 'movement', 'attention'],
  },
  {
    id: 'homer-breezing-up',
    title: 'Breezing Up (A Fair Wind)',
    artist: 'Winslow Homer',
    year: '1876',
    medium: 'Oil on canvas',
    collection: 'National Gallery of Art, Washington',
    src: `${base}/homer-breezing-up.jpg`,
    crops: {
      swatch: `${base}/homer-breezing-up--swatch.jpg`,
      strip: `${base}/homer-breezing-up--strip.jpg`,
      divider: `${base}/homer-breezing-up--divider.jpg`,
    },
    focal: { x: 0.55, y: 0.55 },
    colors: ['#2D5E57', '#3A4F5C', '#5C4A33'],
    rights: 'Public domain',
    subject: 'a man and three boys heeling in a small sailboat on a breezy sea',
    themes: ['beginning', 'youth', 'wind', 'freedom', 'introduction', 'energy', 'setting out'],
  },
  {
    id: 'hokusai-great-wave',
    title: 'Under the Wave off Kanagawa (The Great Wave)',
    artist: 'Katsushika Hokusai',
    year: 'ca. 1830–32',
    medium: 'Woodblock print',
    collection: 'Metropolitan Museum of Art, New York',
    src: `${base}/hokusai-great-wave.jpg`,
    crops: {
      swatch: `${base}/hokusai-great-wave--swatch.jpg`,
      strip: `${base}/hokusai-great-wave--strip.jpg`,
      divider: `${base}/hokusai-great-wave--divider.jpg`,
    },
    focal: { x: 0.42, y: 0.55 },
    colors: ['#2F5873', '#1E4A52', '#4A4038'],
    rights: 'Public domain (Metropolitan Museum of Art, CC0)',
    subject: 'a towering wave about to break over boats with Mount Fuji in the distance',
    themes: ['force', 'focus', 'thesis', 'pressure', 'claim', 'nature', 'urgency'],
  },
  {
    id: 'turner-temeraire',
    title: 'The Fighting Temeraire',
    artist: 'J. M. W. Turner',
    year: '1839',
    medium: 'Oil on canvas',
    collection: 'National Gallery, London',
    src: `${base}/turner-temeraire.jpg`,
    crops: {
      swatch: `${base}/turner-temeraire--swatch.jpg`,
      strip: `${base}/turner-temeraire--strip.jpg`,
      divider: `${base}/turner-temeraire--divider.jpg`,
    },
    focal: { x: 0.3, y: 0.58 },
    // The kit's Conclusion Paragraph deck: rust, slate, ochre.
    colors: ['#9C4A22', '#3F5A73', '#7D6118'],
    rights: 'Public domain',
    // Brian's example in the kit (the Conclusion Paragraph deck), not a house
    // painting: its themes are what it shows, kept narrow so it is not
    // reached for on every lesson (Kevin, Oct 22).
    subject: 'an old warship towed to be broken up, under a setting sun',
    themes: ['endings', 'the end of an era', 'the old giving way to the new', 'obsolescence', 'progress and its cost'],
  },
  {
    id: 'vangogh-bearers-burden',
    title: 'The Bearers of the Burden',
    artist: 'Vincent van Gogh',
    year: '1881',
    medium: 'Pencil, pen and ink, watercolor on paper',
    collection: 'Kröller-Müller Museum, Otterlo',
    src: `${base}/vangogh-bearers-burden.jpg`,
    crops: {
      swatch: `${base}/vangogh-bearers-burden--swatch.jpg`,
      strip: `${base}/vangogh-bearers-burden--strip.jpg`,
      divider: `${base}/vangogh-bearers-burden--divider.jpg`,
    },
    focal: { x: 0.5, y: 0.5 },
    colors: ['#5A4F45', '#4A5560', '#3E4A42'],
    rights: 'Public domain',
    subject: 'women miners carrying heavy sacks through a bleak industrial landscape',
    themes: ['weight', 'labor', 'carrying', 'burden', 'war', 'fatigue', 'The Things They Carried'],
  },
];

export function deckArt(id: string | null | undefined): DeckArt | null {
  if (!id) return null;
  return DECK_ART.find((art) => art.id === id) ?? null;
}

/** The wall label's one-line form: "J. M. W. Turner, The Fighting Temeraire, 1839". */
export function artCredit(art: DeckArt): string {
  return `${art.artist}, ${art.title}, ${art.year}`;
}
