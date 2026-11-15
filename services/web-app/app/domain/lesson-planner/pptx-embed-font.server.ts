/**
 * Fraunces Bold inside a .pptx (Yawp! Lesson Deck Kit, spec v4.1: "every
 * .pptx export must embed Fraunces Bold so it shows on computers that don't
 * have it installed").
 *
 * PowerPoint keeps an embedded font as an Embedded OpenType file
 * (`ppt/fonts/*.fntdata`), listed in `<p:embeddedFontLst>` in
 * presentation.xml and joined to it by a `font` relationship. The library
 * that writes our decks has no way to add one, so the finished file is
 * opened and the font is put in.
 *
 * The font is Fraunces (SIL Open Font License 1.1) at Bold, SOFT 100,
 * WONK 1, in public/lesson-planner/fonts. Its embedding permission is
 * "installable" (fsType 0), which is what lets a teacher retype a headline.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';

/** The typeface name every renderer uses for the kit's display face. */
export const KIT_DISPLAY_TYPEFACE = 'Fraunces';
const FONT_FILE = 'Fraunces-Bold.ttf';
const FONT_PART = 'fonts/Fraunces-bold.fntdata';
const FONT_RELATIONSHIP = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/font';

let cached: Uint8Array | null | undefined;

/** Fraunces Bold as shipped with the app, or null where the file is missing. */
export function kitDisplayFontFile(): Uint8Array | null {
  if (cached !== undefined) return cached;
  cached = null;
  for (const root of ['build/client', 'public']) {
    const path = join(process.cwd(), root, 'lesson-planner/fonts', FONT_FILE);
    if (existsSync(path)) {
      cached = new Uint8Array(readFileSync(path));
      break;
    }
  }
  return cached;
}

/** Where a kit font sits on disk, for a renderer that reads it by path. */
export function kitDisplayFontPath(): string | null {
  for (const root of ['build/client', 'public']) {
    const path = join(process.cwd(), root, 'lesson-planner/fonts', FONT_FILE);
    if (existsSync(path)) return path;
  }
  return null;
}

type Table = { offset: number; length: number };

function tablesOf(font: Buffer): Map<string, Table> {
  if (font.length < 12) throw new Error('not a TrueType font: too short');
  const version = font.readUInt32BE(0);
  // 0x00010000 or "true": TrueType outlines, which is what EOT carries.
  if (version !== 0x00010000 && version !== 0x74727565) throw new Error('not a TrueType font');
  const count = font.readUInt16BE(4);
  const tables = new Map<string, Table>();
  for (let index = 0; index < count; index += 1) {
    const at = 12 + index * 16;
    tables.set(font.toString('latin1', at, at + 4), { offset: font.readUInt32BE(at + 8), length: font.readUInt32BE(at + 12) });
  }
  return tables;
}

/** A name from the font's `name` table (Windows, Unicode, US English), as UTF-16LE. */
function nameOf(font: Buffer, table: Table, nameId: number): Buffer {
  const count = font.readUInt16BE(table.offset + 2);
  const strings = table.offset + font.readUInt16BE(table.offset + 4);
  for (let index = 0; index < count; index += 1) {
    const at = table.offset + 6 + index * 12;
    const platform = font.readUInt16BE(at);
    const encoding = font.readUInt16BE(at + 2);
    const language = font.readUInt16BE(at + 4);
    if (platform !== 3 || encoding !== 1 || language !== 0x0409 || font.readUInt16BE(at + 6) !== nameId) continue;
    const length = font.readUInt16BE(at + 8);
    const start = strings + font.readUInt16BE(at + 10);
    // The font stores UTF-16BE; EOT wants it little-endian.
    return Buffer.from(font.subarray(start, start + length)).swap16();
  }
  return Buffer.alloc(0);
}

/**
 * A TrueType font as Embedded OpenType (version 2.1), neither compressed nor
 * obfuscated: a header that repeats the font's own facts (weight, embedding
 * permission, PANOSE, the ranges it covers, its names) and then the font,
 * untouched.
 */
