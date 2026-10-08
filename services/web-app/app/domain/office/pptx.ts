/**
 * What is actually on the slides.
 *
 * The planner used to be handed a deck's filename and nothing else, which is
 * why it wrote sentences like "project slides 4–9, they cover how to introduce
 * a quote" — a claim it had no way to make. This is what makes that sentence
 * either true or impossible to write.
 *
 * Two things here are easy to get wrong and both change what "slide 4" means:
 *
 * - Slide order is not filename order. `slide3.xml` is wherever the teacher
 *   last dragged it. The order lives in `presentation.xml`, as a list of
 *   relationship ids resolved through the presentation's rels.
 * - Notes numbering is its own sequence. PowerPoint only writes a notes part
 *   for slides that have notes, so `notesSlide1.xml` usually belongs to some
 *   slide other than the first. Each slide's own rels say which one is its.
 */
import { blocksOf, textOf } from './xml-text';
import { readZipEntries, type ZipEntry } from './zip';

export type PptxSlide = {
  /** Position in the deck as the teacher sees it, starting at 1. */
  number: number;
  /** Every line of visible text on the slide, in reading order. */
  lines: string[];
  /** Speaker notes, if the slide has any. */
  notes: string;
};

const SLIDE_RELATIONSHIP = /\/slide$/;
const NOTES_RELATIONSHIP = /\/notesSlide$/;

/** `<Relationship Id="rId3" Type="…/slide" Target="slides/slide7.xml"/>` */
function readRelationships(
  xml: string
): Array<{ id: string; type: string; target: string }> {
  const found: Array<{ id: string; type: string; target: string }> = [];
  for (const match of xml.matchAll(/<Relationship\b[^>]*\/?>/g)) {
    const tag = match[0];
    const id = /\bId="([^"]*)"/.exec(tag)?.[1];
    const type = /\bType="([^"]*)"/.exec(tag)?.[1];
    const target = /\bTarget="([^"]*)"/.exec(tag)?.[1];
    if (id && type && target) found.push({ id, type, target });
  }
  return found;
}

/** Resolve a rels Target, which is relative to the part that declared it. */
function resolvePart(fromPart: string, target: string): string {
  const base = fromPart.slice(0, fromPart.lastIndexOf('/'));
  const segments = base.split('/');
  for (const piece of target.split('/')) {
    if (piece === '..') segments.pop();
    else if (piece !== '.' && piece !== '') segments.push(piece);
  }
  return segments.join('/');
}

function read(entries: Map<string, ZipEntry>, part: string): string | null {
  const entry = entries.get(part);
  if (!entry) return null;
  try {
    return entry.read().toString('utf8');
  } catch {
    return null;
  }
}

/**
 * The slide parts in the order they are presented.
 *
 * Falls back to numeric filename order when `presentation.xml` is missing or
 * says nothing useful — better a deck read in a plausible order than no deck.
 */
function orderedSlideParts(entries: Map<string, ZipEntry>): string[] {
  const presentation = read(entries, 'ppt/presentation.xml');
  const rels = read(entries, 'ppt/_rels/presentation.xml.rels');
  if (presentation && rels) {
    const byId = new Map(
      readRelationships(rels)
        .filter((relationship) => SLIDE_RELATIONSHIP.test(relationship.type))
        .map((relationship) => [
          relationship.id,
          resolvePart('ppt/presentation.xml', relationship.target),
        ])
    );
    const list = /<p:sldIdLst>([\s\S]*?)<\/p:sldIdLst>/.exec(presentation)?.[1];
    if (list) {
      const ordered: string[] = [];
      for (const slide of list.matchAll(/<p:sldId\b[^>]*\/?>/g)) {
        const id = /\br:id="([^"]*)"/.exec(slide[0])?.[1];
        const part = id ? byId.get(id) : undefined;
        if (part && entries.has(part)) ordered.push(part);
      }
      if (ordered.length) return ordered;
    }
  }

  return [...entries.keys()]
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => slideFileNumber(a) - slideFileNumber(b));
}

function slideFileNumber(part: string): number {
  return Number(/slide(\d+)\.xml$/.exec(part)?.[1] ?? 0);
}

/** The notes part a given slide points at, if it has one. */
function notesPartFor(
  entries: Map<string, ZipEntry>,
  slidePart: string
): string | null {
  const file = slidePart.slice(slidePart.lastIndexOf('/') + 1);
  const relsPart = `${slidePart.slice(0, slidePart.lastIndexOf('/'))}/_rels/${file}.rels`;
  const rels = read(entries, relsPart);
  if (!rels) return null;
  const notes = readRelationships(rels).find((relationship) =>
    NOTES_RELATIONSHIP.test(relationship.type)
  );
  return notes ? resolvePart(slidePart, notes.target) : null;
}

/**
 * Notes text, minus the slide-number placeholder PowerPoint stores in the same
 * part. That placeholder is a bare numeral, and letting it through means the
 * planner reads "3" as something the teacher wrote.
 */
function readNotes(xml: string): string {
  const withoutFields = xml.replace(/<a:fld\b[\s\S]*?<\/a:fld>/g, '');
  return blocksOf(withoutFields, {
    blockTag: 'a:p',
    runTag: 'a:t',
    breaks: { 'a:br': '\n' },
  })
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

export function readPptxSlides(file: Uint8Array): PptxSlide[] {
  const entries = readZipEntries(file);
  return orderedSlideParts(entries).map((part, index) => {
    const xml = read(entries, part) ?? '';
    const lines = blocksOf(xml, {
      blockTag: 'a:p',
      runTag: 'a:t',
      breaks: { 'a:br': '\n' },
    })
      .flatMap((block) => block.split('\n'))
      .map((line) => line.trim())
      .filter(Boolean);

    const notesPart = notesPartFor(entries, part);
    const notesXml = notesPart ? read(entries, notesPart) : null;

    return {
      number: index + 1,
      lines,
      notes: notesXml ? readNotes(notesXml) : '',
    };
  });
}

/** Whether a .pptx has any readable text at all — an all-image deck has none. */
export function hasSlideText(slides: PptxSlide[]): boolean {
  return slides.some((slide) => slide.lines.length > 0);
}

/** Every string in the deck, for a caller that just wants to search it. */
export function pptxPlainText(file: Uint8Array): string {
  const entries = readZipEntries(file);
  return orderedSlideParts(entries)
    .map((part) => textOf(read(entries, part) ?? '', 'a:t').join(' '))
    .join('\n');
}
