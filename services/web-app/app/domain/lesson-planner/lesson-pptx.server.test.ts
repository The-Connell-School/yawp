import { describe, expect, test } from 'bun:test';
import { inflateRawSync } from 'node:zlib';
import type { SlideDeck } from './slide-deck';
import { pptxFilename, renderDeckPptx } from './lesson-pptx.server';

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

const DECK: SlideDeck = {
  title: 'Beyond the Quote',
  subtitle: 'English 11 · Analysis that argues',
  slides: [
    {
      layout: 'title',
      title: 'Beyond the Quote',
      subtitle: 'Writing analysis that actually argues',
      speakerNotes: 'Let the title sit for a beat before you say anything.',
      minutes: 1,
    },
    {
      layout: 'compare',
      title: "What's the difference?",
      left: { label: 'Version A', text: 'The door slammed.' },
      right: { label: 'Version B', text: 'When the door slams, she is done.' },
      speakerNotes: 'Three silent minutes of writing before anyone speaks.',
      minutes: 5,
    },
    {
      layout: 'bullets',
      title: 'The three moves',
      bullets: ['Interpret', 'Connect', 'Push further'],
      speakerNotes: 'Name each move, then show it.',
      minutes: 6,
    },
    {
      layout: 'quote',
      title: 'Read it again',
      body: 'This shows that the door slammed.',
      attribution: 'a paragraph that stops too early',
      speakerNotes: 'Ask what that sentence added. Wait them out.',
    },
    {
      layout: 'steps',
      title: 'Try it',
      bullets: ['Pick a quote', 'Interpret it', 'Connect it'],
      speakerNotes: 'Circulate. Look for the ones who restate.',
      minutes: 10,
    },
    {
      layout: 'statement',
      title: 'A restatement is not analysis',
      body: 'Analysis says what the quote cannot say on its own.',
      speakerNotes: 'This is the sentence to leave up.',
    },
  ],
};

describe('renderDeckPptx', () => {
  test('produces a real PowerPoint file', async () => {
    const bytes = await renderDeckPptx(DECK);

    // Every Office Open XML file is a zip, and every zip starts "PK".
    expect(Buffer.from(bytes.subarray(0, 2)).toString()).toBe('PK');
    expect(bytes.length).toBeGreaterThan(5000);

    const parts = pptxParts(bytes);
    expect(parts.has('[Content_Types].xml')).toBe(true);
    expect(parts.has('ppt/presentation.xml')).toBe(true);
  });

  test('writes one slide per slide, and no more', async () => {
    const parts = pptxParts(await renderDeckPptx(DECK));
    const slides = [...parts.keys()].filter((name) =>
      /^ppt\/slides\/slide\d+\.xml$/.test(name)
    );

    expect(slides).toHaveLength(DECK.slides.length);
  });

  test('keeps the deck in its written order', async () => {
    const parts = pptxParts(await renderDeckPptx(DECK));

    expect(slideText(parts, 1)).toContain('Beyond the Quote');
    expect(slideText(parts, 2)).toContain("What's the difference?");
    expect(slideText(parts, 3)).toContain('The three moves');
    expect(slideText(parts, 4)).toContain('Read it again');
    expect(slideText(parts, 5)).toContain('Try it');
    expect(slideText(parts, 6)).toContain('A restatement is not analysis');
  });

  test('carries what each layout actually puts on the wall', async () => {
    const parts = pptxParts(await renderDeckPptx(DECK));

    expect(slideText(parts, 1)).toContain('Writing analysis that actually');
    // Both columns of a compare, and the labels that tell them apart.
    expect(slideText(parts, 2)).toContain('Version A');
    expect(slideText(parts, 2)).toContain('The door slammed.');
    expect(slideText(parts, 2)).toContain('Version B');
    expect(slideText(parts, 3)).toContain('Interpret');
    expect(slideText(parts, 3)).toContain('Push further');
    expect(slideText(parts, 4)).toContain('This shows that the door slammed.');
    expect(slideText(parts, 4)).toContain('a paragraph that stops too early');
    expect(slideText(parts, 5)).toContain('Pick a quote');
    expect(slideText(parts, 6)).toContain('Analysis says what the quote');
  });

  // Numbered on the wall, because "step two" is a thing a teacher says out loud.
  test('numbers the steps of a steps slide', async () => {
    const parts = pptxParts(await renderDeckPptx(DECK));
    const text = slideText(parts, 5);

    expect(text).toContain('1.');
    expect(text).toContain('3.');
  });

  /**
   * The whole reason to export rather than screenshot: the notes are the
   * lesson, and PowerPoint has a place to put them.
   */
  test('puts the speaker notes in the notes pane', async () => {
    const parts = pptxParts(await renderDeckPptx(DECK));

    expect(notesText(parts, 1)).toContain('Let the title sit for a beat');
    expect(notesText(parts, 3)).toContain('Name each move');
    expect(notesText(parts, 6)).toContain('the sentence to leave up');
  });

  test('names the file after the deck', async () => {
    const parts = pptxParts(await renderDeckPptx(DECK));
    const core = parts.get('docProps/core.xml') ?? '';

    expect(core).toContain('Beyond the Quote');
  });

  /**
   * A teacher writes "Cause & Effect" and the planner quotes text constantly.
   * An unescaped ampersand is not a cosmetic problem: PowerPoint refuses to
   * open the file at all.
   */
  test('survives the characters XML cares about', async () => {
    const bytes = await renderDeckPptx({
      title: 'Cause & Effect',
      slides: [
        {
          layout: 'statement',
          title: 'Cause & Effect <in Act 3>',
          body: 'She says "I am done" & means it.',
          speakerNotes: 'Ask why <this> matters & wait.',
        },
      ],
    });
    const parts = pptxParts(bytes);
    const xml = parts.get('ppt/slides/slide1.xml') ?? '';

    expect(xml).toContain('&amp;');
    expect(xml).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;|#)/);
    // And it reads back as what the teacher typed.
    expect(slideText(parts, 1)).toContain('Cause & Effect <in Act 3>');
    expect(notesText(parts, 1)).toContain('Ask why <this> matters & wait.');
  });

  test('a one-slide deck is still a deck', async () => {
    const parts = pptxParts(
      await renderDeckPptx({
        title: 'One',
        slides: [
          {
            layout: 'title',
            title: 'Just the one',
            speakerNotes: 'Say the thing.',
          },
        ],
      })
    );

    expect(
      [...parts.keys()].filter((name) => /slides\/slide\d+\.xml$/.test(name))
    ).toHaveLength(1);
  });
});

describe('pptxFilename', () => {
  test('names the download after the lesson', () => {
    expect(pptxFilename('Beyond the Quote')).toBe('Beyond the Quote.pptx');
  });

  test('drops the characters a filesystem will not take', () => {
    expect(pptxFilename('Quotes: "evidence"/analysis')).toBe(
      'Quotes evidenceanalysis.pptx'
    );
  });

  test('falls back rather than producing a nameless file', () => {
    expect(pptxFilename('   ')).toBe('Lesson.pptx');
  });
});
