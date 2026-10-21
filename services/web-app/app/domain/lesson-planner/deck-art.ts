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
  /** What the work is about, for the planner to match against a lesson. */
  themes: string[];
};

const base = '/lesson-planner/art';

export const DECK_ART: DeckArt[] = [
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
    themes: ['war', 'memory', 'loss', 'carrying', 'endings', 'change', 'age', 'the end of an era'],
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
