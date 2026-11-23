import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readFixture } from '~/domain/office/fixtures';
import {
  MAX_SOURCE_BYTES,
  MAX_SOURCE_CHARS,
  readFileBytesCapped,
  readSourceDocument,
  SourceDocumentError,
} from './source-documents.server';
import { MAX_PAGE_PHOTO_BYTES, NOT_A_PAGE, pagePhotoTranscriber, pagePhotoType, readTranscription } from './page-photo.server';

const fixture = (name: string) => new Uint8Array(readFileSync(join(import.meta.dir, 'fixtures', name)));
const file = (name: string, bytes: Uint8Array | string, type = '') =>
  new File([(typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes) as Uint8Array<ArrayBuffer>], name, { type });

describe('readSourceDocument: the text of a teacher’s own document', () => {
  test('a PDF with text', async () => {
    const read = await readSourceDocument(file('reading-guide.pdf', fixture('reading-guide.pdf'), 'application/pdf'));
    expect(read.kind).toBe('pdf');
    expect(read.text).toContain('Jimmy Cross carried letters');
    expect(read.truncated).toBe(false);
  });

  test('a scanned PDF says it has no text to read, rather than an empty document', async () => {
    await expect(readSourceDocument(file('scan.pdf', fixture('scanned.pdf'), 'application/pdf'))).rejects.toThrow(
      'no text Yawp! can read'
    );
  });

  test('Word and PowerPoint, through the app’s own readers', async () => {
    const docx = await readSourceDocument(file('handout.docx', new Uint8Array(readFixture('handout.docx'))));
    expect(docx.kind).toBe('docx');
    expect(docx.text.length).toBeGreaterThan(20);
    const pptx = await readSourceDocument(file('deck.pptx', new Uint8Array(readFixture('deck.pptx'))));
    expect(pptx.kind).toBe('pptx');
    expect(pptx.text.length).toBeGreaterThan(20);
  });

  test('a deck kept whole: numbered slides, picture markers, the file and its pictures', async () => {
    const bytes = new Uint8Array(readFixture('deck-pictures.pptx'));
    const pptx = await readSourceDocument(file('elephant.pptx', bytes), { keepDeck: true });
    expect(pptx.kind).toBe('pptx');
    expect(pptx.text).toContain('Slide 1\nObserve and analyze');
    expect(pptx.text).toContain('[Picture 1: An elephant in a city street & its crowd]');
    expect(pptx.deck?.file.byteLength).toBe(bytes.byteLength);
    expect(pptx.deck?.pictures.map((picture) => picture.position)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test('without keepDeck a deck is read as before, and nothing but text is kept', async () => {
    const pptx = await readSourceDocument(file('elephant.pptx', new Uint8Array(readFixture('deck-pictures.pptx'))));
    expect(pptx.deck).toBeNull();
    expect(pptx.text).not.toContain('[Picture');
  });

  test('a deck of pictures alone is readable once its pictures are kept', async () => {
    const bytes = new Uint8Array(readFixture('deck-images-only.pptx'));
    await expect(readSourceDocument(file('pictures.pptx', bytes))).rejects.toBeInstanceOf(SourceDocumentError);
    await expect(readSourceDocument(file('pictures.pptx', bytes), { keepDeck: true })).rejects.toBeInstanceOf(
      SourceDocumentError
    );
  });

  test('keepDeck never keeps anything but a deck', async () => {
    const docx = await readSourceDocument(file('handout.docx', new Uint8Array(readFixture('handout.docx'))), {
      keepDeck: true,
    });
    expect(docx.deck).toBeNull();
  });

  test('plain text and Markdown, as written', async () => {
    const read = await readSourceDocument(file('notes.md', '# My notes\n\nStart with the letters.'));
    expect(read).toMatchObject({ kind: 'text', text: '# My notes\n\nStart with the letters.' });
  });

  test('long documents are kept to the cap and say so', async () => {
    const read = await readSourceDocument(file('novel.txt', 'word '.repeat(MAX_SOURCE_CHARS / 2)));
    expect(read.text.length).toBe(MAX_SOURCE_CHARS);
    expect(read.truncated).toBe(true);
  });

  test('streams unknown-size files and stops before 10 MB is buffered', async () => {
    const big = file('streamed.txt', new Uint8Array(MAX_SOURCE_BYTES + 1));
    Object.defineProperty(big, 'size', { value: 0 });
    await expect(readFileBytesCapped(big, MAX_SOURCE_BYTES)).rejects.toThrow('10 MB');
  });

  test('refused: other formats, empty files, too large, and a file whose bytes are not what its name says', async () => {
    await expect(readSourceDocument(file('photo.png', 'x'))).rejects.toBeInstanceOf(SourceDocumentError);
    await expect(readSourceDocument(file('empty.txt', ''))).rejects.toThrow('empty');
    await expect(readSourceDocument(file('big.txt', new Uint8Array(MAX_SOURCE_BYTES + 1)))).rejects.toThrow('10 MB');
    await expect(readSourceDocument(file('fake.pdf', 'not a pdf'))).rejects.toThrow('could not be opened');
  });

  test('a photo of the pages is read word for word, and only the words are kept (plan item 12, Nov 23)', async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
    const seen: string[] = [];
    const read = await readSourceDocument(file('pages 12-13.jpg', jpeg), {
      transcribe: async (_bytes, type) => {
        seen.push(type);
        return 'Ships at a distance have every man\'s wish on board.\n\n\n[p. 1]';
      },
    });
    expect(seen).toEqual(['image/jpeg']);
    expect(read.kind).toBe('photo');
    expect(read.text).toBe('Ships at a distance have every man\'s wish on board.\n\n[p. 1]');
    expect(read.deck).toBeNull();
  });

  test('a photo that is not of pages, too big, unreadable, or an iPhone HEIC says what to do', async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2]);
    const transcribe = async () => '';
    await expect(readSourceDocument(file('cat.jpg', jpeg), { transcribe })).rejects.toThrow("doesn't look like a photo of printed pages");
    await expect(readSourceDocument(file('huge.jpg', new Uint8Array(MAX_PAGE_PHOTO_BYTES + 1)), { transcribe })).rejects.toThrow('over 5 MB');
    await expect(readSourceDocument(file('fake.png', 'not a png'), { transcribe })).rejects.toThrow('could not be opened as a photo');
    await expect(readSourceDocument(file('IMG_0001.HEIC', jpeg), { transcribe })).rejects.toThrow('save it as a JPEG');
    await expect(
      readSourceDocument(file('page.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0])), {
        transcribe: async () => {
          throw new Error('busy');
        },
      })
    ).rejects.toThrow('Try again in a minute');
  });
});

