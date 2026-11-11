/**
 * "Keep it as is" (Brian, Nov 3): the teacher's own deck as a Yawp! deck,
 * slide for slide, so it can be edited, presented and downloaded from the
 * stack like any other. No model writes it: every slide keeps its words in
 * its order, its picture, and its speaker notes. Words a slide cannot hold go
 * to that slide's notes, never away.
 */
import { readPptxDeck } from '~/domain/office/pptx-pictures';
import { validateSlideDeck, type Slide, type SlideDeck } from './slide-deck';

const MAX_SLIDES = 40;
const MAX_TITLE = 90;
const MAX_LINE = 200;
const MAX_BODY = 320;
const MAX_BULLETS = 7;
const MAX_NOTES = 2000;

export type StoredPicture = { id: string; position: number; width: number | null; height: number | null };
export type TextSlide = { number: number; lines: string[]; notes: string; pictureIds: string[] };

function clip(text: string, max: number): { kept: string; spilled: string | null } {
  if (text.length <= max) return { kept: text, spilled: null };
  return { kept: `${text.slice(0, max - 1).trimEnd()}…`, spilled: text };
}

/** "i." on its own line, then "Look closely": one bullet. */
function joinMarkers(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const previous = out[out.length - 1];
    if (previous && /^(?:(?:[ivx]{1,5}|[a-z])[.)]|\d{1,2}[.)]?)$/i.test(previous)) out[out.length - 1] = `${previous} ${line}`;
    else out.push(line);
  }
  return out;
}

export function slidesFromText(slides: TextSlide[]): Slide[] {
  return slides.map((source, index): Slide => {
    const spilled: string[] = [];
    const keep = (text: string, max: number) => {
      const { kept, spilled: rest } = clip(text, max);
      if (rest) spilled.push(rest);
      return kept;
    };
    const lines = joinMarkers(source.lines);
    const title = lines[0] ? keep(lines[0], MAX_TITLE) : `Slide ${source.number}`;
    const rest = lines.slice(1);
    const notesFor = () => {
      const parts = [source.notes.trim(), ...(spilled.length ? [`On your original slide: ${spilled.join(' / ')}`] : [])].filter(Boolean);
      return (parts.join('\n\n') || `Slide ${source.number} of your deck, as you made it.`).slice(0, MAX_NOTES);
    };

    let slide: Omit<Slide, 'speakerNotes'>;
    if (source.pictureIds[0]) {
      const words = rest.join(' ');
      slide = { layout: 'picture', title, image: source.pictureIds[0], ...(words ? { body: keep(words, MAX_BODY) } : {}) };
    } else if (index === 0 && rest.length) {
      slide = { layout: 'title', title, subtitle: keep(rest[0]!, MAX_LINE) };
      if (rest.length > 1) spilled.push(rest.slice(1).join(' / '));
    } else if (rest.length === 0) {
      slide = { layout: 'title', title };
    } else if (rest.length === 1) {
      slide = { layout: 'statement', title, body: keep(rest[0]!, MAX_BODY) };
    } else {
      const bullets = rest.slice(0, MAX_BULLETS).map((line) => keep(line, MAX_LINE));
      if (rest.length > MAX_BULLETS) spilled.push(rest.slice(MAX_BULLETS).join(' / '));
      slide = { layout: 'bullets', title, bullets };
    }
    return { ...slide, speakerNotes: notesFor() } as Slide;
  });
}

/** The teacher's deck as a Yawp! deck, or null when it cannot be read. */
export function deckFromUpload({
  name,
  file,
  pictures,
}: {
  name: string;
  file: Uint8Array;
  /** The pictures kept from it, by their place in the deck. */
  pictures: StoredPicture[];
}): { deck: SlideDeck; leftOut: number } | null {
  let read;
  try {
    read = readPptxDeck(file);
  } catch {
    return null;
  }
  if (!read.slides.length) return null;
  const byPosition = new Map(pictures.map((picture) => [picture.position, picture]));
  const backgrounds = new Set(read.pictures.filter((picture) => picture.background).map((picture) => picture.position));
  const area = (picture: StoredPicture) => (picture.width ?? 0) * (picture.height ?? 0);

  const text: TextSlide[] = read.slides.slice(0, MAX_SLIDES).map((slide) => {
    const kept = slide.pictures.map((position) => byPosition.get(position)).filter((picture): picture is StoredPicture => Boolean(picture));
    // A picture placed on the slide over its background; then the largest.
    const placed = kept.filter((picture) => !backgrounds.has(picture.position));
    const best = [...(placed.length ? placed : kept)].sort((a, b) => area(b) - area(a))[0];
    return { number: slide.number, lines: slide.lines, notes: slide.notes, pictureIds: best ? [best.id] : [] };
  });
  const slides = slidesFromText(text);
  const title = (read.slides[0]?.lines[0] ?? name.replace(/\.pptx$/i, '')).slice(0, MAX_TITLE) || 'Your slide deck';
  const validated = validateSlideDeck(JSON.stringify({ title, slides }));
  if (!validated.ok) return null;
  return { deck: validated.deck, leftOut: Math.max(0, read.slides.length - MAX_SLIDES) };
}
