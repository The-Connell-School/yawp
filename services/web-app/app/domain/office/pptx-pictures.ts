/**
 * The pictures on a teacher's slides (Nov 1).
 *
 * The planner used to read a deck's words and nothing else, so a slide built
 * around a photograph ("What is happening in this picture?") reached it as a
 * question about nothing. This reads each slide's pictures in the order the
 * teacher meets them, with the alt text they wrote, so the planner knows a
 * picture is there and what it shows, and so the picture itself can be kept.
 *
 * Only the slides' own pictures count. A layout's or master's logo is the
 * template's decoration, not something the teacher put on a slide. A picture
 * used on several slides is one picture. Bytes are kept only for formats a
 * browser draws (by signature, never by file name), under a size and count
 * cap; anything else is still named, so the planner can say what is missing.
 */
import {
  notesPartFor,
  orderedSlideParts,
  readNotes,
  readPart,
  resolvePart,
  type PptxSlide,
} from './pptx';
import { imageDimensions, sniffPictureType, type PictureContentType } from './image-dimensions';
import { blocksOf, decodeXmlEntities } from './xml-text';
import { readZipEntries, type ZipEntry } from './zip';

/** More pictures than a lesson can use; the rest are named but not kept. */
export const MAX_DECK_PICTURES = 40;
/** Per picture. A slide photo is rarely over 2 MB; the file itself is capped at 10. */
export const MAX_DECK_PICTURE_BYTES = 8 * 1024 * 1024;

export type PictureSkip = 'format' | 'size' | 'count' | 'linked' | 'missing';

export type PptxPicture = {
  /** Its order in the deck, from 1, by first appearance. */
  position: number;
  /** The slides it is on, as the teacher numbers them. */
  slideNumbers: number[];
  altText: string;
  /** Upper-case format from the part's name: "PNG", "EMF". */
  format: string;
  /** Only when kept: a format a browser draws, under the caps. */
  contentType: PictureContentType | null;
  bytes: Uint8Array | null;
  width: number | null;
  height: number | null;
  /** The slide's background rather than a picture placed on it. */
  background: boolean;
  /** Why no bytes were kept; null when they were. */
  skipped: PictureSkip | null;
};

export type PptxDeckSlide = PptxSlide & {
  /** Positions of the pictures on this slide, in the order they sit. */
  pictures: number[];
};

export type PptxDeck = { slides: PptxDeckSlide[]; pictures: PptxPicture[] };

type Relationship = { id: string; target: string; external: boolean };

function slideRelationships(entries: Map<string, ZipEntry>, slidePart: string): Map<string, Relationship> {
  const file = slidePart.slice(slidePart.lastIndexOf('/') + 1);
  const xml = readPart(entries, `${slidePart.slice(0, slidePart.lastIndexOf('/'))}/_rels/${file}.rels`) ?? '';
  const out = new Map<string, Relationship>();
  for (const match of xml.matchAll(/<Relationship\b[^>]*\/?>/g)) {
    const tag = match[0];
    const id = /\bId="([^"]*)"/.exec(tag)?.[1];
    const target = /\bTarget="([^"]*)"/.exec(tag)?.[1];
    if (!id || !target) continue;
    const external = /\bTargetMode="External"/.test(tag);
    out.set(id, { id, target: external ? decodeXmlEntities(target) : resolvePart(slidePart, target), external });
  }
  return out;
}

const FILE_NAME = /^[\w\-./\\ ]+\.(png|jpe?g|gif|bmp|emf|wmf|svg|tiff?|webp)$/i;

/**
 * The teacher's description, or nothing. A file name is not a description
 * (Google Slides stores one there), and PowerPoint's automatic captions end
 * in a boilerplate line that is not part of what the picture shows.
 */
export function cleanAltText(raw: string): string {
  const text = raw
    .replace(/\s*Description automatically generated(?: with (?:low|medium|high) confidence)?\.?\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return FILE_NAME.test(text) ? '' : text.slice(0, 300);
}

type Found = { key: string; target: string; external: boolean; altText: string; background: boolean };

/** Every picture reference on one slide, in document order. */
function picturesOnSlide(xml: string, relationships: Map<string, Relationship>): Found[] {
  const found: Found[] = [];
  const background = /<p:bg\b[\s\S]*?<\/p:bg>/.exec(xml);
  const backgroundRange = background ? [background.index, background.index + background[0].length] : null;

  for (const match of xml.matchAll(/<a:blip\b[^>]*>/g)) {
    const tag = match[0];
    const at = match.index;
    const id = /\br:(?:embed|link)="([^"]*)"/.exec(tag)?.[1];
    const relationship = id ? relationships.get(id) : undefined;
    if (!relationship) continue;
    const isBackground = Boolean(backgroundRange && at >= backgroundRange[0] && at < backgroundRange[1]);

    // The element's own description: the last non-visual properties tag before
    // the picture, as long as no element closed in between.
    let altText = '';
    if (!isBackground) {
      const before = xml.slice(0, at);
      const properties = before.lastIndexOf('<p:cNvPr');
      const closed = Math.max(before.lastIndexOf('</p:pic>'), before.lastIndexOf('</p:sp>'));
      if (properties > closed) {
        const propertiesTag = /^<p:cNvPr\b[^>]*>/.exec(before.slice(properties))?.[0] ?? '';
        const descr = /\bdescr="([^"]*)"/.exec(propertiesTag)?.[1] ?? /\btitle="([^"]*)"/.exec(propertiesTag)?.[1] ?? '';
        altText = cleanAltText(decodeXmlEntities(descr));
      }
    }
    found.push({
      key: relationship.external ? `link:${relationship.target}` : relationship.target,
      target: relationship.target,
      external: relationship.external,
      altText,
      background: isBackground,
    });
  }
  return found;
}