describe('the page photo reader', () => {
  test('what a picture file is, from its first bytes', () => {
    expect(pagePhotoType(new Uint8Array([0xff, 0xd8, 0xff, 0xdb]))).toBe('image/jpeg');
    expect(pagePhotoType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d]))).toBe('image/png');
    expect(pagePhotoType(new TextEncoder().encode('RIFF1234WEBPVP8 '))).toBe('image/webp');
    expect(pagePhotoType(new TextEncoder().encode('%PDF-1.7'))).toBeNull();
  });

  test('an answer that is not a page is no text; a fenced answer is unwrapped', () => {
    expect(readTranscription(NOT_A_PAGE)).toBe('');
    expect(readTranscription('```\nThe dream is the truth.\n```')).toBe('The dream is the truth.');
  });

  test('the photo goes to the model as a picture, with nothing else of the teacher’s, and is not logged', async () => {
    let call: any = null;
    const transcribe = pagePhotoTranscriber(
      () => ({ organizationId: 'o', membershipId: 'm', route: 'r', requestId: 'q', ipHash: 'h' }) as never,
      {
        model: 'test-model',
        complete: (async (params: unknown) => {
          call = params;
          return 'Now, women forget all those things.';
        }) as never,
      }
    );
    expect(await transcribe(new Uint8Array([0xff, 0xd8, 0xff]), 'image/jpeg')).toBe('Now, women forget all those things.');
    expect(call.model).toBe('test-model');
    expect(call.logPayload).toBe('metadata-only');
    expect(call.allowFallbackProvider).toBe(false);
    expect(call.messages[0].content[0].type).toBe('image');
    expect(call.messages[0].content[0].source.media_type).toBe('image/jpeg');
  });
});
