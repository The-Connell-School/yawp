/**
 * The title slide as a poster (Kevin, Nov 25): the book's world as a screen
 * print beside the title, never the author's face as a memorial card.
 */
import { describe, expect, test } from 'bun:test';
import jpeg from 'jpeg-js';
import { layoutKitV4Slide } from './deck-kit-v4';
import { withPosterTitle, type PictureShelf } from './picture-lookup.server';
import { POSTER_HEIGHT, POSTER_WIDTH, screenPrint } from './poster-print.server';
import type { SlideDeck } from './slide-deck';

/** A photo-like test picture: sky over a white wall with a dark door, and noise. */
function photo(width = 1200, height = 800): Uint8Array {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const noise = ((x * 7 + y * 13) % 17) - 8;
      const sky = y < height * 0.35;
      const door = !sky && x > width * 0.45 && x < width * 0.55 && y > height * 0.6;
      const [r, g, b] = sky ? [70, 130, 210] : door ? [30, 25, 20] : [235, 232, 225];
      data[i] = r + noise;
      data[i + 1] = g + noise;
      data[i + 2] = b + noise;
      data[i + 3] = 255;
    }
  return new Uint8Array(jpeg.encode({ data, width, height }, 90).data);
}

describe('the screen print', () => {
  test('an 8:9 JPEG in a few flat inks, the same every time', () => {
    const one = screenPrint(photo(), 'image/jpeg')!;
    expect(one.contentType).toBe('image/jpeg');
    expect([one.width, one.height]).toEqual([POSTER_WIDTH, POSTER_HEIGHT]);
    expect(Buffer.from(screenPrint(photo(), 'image/jpeg')!.data).equals(Buffer.from(one.data))).toBe(true);
    const decoded = jpeg.decode(one.data, { useTArray: true });
    // The sky is still blue and the wall still light: the photo's own colors, flattened.
    const at = (x: number, y: number) => Array.from(decoded.data.slice((y * decoded.width + x) * 4, (y * decoded.width + x) * 4 + 3));
    const [r, , b] = at(400, 60);
    expect(b).toBeGreaterThan(r! + 60);
    expect(Math.min(...at(150, 600))).toBeGreaterThan(170);
  });

  test('not a JPEG, unreadable, or too small to fill half a slide: none', () => {
    expect(screenPrint(photo(), 'image/png')).toBeNull();
    expect(screenPrint(new Uint8Array([1, 2, 3]), 'image/jpeg')).toBeNull();
    expect(screenPrint(photo(400, 300), 'image/jpeg')).toBeNull();
  });
});

const PICTURE = 'cmabcdefghijklmnopqrstuvw';
const PRINT = 'cmzyxwvutsrqponmlkjihgfed';
const deck = (title: Record<string, unknown>): SlideDeck =>
  ({ title: 'Chronicle', unit: 'Day 1 · Into the world of the novel', slides: [{ layout: 'title', title: 'Chronicle of a Death Foretold', subtitle: 'Gabriel García Márquez', speakerNotes: 'n', ...title }] }) as SlideDeck;

describe('the poster title slide', () => {
  test('the print fills the right half; the title is set light on the deck’s color', () => {
    const layout = layoutKitV4Slide(deck({ image: PRINT, poster: true }), 0);
    const picture = layout.elements.find((element) => element.kind === 'picture')!;
    expect(picture).toMatchObject({ x: 640, y: 0, w: 640, h: 720 });
    expect(layout.elements.some((element) => element.kind === 'rect' && element.x === 0 && element.w === 640 && element.h === 720)).toBe(true);
    const text = JSON.stringify(layout.elements.filter((element) => element.kind === 'text'));
    expect(text).toContain('Chronicle of a Death Foretold');
    expect(text).toContain('DAY 1');
  });

  test('a title picture that is not a print keeps the ordinary title slide', () => {
    const layout = layoutKitV4Slide(deck({ image: PICTURE }), 0);
    const picture = layout.elements.find((element) => element.kind === 'picture')!;
    expect(picture.x).not.toBe(640);
  });
});

describe('the print takes the photo’s place', () => {
  const owner = { membershipId: 'm', conversationId: 'c' };
  const shelf = (print: PictureShelf['print']): PictureShelf =>
    ({ findKept: async () => [], copy: async () => ({ id: 'x' }), create: async () => ({ id: 'x' }), print }) as PictureShelf;
  const asked = deck({ wants: { subject: 'Aracataca', print: true } });
  const found = deck({ image: PICTURE });

  test('when the title asked for its world printed and a photo was found', async () => {
    const out = await withPosterTitle(asked, found, owner, shelf(async () => ({ id: PRINT })));
    expect(out.slides[0]).toMatchObject({ image: PRINT, poster: true });
  });

  test('not when the title asked for the author, or the photo could not be printed', async () => {
    const author = deck({ wants: { subject: 'Gabriel García Márquez', own: true } });
    expect(await withPosterTitle(author, found, owner, shelf(async () => ({ id: PRINT })))).toBe(found);
    expect(await withPosterTitle(asked, found, owner, shelf(async () => null))).toBe(found);
    expect(await withPosterTitle(asked, found, owner, shelf(async () => { throw new Error('db'); }))).toBe(found);
  });
});
