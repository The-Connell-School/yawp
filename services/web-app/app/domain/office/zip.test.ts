import { describe, expect, test } from 'bun:test';
import { deflateRawSync } from 'node:zlib';
import { readZip, readZipEntries, ZipError } from './zip';
import { readFixture } from './fixtures';

describe('readZip', () => {
  // The fixtures are built by python's zipfile, so this is read against a
  // different implementation rather than against a writer of our own.
  const entries = readZipEntries(readFixture('deck.pptx'));

  test('lists what is in the archive', () => {
    expect([...entries.keys()]).toContain('ppt/presentation.xml');
    expect([...entries.keys()]).toContain('ppt/slides/slide1.xml');
    expect([...entries.keys()]).toContain('ppt/notesSlides/notesSlide1.xml');
  });

  test('inflates a deflated entry', () => {
    const xml = entries.get('ppt/slides/slide1.xml')!.read().toString('utf8');
    expect(xml).toContain('Why some quotes land');
    expect(xml.startsWith('<?xml')).toBe(true);
  });

  test('reads a stored entry too', () => {
    // [Content_Types].xml is written uncompressed in the fixture on purpose.
    const xml = entries.get('[Content_Types].xml')!.read().toString('utf8');
    expect(xml).toContain('content-types');
  });

  test('leaves directory entries out', () => {
    expect([...entries.keys()].some((name) => name.endsWith('/'))).toBe(false);
  });

  test('reads bodies only when asked', () => {
    // The table of contents is cheap; a deck is mostly images we never want.
    const listed = readZip(readFixture('deck.pptx'));
    expect(listed.length).toBeGreaterThan(5);
    expect(typeof listed[0]!.read).toBe('function');
  });
});

describe('readZip — things that are not archives', () => {
  test('says so for a file that is too short', () => {
    expect(() => readZip(new Uint8Array([1, 2, 3]))).toThrow(ZipError);
  });

  test('says so for a file with no trailer', () => {
    expect(() => readZip(Buffer.alloc(4096, 0x41))).toThrow(
      /no end-of-central-directory/
    );
  });

  test('does not mistake a PDF for a zip', () => {
    const pdf = Buffer.concat([
      Buffer.from('%PDF-1.7\n'),
      Buffer.alloc(2048, 0x20),
      Buffer.from('%%EOF\n'),
    ]);
    expect(() => readZip(pdf)).toThrow(ZipError);
  });

  test('reports the entry it could not decompress rather than throwing raw', () => {
    // A truncated deflate stream: the header is fine, the body is not.
    const broken = buildOneEntryZip('word/document.xml', (body) =>
      deflateRawSync(body).subarray(0, 4)
    );
    expect(() =>
      readZipEntries(broken).get('word/document.xml')!.read()
    ).toThrow(/could not be decompressed/);
  });
});

/**
 * A minimal one-entry archive, hand-built so a corrupt body can be planted in
 * it. Only the failure tests need this; the good paths use the real fixtures.
 */
function buildOneEntryZip(
  name: string,
  compress: (body: Buffer) => Buffer
): Buffer {
  const body = Buffer.from('<w:document/>');
  const compressed = compress(body);
  const nameBytes = Buffer.from(name, 'utf8');

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8); // deflated
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(body.length, 22);
  local.writeUInt16LE(nameBytes.length, 26);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(body.length, 24);
  central.writeUInt16LE(nameBytes.length, 28);
  central.writeUInt32LE(0, 42);

  const directoryAt = local.length + nameBytes.length + compressed.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + nameBytes.length, 12);
  end.writeUInt32LE(directoryAt, 16);

  return Buffer.concat([local, nameBytes, compressed, central, nameBytes, end]);
}