function formatOf(target: string): string {
  return (/\.([a-z0-9]+)$/i.exec(target)?.[1] ?? 'unknown').toUpperCase().replace('JPG', 'JPEG');
}

export function readPptxDeck(
  file: Uint8Array,
  { maxPictures = MAX_DECK_PICTURES, maxPictureBytes = MAX_DECK_PICTURE_BYTES } = {}
): PptxDeck {
  const entries = readZipEntries(file);
  const pictures: PptxPicture[] = [];
  const byKey = new Map<string, PptxPicture>();
  let kept = 0;

  const slides = orderedSlideParts(entries).map((part, index): PptxDeckSlide => {
    const number = index + 1;
    const xml = readPart(entries, part) ?? '';
    const lines = blocksOf(xml, { blockTag: 'a:p', runTag: 'a:t', breaks: { 'a:br': '\n' } })
      .flatMap((block) => block.split('\n'))
      .map((line) => line.trim())
      .filter(Boolean);
    const notesPart = notesPartFor(entries, part);
    const notesXml = notesPart ? readPart(entries, notesPart) : null;

    const onSlide: number[] = [];
    for (const found of picturesOnSlide(xml, slideRelationships(entries, part))) {
      let picture = byKey.get(found.key);
      if (!picture) {
        picture = {
          position: pictures.length + 1,
          slideNumbers: [],
          altText: found.altText,
          format: formatOf(found.target),
          contentType: null,
          bytes: null,
          width: null,
          height: null,
          background: found.background,
          skipped: null,
        };
        if (found.external) {
          picture.skipped = 'linked';
        } else {
          let bytes: Uint8Array | null = null;
          try {
            bytes = entries.get(found.target)?.read() ?? null;
          } catch {
            bytes = null;
          }
          const type = bytes ? sniffPictureType(bytes) : null;
          if (!bytes) picture.skipped = 'missing';
          else if (!type) picture.skipped = 'format';
          else if (bytes.byteLength > maxPictureBytes) picture.skipped = 'size';
          else if (kept >= maxPictures) picture.skipped = 'count';
          if (bytes && type) picture.format = type.slice('image/'.length).toUpperCase();
          if (!picture.skipped && bytes && type) {
            kept += 1;
            const size = imageDimensions(bytes);
            picture.contentType = type;
            picture.bytes = new Uint8Array(bytes);
            picture.width = size?.width ?? null;
            picture.height = size?.height ?? null;
          }
        }
        byKey.set(found.key, picture);
        pictures.push(picture);
      } else if (!picture.altText && found.altText) {
        picture.altText = found.altText;
      }
      if (!picture.slideNumbers.includes(number)) picture.slideNumbers.push(number);
      if (!onSlide.includes(picture.position)) onSlide.push(picture.position);
    }

    return { number, lines, notes: notesXml ? readNotes(notesXml) : '', pictures: onSlide };
  });

  return { slides, pictures };
}

function pictureMarker(picture: PptxPicture): string {
  const what = picture.altText || 'no description';
  const label =
    picture.skipped === 'format'
      ? `, an ${picture.format} Yawp! cannot show`
      : picture.skipped === 'linked'
        ? ', linked from the web and not in the file'
        : picture.skipped === 'size'
          ? ', too large for Yawp! to keep'
          : picture.skipped === 'count'
            ? ', past the number of pictures Yawp! keeps'
            : picture.skipped === 'missing'
              ? ', missing from the file'
              : picture.background
                ? ', the slide background'
                : '';
  return `[Picture ${picture.position}${label}: ${what}]`;
}

/**
 * The deck as the planner reads it: numbered slides, their words, a marker
 * where each picture sits, and the speaker notes.
 */
export function deckTextWithPictures(deck: PptxDeck): string {
  const byPosition = new Map(deck.pictures.map((picture) => [picture.position, picture]));
  return deck.slides
    .map((slide) => {
      const lines = [`Slide ${slide.number}`, ...slide.lines];
      for (const position of slide.pictures) {
        const picture = byPosition.get(position);
        if (picture) lines.push(pictureMarker(picture));
      }
      if (slide.notes) lines.push(`Speaker notes: ${slide.notes}`);
      return lines.join('\n');
    })
    .join('\n\n');
}
