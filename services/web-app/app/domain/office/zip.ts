/**
 * A zip archive reader, small enough to own.
 *
 * .pptx and .docx are both zip archives full of XML, so reading either one
 * starts here. Nothing in the repo unzips anything yet, and the alternative was
 * a dependency for what turns out to be a hundred lines of header parsing —
 * node:zlib already does the only hard part.
 *
 * Entries come out of the central directory rather than by walking local
 * headers front to back: a local header is allowed to declare its sizes as
 * zero and put them in a trailing data descriptor, which makes the front-to-back
 * walk guesswork. The central directory always has the real numbers.
 */
import { inflateRawSync } from 'node:zlib';

export type ZipEntry = {
  /** The path inside the archive, e.g. `ppt/slides/slide1.xml`. */
  name: string;
  /** Uncompressed bytes. */
  read: () => Buffer;
};

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const ZIP64_END_LOCATOR = 0x07064b50;
const ZIP64_END_OF_CENTRAL_DIRECTORY = 0x06064b50;
const CENTRAL_FILE_HEADER = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;

const STORED = 0;
const DEFLATED = 8;

/** A zip comment can be 64KB, so the trailer sits at most that far from the end. */
const MAX_TRAILER = 0xffff + 22;

export class ZipError extends Error {}

/**
 * The end-of-central-directory record, found by scanning backwards for its
 * signature. There is no other way in: the record is variable-length because of
 * its trailing comment, so its position cannot be computed.
 */
function findEndOfCentralDirectory(buffer: Buffer): number {
  const earliest = Math.max(0, buffer.length - MAX_TRAILER);
  for (let at = buffer.length - 22; at >= earliest; at -= 1) {
    if (buffer.readUInt32LE(at) === END_OF_CENTRAL_DIRECTORY) return at;
  }
  throw new ZipError('Not a zip archive: no end-of-central-directory record.');
}

/**
 * Where the central directory starts and how many entries it holds.
 *
 * A large archive parks both of those in a zip64 record and leaves 0xFFFF /
 * 0xFFFFFFFF behind as a flag in the ordinary one. Slide decks reach that size
 * more easily than they sound like they would — a deck full of photographs is
 * mostly photographs.
 */
function readDirectoryLocation(
  buffer: Buffer,
  eocd: number
): { offset: number; count: number } {
  const count = buffer.readUInt16LE(eocd + 10);
  const offset = buffer.readUInt32LE(eocd + 16);
  if (count !== 0xffff && offset !== 0xffffffff) return { offset, count };

  // The zip64 locator sits immediately before the record we just found.
  const locator = eocd - 20;
  if (locator < 0 || buffer.readUInt32LE(locator) !== ZIP64_END_LOCATOR) {
    throw new ZipError('Zip64 archive with no zip64 locator.');
  }
  const zip64 = Number(buffer.readBigUInt64LE(locator + 8));
  if (
    zip64 < 0 ||
    zip64 + 56 > buffer.length ||
    buffer.readUInt32LE(zip64) !== ZIP64_END_OF_CENTRAL_DIRECTORY
  ) {
    throw new ZipError('Zip64 end-of-central-directory record is unreadable.');
  }
  return {
    count: Number(buffer.readBigUInt64LE(zip64 + 32)),
    offset: Number(buffer.readBigUInt64LE(zip64 + 48)),
  };
}

/**
 * The zip64 extra field, which carries the real sizes and offset when the
 * 32-bit fields overflowed. Its values appear in a fixed order, but only for
 * the fields that actually overflowed, so it has to be read positionally
 * against which ones we are still missing.
 */