export function ttfToEot(ttf: Uint8Array): Uint8Array {
  const font = Buffer.from(ttf);
  const tables = tablesOf(font);
  const os2 = tables.get('OS/2');
  const head = tables.get('head');
  const name = tables.get('name');
  if (!os2 || !head || !name) throw new Error('not a TrueType font: missing OS/2, head or name');

  const names = [1, 2, 5, 4].map((id) => nameOf(font, name, id));
  const prefix = Buffer.alloc(82);
  prefix.writeUInt32LE(ttf.length, 4);
  prefix.writeUInt32LE(0x00020001, 8);
  prefix.writeUInt32LE(0, 12);
  font.copy(prefix, 16, os2.offset + 32, os2.offset + 42); // PANOSE
  prefix.writeUInt8(1, 26); // DEFAULT_CHARSET
  prefix.writeUInt8(font.readUInt16BE(os2.offset + 62) & 0x01, 27); // italic
  prefix.writeUInt32LE(font.readUInt16BE(os2.offset + 4), 28); // weight
  prefix.writeUInt16LE(font.readUInt16BE(os2.offset + 8), 32); // fsType
  prefix.writeUInt16LE(0x504c, 34);
  for (let index = 0; index < 4; index += 1) prefix.writeUInt32LE(font.readUInt32BE(os2.offset + 42 + index * 4), 36 + index * 4);
  // The code page ranges arrived with OS/2 version 1.
  if (font.readUInt16BE(os2.offset) >= 1 && os2.length >= 86) {
    for (let index = 0; index < 2; index += 1) prefix.writeUInt32LE(font.readUInt32BE(os2.offset + 78 + index * 4), 52 + index * 4);
  }
  prefix.writeUInt32LE(font.readUInt32BE(head.offset + 8), 60); // checkSumAdjustment

  // Each name: its size, its bytes, then two bytes of padding. An empty root
  // string closes the header.
  const strings = Buffer.concat(
    names.flatMap((value) => {
      const size = Buffer.alloc(2);
      size.writeUInt16LE(value.length, 0);
      return [size, value, Buffer.alloc(2)];
    })
  );
  const rootString = Buffer.alloc(2);
  const eot = Buffer.concat([prefix, strings, rootString, font]);
  eot.writeUInt32LE(eot.length, 0);
  return new Uint8Array(eot);
}

const text = async (zip: JSZip, path: string) => {
  const file = zip.file(path);
  if (!file) throw new Error(`not a presentation: no ${path}`);
  return file.async('string');
};

/**
 * The presentation with one bold font embedded under `typeface`. PowerPoint
 * uses it for every run in that face; Google Slides ignores embedded fonts
 * and uses its own copy of the family.
 */
export async function embedPptxBoldFont(pptx: Uint8Array, { typeface, ttf }: { typeface: string; ttf: Uint8Array }): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(pptx);

  const relsPath = 'ppt/_rels/presentation.xml.rels';
  const rels = await text(zip, relsPath);
  const used = [...rels.matchAll(/Id="rId(\d+)"/g)].map((match) => Number(match[1]));
  const id = `rId${Math.max(0, ...used) + 1}`;
  zip.file(relsPath, rels.replace('</Relationships>', `<Relationship Id="${id}" Type="${FONT_RELATIONSHIP}" Target="${FONT_PART}"/></Relationships>`));

  const typesPath = '[Content_Types].xml';
  const types = await text(zip, typesPath);
  if (!types.includes('Extension="fntdata"')) {
    zip.file(typesPath, types.replace(/(<Types[^>]*>)/, '$1<Default Extension="fntdata" ContentType="application/x-fontdata"/>'));
  }

  // In the order the schema asks for: after the notes size, ahead of the
  // default text style.
  const presentationPath = 'ppt/presentation.xml';
  const presentation = await text(zip, presentationPath);
  const list = `<p:embeddedFontLst><p:embeddedFont><p:font typeface="${typeface}"/><p:bold r:id="${id}"/></p:embeddedFont></p:embeddedFontLst>`;
  const notesSize = presentation.match(/<p:notesSz[^>]*\/>/);
  if (!notesSize) throw new Error('not a presentation: no notes size to place the font list after');
  zip.file(
    presentationPath,
    presentation
      .replace(/<p:presentation(?![^>]*embedTrueTypeFonts)/, '<p:presentation embedTrueTypeFonts="1"')
      // Keep every character when PowerPoint saves the deck again, so a
      // teacher who retypes a headline, or the next one to open it, has them.
      .replace(/(<p:presentation[^>]*?)\s+saveSubsetFonts="[^"]*"/, '$1')
      .replace(notesSize[0], `${notesSize[0]}${list}`)
  );

  zip.file(`ppt/${FONT_PART}`, ttfToEot(ttf));
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
