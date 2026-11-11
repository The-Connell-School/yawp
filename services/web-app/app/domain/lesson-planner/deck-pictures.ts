/**
 * The teacher's own pictures on a Yawp! deck (Nov 1): what every renderer
 * needs to draw one, and what it draws when it cannot.
 *
 * A picture is private to the teacher who uploaded it. A screen that is not
 * theirs (a shared lesson, a substitute's link) is handed no entry for it and
 * draws the placeholder: the slide keeps its shape and its question, and
 * says the picture is not shared, rather than showing a broken image.
 */

export type DeckPicture = {
  id: string;
  altText: string;
  width: number | null;
  height: number | null;
};

/** The pictures a screen may show, by id. Missing: draw the placeholder. */
export type DeckPictures = Record<string, DeckPicture>;

export const PICTURE_PLACEHOLDER = 'The teacher’s own picture goes here. It is not shared with this lesson.';

export function pictureSrc(id: string): string {
  return `/api/image/lesson-picture/${encodeURIComponent(id)}`;
}

export type Box = { x: number; y: number; w: number; h: number };

/**
 * The picture's box inside `box`, whole and centred, keeping its shape. For
 * the file renderers, which place an image by size rather than by CSS. A
 * picture of unknown size fills the box.
 */
export function containBox(box: Box, picture: { width: number | null; height: number | null }): Box {
  if (!picture.width || !picture.height) return box;
  const scale = Math.min(box.w / picture.width, box.h / picture.height);
  const w = picture.width * scale;
  const h = picture.height * scale;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

/** A picture slide's words beside the picture: its question, else its body. */
export function pictureSlideText(slide: { question?: string; body?: string }): string | null {
  return slide.question ?? slide.body ?? null;
}