function readZip64Extra(
  extra: Buffer,
  needs: { size: boolean; compressedSize: boolean; offset: boolean }
): { size?: number; compressedSize?: number; offset?: number } {
  let at = 0;
  while (at + 4 <= extra.length) {
    const id = extra.readUInt16LE(at);
    const length = extra.readUInt16LE(at + 2);
    const body = extra.subarray(at + 4, at + 4 + length);
    if (id === 0x0001) {
      const found: { size?: number; compressedSize?: number; offset?: number } =
        {};
      let cursor = 0;
      const next = () => {
        const value = Number(body.readBigUInt64LE(cursor));
        cursor += 8;
        return value;
      };
      if (needs.size && cursor + 8 <= body.length) found.size = next();
      if (needs.compressedSize && cursor + 8 <= body.length) {
        found.compressedSize = next();
      }
      if (needs.offset && cursor + 8 <= body.length) found.offset = next();
      return found;
    }
    at += 4 + length;
  }
  return {};
}

function inflate(
  buffer: Buffer,
  method: number,
  start: number,
  compressedSize: number,
  size: number,
  name: string
): Buffer {
  const compressed = buffer.subarray(start, start + compressedSize);
  if (method === STORED) return compressed.subarray(0, size);
  if (method !== DEFLATED) {
    throw new ZipError(`"${name}" uses an unsupported compression method.`);
  }
  try {
    return inflateRawSync(compressed);
  } catch (cause) {
    throw new ZipError(`"${name}" could not be decompressed.`, { cause });
  }
}

/**
 * Read the archive's table of contents. Entry bodies are decompressed lazily —
 * a slide deck is mostly images, and this only ever wants the XML.
 */
export function readZip(input: Uint8Array): ZipEntry[] {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (buffer.length < 22) throw new ZipError('Not a zip archive: too short.');

  const { offset, count } = readDirectoryLocation(
    buffer,
    findEndOfCentralDirectory(buffer)
  );

  const entries: ZipEntry[] = [];
  let at = offset;
  for (let index = 0; index < count; index += 1) {
    if (at + 46 > buffer.length) break;
    if (buffer.readUInt32LE(at) !== CENTRAL_FILE_HEADER) break;

    const method = buffer.readUInt16LE(at + 10);
    let compressedSize = buffer.readUInt32LE(at + 20);
    let size = buffer.readUInt32LE(at + 24);
    const nameLength = buffer.readUInt16LE(at + 28);
    const extraLength = buffer.readUInt16LE(at + 30);
    const commentLength = buffer.readUInt16LE(at + 32);
    let headerOffset = buffer.readUInt32LE(at + 42);
    const name = buffer.toString('utf8', at + 46, at + 46 + nameLength);

    const needs = {
      size: size === 0xffffffff,
      compressedSize: compressedSize === 0xffffffff,
      offset: headerOffset === 0xffffffff,
    };
    if (needs.size || needs.compressedSize || needs.offset) {
      const extra = buffer.subarray(
        at + 46 + nameLength,
        at + 46 + nameLength + extraLength
      );
      const zip64 = readZip64Extra(extra, needs);
      size = zip64.size ?? size;
      compressedSize = zip64.compressedSize ?? compressedSize;
      headerOffset = zip64.offset ?? headerOffset;
    }

    at += 46 + nameLength + extraLength + commentLength;

    // A directory entry is a name and nothing else.
    if (name.endsWith('/')) continue;

    entries.push({
      name,
      read: () => {
        if (buffer.readUInt32LE(headerOffset) !== LOCAL_FILE_HEADER) {
          throw new ZipError(`"${name}" has no local header where it claims.`);
        }
        // The local header repeats the name and extra fields, and its extra
        // field is allowed to differ in length from the central one — so the
        // body's start has to be computed from the local header, never the
        // central one.
        const localNameLength = buffer.readUInt16LE(headerOffset + 26);
        const localExtraLength = buffer.readUInt16LE(headerOffset + 28);
        const start = headerOffset + 30 + localNameLength + localExtraLength;
        return inflate(buffer, method, start, compressedSize, size, name);
      },
    });
  }

  return entries;
}

/** The archive as a map, which is how both readers want to walk it. */
export function readZipEntries(input: Uint8Array): Map<string, ZipEntry> {
  return new Map(readZip(input).map((entry) => [entry.name, entry]));
}
