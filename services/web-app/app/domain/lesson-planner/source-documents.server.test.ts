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
});
