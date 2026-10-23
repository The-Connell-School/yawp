import { describe, expect, test } from 'bun:test';
import { inflateRawSync } from 'node:zlib';
import type { SlideDeck } from './slide-deck';
import { renderDeckPptxGallery } from './lesson-pptx-gallery.server';
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

const notes = { speakerNotes: 'Say it.' };

const deck: SlideDeck = {
  title: 'Lesson 4: The weight of things',
  unit: 'The Things They Carried',
  accent: 'indigo',
  art: 'turner-temeraire',
  slides: [
    { layout: 'title', title: 'The weight of things', subtitle: 'What we carry', course: 'English 9', ...notes },
    { layout: 'agenda', title: 'Today', body: 'One question runs through it.', agenda: [{ title: 'Daily Pages', minutes: 10 }], ...notes },
    { layout: 'write', title: 'Write', body: 'Name one thing you carry.', routine: 'Class starter', minutes: 4, ...notes },
    { layout: 'look', title: 'Look', question: 'What is being carried away?', seconds: 30, ...notes },
    { layout: 'discuss', title: 'Quiz', question: 'Which comes first in a thesis?', choices: ['The claim', 'The reason'], answer: 1, ...notes },
    { layout: 'exit', title: 'Before you go', body: 'One sentence: what weighs most?', button: 'Exit ticket', nextLesson: 'Love', ...notes },
  ],
};

describe('renderDeckPptxGallery (Deck spec v3)', () => {
  test('one slide per slide, each with its notes', async () => {
    const parts = pptxParts(await renderDeckPptxGallery(deck));
    expect(parts.has('ppt/slides/slide6.xml')).toBe(true);
    expect(parts.has('ppt/slides/slide7.xml')).toBe(false);
    expect(parts.get('ppt/notesSlides/notesSlide3.xml')).toContain('Say it.');
  });

  test('mode words where they do a job, a running head with no lesson number, no slide numbers', async () => {
    const parts = pptxParts(await renderDeckPptxGallery(deck));
    expect(slideText(parts, 2)).toContain('Today’s program');
    expect(slideText(parts, 2)).toContain('THE THINGS THEY CARRIED · THE WEIGHT OF THINGS');
    expect(slideText(parts, 2)).not.toContain('LESSON 4');
    expect(slideText(parts, 3)).toContain('Write.');
    expect(slideText(parts, 3)).toContain('MINUTES');
    expect(slideText(parts, 6)).toContain('Before you go.');
    expect(slideText(parts, 6)).toContain('Open Yawp! → Exit ticket');
    for (let n = 1; n <= 6; n += 1) expect(parts.get(`ppt/slides/slide${n}.xml`)).not.toContain('type="sldNum"');
  });

  test('Georgia and Arial only, Georgia never bold, sizes at px × 0.75', async () => {
    const parts = pptxParts(await renderDeckPptxGallery(deck));
    const all = [1, 2, 3, 4, 5, 6].map((n) => parts.get(`ppt/slides/slide${n}.xml`)!).join('');
    const faces = new Set([...all.matchAll(/typeface="([^"]+)"/g)].map((match) => match[1]));
    expect([...faces].sort()).toEqual(['Arial', 'Georgia']);
    // A Georgia run never carries b="1".
    for (const run of all.matchAll(/<a:rPr[^>]*>(?:(?!<\/a:rPr>).)*typeface="Georgia"/g)) expect(run[0]).not.toContain(' b="1"');
    // The title at 112px is 84pt.
    expect(parts.get('ppt/slides/slide1.xml')).toContain('sz="8400"');
  });

  test('the painting’s colors: the primary on the wall, a soft band behind the answer, no transparency', async () => {
    const parts = pptxParts(await renderDeckPptxGallery(deck));
    expect(parts.get('ppt/slides/slide3.xml')).toContain('1F3532'); // pine for writing
    expect(parts.get('ppt/slides/slide6.xml')).toContain('9C4A22'); // the painting's rust wall
    expect(slideText(parts, 5)).toContain('The claim');
    const all = [1, 2, 3, 4, 5, 6].map((n) => parts.get(`ppt/slides/slide${n}.xml`)!).join('');
    expect(all).not.toContain('<a:alpha');
  });

  test('the art hangs pre-cropped, credited, and never under text', async () => {
    const parts = pptxParts(await renderDeckPptxGallery(deck));
    expect([...parts.keys()].filter((name) => /^ppt\/media\/.+\.(jpe?g|png)$/.test(name)).length).toBeGreaterThan(1);
    expect(slideText(parts, 1)).toContain('The Fighting Temeraire');
    expect(slideText(parts, 1)).toContain('National Gallery, London');
  });

  test('a deck with no art and no colors still renders', async () => {
    const plain: SlideDeck = { title: 'Plain', slides: [{ layout: 'bullets', title: 'Notes', bullets: ['One'], ...notes }] };
    const parts = pptxParts(await renderDeckPptxGallery(plain));
    expect(slideText(parts, 1)).toContain('Know this.');
    expect([...parts.keys()].some((name) => /^ppt\/media\/.+\.(jpe?g|png)$/.test(name))).toBe(false);
  });
});
