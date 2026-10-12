import { describe, expect, test } from 'bun:test';
import { inflateRawSync } from 'node:zlib';
import type { SlideDeck } from './slide-deck';
import { renderDeckPptxTile, TILE_THEME } from './lesson-pptx-tile.server';
import { TILE_COLORS } from './tile-theme';

/**
 * A .pptx is a zip of XML parts, so the way to check one is to open it.
 *
 * Read through the central directory rather than the local headers: the writer
 * streams, so a local header can carry zeroes for the sizes and leave the real
 * ones in a trailing descriptor. The central directory always has them.
 */
function pptxParts(bytes: Uint8Array): Map<string, string> {
  const buffer = Buffer.from(bytes);
  const end = buffer.lastIndexOf('PK\x05\x06', buffer.length, 'latin1');
  if (end < 0) throw new Error('not a zip: no end-of-central-directory record');

  const count = buffer.readUInt16LE(end + 10);
  let cursor = buffer.readUInt32LE(end + 16);
  const parts = new Map<string, string>();

  for (let index = 0; index < count; index += 1) {
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.toString(
      'utf8',
      cursor + 46,
      cursor + 46 + nameLength
    );

    // The local header repeats the name and carries its own extra field, which
    // is not the same length as the central one.
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const raw = buffer.subarray(start, start + compressedSize);

    parts.set(
      name,
      (method === 8 ? inflateRawSync(raw) : raw).toString('utf8')
    );
    cursor += 46 + nameLength + extraLength + commentLength;
  }

  return parts;
}

/** XML entities read back as the characters a projector shows. */
function decode(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Everything a reader would show on one slide, tags removed. */
function slideText(parts: Map<string, string>, number: number): string {
  const xml = parts.get(`ppt/slides/slide${number}.xml`);
  if (!xml) throw new Error(`no slide ${number}`);
  return decode(
    [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)]
      .map((match) => match[1]!)
      .join(' ')
  );
}

function notesText(parts: Map<string, string>, number: number): string {
  const xml = parts.get(`ppt/notesSlides/notesSlide${number}.xml`);
  if (!xml) return '';
  return decode(
    [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)]
      .map((match) => match[1]!)
      .join(' ')
  );
}


/** Every slide type in Brian's day-one example, one of each layout. */
const DECK: SlideDeck = {
  title: 'The Things They Carried — Day 1',
  subtitle: 'English 11 · Period 3',
  slides: [
    { layout: 'title', title: 'The Things They Carried', subtitle: 'Day 1 · What we carry', speakerNotes: 'Let it sit.', minutes: 1 },
    { layout: 'prompt', title: 'Class starter', body: 'Write about something you carry every day that nobody can see.', speakerNotes: 'Eight minutes, pens moving.', minutes: 8 },
    { layout: 'statement', title: 'Hold this question', body: 'Why does a list feel like the right form for this story?', speakerNotes: 'Leave it on the board.', minutes: 5 },
    { layout: 'steps', title: 'How we will read', bullets: ['I read the catalog passages', 'You take the narrative sections', 'Two 90-second pair talks'], speakerNotes: 'Ask ahead who is comfortable reading aloud.', minutes: 40 },
    { layout: 'compare', title: 'Two versions', left: { label: 'Short', text: 'They carried things.' }, right: { label: 'Long', text: 'They carried P-38 can openers, pocket knives, heat tabs…' }, speakerNotes: 'What does the second do that the first cannot?', minutes: 15 },
    { layout: 'quote', title: 'From the text', body: 'They carried all they could bear, and then some.', attribution: "Tim O'Brien", speakerNotes: 'Read it twice.' },
    { layout: 'bullets', title: 'Daily pages', bullets: ['What did Jimmy Cross carry that weighed nothing?', 'In class or at home'], speakerNotes: 'Your call: in class or homework.', minutes: 15 },
    { layout: 'closing', title: 'Before you go', body: 'Exit ticket: open it in Yawp before you leave.', speakerNotes: 'Seven minutes.', minutes: 7 },
  ],
};

