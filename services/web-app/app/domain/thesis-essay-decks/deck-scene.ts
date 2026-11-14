/**
 * A Thesis-Driven Essay deck as the web presents it: every slide as the
 * shapes, text boxes and pictures the PowerPoint is drawn from, positioned in
 * inches on the same 13.333 x 7.5 page.
 *
 * scripts/thesis-essay-decks draws each slide once and writes it twice: to
 * the .pptx, and to `<deck>.scene.json` in this shape. So what a teacher
 * presents on the site is the deck they would download, with no conversion in
 * between.
 */

export const SCENE_PAGE = { width: 13.333, height: 7.5 } as const;

/** Colours are hex without `#`, as PowerPoint writes them. */
export interface SceneRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  color?: string;
  highlight?: string;
  fontFace?: string;
  /** Points. */
  fontSize?: number;
}

export interface SceneParagraph {
  runs: SceneRun[];
  bullet?: boolean;
  /** Points after the paragraph. */
  spaceAfter?: number;
}

interface SceneBox {
  x: number;
  y: number;
  w: number;
  h: number;
  /** The wordmark and slide number every slide carries. */
  master?: boolean;
}

export interface SceneText extends SceneBox {
  kind: 'text';
  paragraphs: SceneParagraph[];
  fontFace?: string;
  fontSize?: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
  valign?: 'top' | 'middle' | 'bottom';
  lineSpacingMultiple?: number;
  /** Points of extra space between letters. */
  charSpacing?: number;
  /** Degrees, clockwise. */
  rotate?: number;
}

export interface SceneShape extends SceneBox {
  kind: 'shape';
  shape: 'rect' | 'roundRect' | 'ellipse';
  fill?: string;
  line?: { color: string; width: number };
  /** Inches, for `roundRect`. */
  radius?: number;
  shadow?: { color: string; opacity: number; blur: number; offset: number };
}

export interface SceneImage extends SceneBox {
  kind: 'image';
  /** A file in resources/thesis-essay-decks/assets, e.g. `icons/eye.png`. */
  asset: string;
  alt: string;
}

export type SceneElement = SceneText | SceneShape | SceneImage;

export interface SceneSlide {
  background: string;
  elements: SceneElement[];
  notes: string;
}

export interface DeckScene {
  title: string;
  slides: SceneSlide[];
}