describe("renderDeckPptxTile (Brian's review, E1)", () => {
  test('is a real PowerPoint file with every slide and its notes', async () => {
    const bytes = await renderDeckPptxTile(DECK);
    expect(Buffer.from(bytes.subarray(0, 2)).toString()).toBe('PK');
    const parts = pptxParts(bytes);
    DECK.slides.forEach((slide, index) => {
      const text = slideText(parts, index + 1);
      expect(text).toContain(slide.title);
      for (const piece of [slide.body, slide.subtitle, slide.attribution, slide.left?.text, slide.right?.label, ...(slide.bullets ?? [])]) {
        if (piece) expect(text).toContain(piece);
      }
      expect(notesText(parts, index + 1)).toContain(slide.speakerNotes);
    });
  });

  test('wears the YAWP! master: a typographic wordmark and slide numbers, no footer mark', async () => {
    const parts = pptxParts(await renderDeckPptxTile(DECK));
    const masters = [...parts.keys()].filter((name) => /slideLayouts\/slideLayout\d+\.xml$/.test(name));
    const yawpLayout = masters.map((name) => parts.get(name)!).find((xml) => xml.includes('YAWP!'));
    expect(yawpLayout).toBeDefined();
    expect(yawpLayout).toContain('type="sldNum"');
    // Not "Phantom YAWP", not a logo image.
    expect([...parts.values()].join('')).not.toContain('Phantom');
  });

  test('never puts artwork on a slide', async () => {
    const parts = pptxParts(await renderDeckPptxTile(DECK));
    // pptxgenjs always writes an empty ppt/media/ folder; what matters is
    // that nothing is in it.
    expect([...parts.keys()].some((name) => /^ppt\/media\/.+\.\w+$/.test(name))).toBe(false);
  });

  test('uses the app’s own colours and a serif for titles', async () => {
    const parts = pptxParts(await renderDeckPptxTile(DECK));
    const all = [...parts.values()].join('');
    expect(all).toContain(TILE_THEME.terracotta);
    expect(all).toContain(TILE_THEME.cream);
    expect(all).toContain(TILE_THEME.serif);
  });

  // Brian's run 2 (C2): the minutes are the teacher's, kept in the notes and
  // the editor, never on the slide face.
  test('keeps the minutes off the slide face, and in the speaker notes', async () => {
    const parts = pptxParts(await renderDeckPptxTile(DECK));
    DECK.slides.forEach((_, index) => {
      expect(slideText(parts, index + 1)).not.toMatch(/\bMIN\b/);
    });
    expect(notesText(parts, 2)).toContain('8 min');
  });

  test('gives each step its own numbered tile', async () => {
    const parts = pptxParts(await renderDeckPptxTile(DECK));
    const text = slideText(parts, 4);
    for (const n of ['1', '2', '3']) expect(text).toContain(n);
  });
});

describe("renderDeckPptxTile — subtle, subtle, subtle (Brian's run 2, C3, C6)", () => {
  test('the colours come from the one shared theme', () => {
    expect(TILE_THEME.terracotta).toBe(TILE_COLORS.accent);
    expect(TILE_THEME.cream).toBe(TILE_COLORS.cream);
  });

  test('the class starter slide is a raised white tile with a faint orange border, no orange band', async () => {
    const parts = pptxParts(await renderDeckPptxTile(DECK));
    const xml = parts.get('ppt/slides/slide2.xml')!;
    // The band across the top was a shape filled with the accent; text in
    // the accent (the eyebrow) is fine.
    const shapeFills = [...xml.matchAll(/<p:spPr>([\s\S]*?)<\/p:spPr>/g)].map((match) => match[1]);
    expect(shapeFills.some((fill) => fill.includes(`srgbClr val="${TILE_COLORS.accent}"`))).toBe(false);
    expect(xml).toContain(TILE_COLORS.tileBorder);
    expect(xml).toContain('outerShdw');
  });

  test('big colour blocks use the softer orange', async () => {
    const parts = pptxParts(await renderDeckPptxTile(DECK));
    const title = parts.get('ppt/slides/slide1.xml')!;
    expect(title).toContain(TILE_COLORS.accentSoft);
    const closing = parts.get(`ppt/slides/slide${DECK.slides.length}.xml`)!;
    expect(closing).toContain(TILE_COLORS.accentSoft);
    expect(closing).not.toContain(`<a:srgbClr val="${TILE_COLORS.accent}"/></a:solidFill></p:bg>`);
  });

  test('the footer mark can be faded or left off, for Brian and Kevin to choose', async () => {
    const faded = pptxParts(await renderDeckPptxTile(DECK, { footerMark: 'faded' }));
    const fadedLayout = [...faded.values()].find((xml) => xml.includes('YAWP!') && xml.includes('alpha'));
    expect(fadedLayout).toBeDefined();
    const none = pptxParts(await renderDeckPptxTile(DECK, { footerMark: 'none' }));
    const layouts = [...none.entries()].filter(([name]) => /slideLayouts\/slideLayout\d+\.xml$/.test(name));
    expect(layouts.some(([, xml]) => xml.includes('YAWP!'))).toBe(false);
  });
});
