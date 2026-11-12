/**
 * A font built into a .pptx, so the deck shows in it on a computer that does
 * not have the font installed (the Lesson Deck Kit, spec v4.1: "every .pptx
 * export must embed Fraunces Bold").
 *
 * PowerPoint keeps an embedded font as a font part, `ppt/fonts/fontN.fntdata`
 * (content type `application/x-fontdata`), in Embedded OpenType: an EOT header
 * in front of the TrueType file. The presentation lists it in
 * `<p:embeddedFontLst>` by typeface, one relationship per style, and
 * `embedTrueTypeFonts="1"` keeps PowerPoint embedding it when the teacher
 * saves. The EOT here is version 2.1, uncompressed and unobfuscated, which
 * the format allows and readers take as is.
 *
 * Only for fonts whose license allows embedding (OS/2 fsType 0): the kit's
 * Fraunces is under the SIL Open Font License.
 */
import { readZip, writeZip } from './zip';

type Table = { offset: number; length: number };

function tables(ttf: Buffer): Map<string, Table> {
  const version = ttf.readUInt32BE(0);
  if (ttf.length < 12 || (version !== 0x00010000 && version !== 0x74727565)) {
    throw new Error('Not a TrueType font.');
  }
  const count = ttf.readUInt16BE(4);
  const out = new Map<string, Table>();
  for (let i = 0; i < count; i += 1) {
    const at = 12 + i * 16;
    out.set(ttf.toString('latin1', at, at + 4), { offset: ttf.readUInt32BE(at + 8), length: ttf.readUInt32BE(at + 12) });
  }
  for (const tag of ['OS/2', 'head', 'name']) {
    if (!out.has(tag)) throw new Error(`Not a usable TrueType font: no ${tag} table.`);
  }
  return out;
}

/** A name from the name table, Windows Unicode English first, as UTF-16LE bytes. */
function nameOf(ttf: Buffer, name: Table, id: number): Buffer {
  const count = ttf.readUInt16BE(name.offset + 2);
  const strings = name.offset + ttf.readUInt16BE(name.offset + 4);
  let fallback: Buffer | null = null;
  for (let i = 0; i < count; i += 1) {
    const at = name.offset + 6 + i * 12;
    const [platform, encoding, language, nameId, length, offset] = [0, 2, 4, 6, 8, 10].map((o) => ttf.readUInt16BE(at + o)) as [
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    if (nameId !== id || platform !== 3 || encoding !== 1) continue;
    // Stored big-endian; EOT wants little-endian.
    const bytes = Buffer.from(ttf.subarray(strings + offset, strings + offset + length)).swap16();
    if (language === 0x409) return bytes;
    fallback ??= bytes;
  }
  return fallback ?? Buffer.alloc(0);
}

/** The TrueType font as Embedded OpenType, version 2.1, uncompressed. */
export function ttfToEot(input: Uint8Array): Buffer {
  const ttf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const found = tables(ttf);
  const os2 = found.get('OS/2')!.offset;
  const head = found.get('head')!.offset;
  const name = found.get('name')!;
  const os2Version = ttf.readUInt16BE(os2);

  const fixed = Buffer.alloc(80);
  fixed.writeUInt32LE(0x00020001, 8); // version 2.1
  fixed.writeUInt32LE(0, 12); // flags: no compression, no XOR
  ttf.copy(fixed, 16, os2 + 32, os2 + 42); // PANOSE
  fixed.writeUInt8(1, 26); // DEFAULT_CHARSET
  fixed.writeUInt8(ttf.readUInt16BE(os2 + 62) & 1, 27); // italic
  fixed.writeUInt32LE(ttf.readUInt16BE(os2 + 4), 28); // weight
  fixed.writeUInt16LE(ttf.readUInt16BE(os2 + 8), 32); // fsType
  fixed.writeUInt16LE(0x504c, 34); // magic number
  for (let i = 0; i < 4; i += 1) fixed.writeUInt32LE(ttf.readUInt32BE(os2 + 42 + i * 4), 36 + i * 4); // Unicode ranges
  if (os2Version >= 1) {
    fixed.writeUInt32LE(ttf.readUInt32BE(os2 + 78), 52); // code page ranges
    fixed.writeUInt32LE(ttf.readUInt32BE(os2 + 82), 56);
  }
  fixed.writeUInt32LE(ttf.readUInt32BE(head + 8), 60); // checkSumAdjustment
  // Reserved 1–4 stay zero.

  // Padding, then family, style, version and full name, each with its size.
  const names = [1, 2, 5, 4].map((id) => {
    const bytes = nameOf(ttf, name, id);
    const sized = Buffer.alloc(4);
    sized.writeUInt16LE(bytes.length, 2);
    return Buffer.concat([sized, bytes]);
  });
  // Version 2.1: padding and an empty root string.
  const root = Buffer.alloc(4);

  const header = Buffer.concat([fixed, ...names, root]);
  header.writeUInt32LE(header.length + ttf.length, 0);
  header.writeUInt32LE(ttf.length, 4);
  return Buffer.concat([header, ttf]);
}

const FONT_RELATIONSHIP = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/font';

export type EmbeddedFont = {
  /** The typeface the slides name, e.g. "Fraunces". */
  typeface: string;
  regular?: Uint8Array;
  bold?: Uint8Array;
  italic?: Uint8Array;
  boldItalic?: Uint8Array;
};

/** The .pptx with the font's styles built in. Every other part is kept as it was. */
export function embedPptxFont(pptx: Uint8Array, font: EmbeddedFont): Buffer {
  const entries = readZip(pptx).map((entry) => ({ name: entry.name, data: entry.read() }));
  const get = (name: string) => {
    const entry = entries.find((candidate) => candidate.name === name);
    if (!entry) throw new Error(`Not a presentation: no ${name}.`);
    return entry;
  };

  const styles = (['regular', 'bold', 'italic', 'boldItalic'] as const).filter((style) => font[style]);
  if (!styles.length) return Buffer.from(pptx);

  const existing = entries.filter((entry) => /^ppt\/fonts\/font\d+\.fntdata$/.test(entry.name)).length;
  const rels = get('ppt/_rels/presentation.xml.rels');
  let relsXml = rels.data.toString('utf8');
  const children: string[] = [];
  let firstEot: Buffer | null = null;
  styles.forEach((style, i) => {
    const file = `font${existing + i + 1}.fntdata`;
    const id = `rIdYawpFont${existing + i + 1}`;
    const eot = ttfToEot(font[style]!);
    firstEot ??= eot;
    entries.push({ name: `ppt/fonts/${file}`, data: eot });
    relsXml = relsXml.replace('</Relationships>', `<Relationship Id="${id}" Type="${FONT_RELATIONSHIP}" Target="fonts/${file}"/></Relationships>`);
    children.push(`<p:${style} r:id="${id}"/>`);
  });
  rels.data = Buffer.from(relsXml, 'utf8');

  const types = get('[Content_Types].xml');
  let typesXml = types.data.toString('utf8');
  if (!/Extension="fntdata"/.test(typesXml)) {
    typesXml = typesXml.replace(/(<Types[^>]*>)/, '$1<Default Extension="fntdata" ContentType="application/x-fontdata"/>');
  }
  types.data = Buffer.from(typesXml, 'utf8');

  // PANOSE, from the EOT header, so PowerPoint can match a stand-in if it must.
  // (An instanced variable font often carries none: all zeros, left out.)
  const panose = firstEot!.subarray(16, 26).toString('hex').toUpperCase();
  const panoseAttribute = /^0+$/.test(panose) ? '' : ` panose="${panose}"`;
  const listed = `<p:embeddedFont><p:font typeface="${font.typeface}"${panoseAttribute} pitchFamily="18" charset="0"/>${children.join('')}</p:embeddedFont>`;
  const presentation = get('ppt/presentation.xml');
  let xml = presentation.data.toString('utf8');
  if (xml.includes('<p:embeddedFontLst>')) {
    xml = xml.replace('</p:embeddedFontLst>', `${listed}</p:embeddedFontLst>`);
  } else {
    // The schema's order: right after the notes size.
    xml = xml.replace(/(<p:notesSz\b[^>]*\/>)/, `$1<p:embeddedFontLst>${listed}</p:embeddedFontLst>`);
  }
  if (!/embedTrueTypeFonts=/.test(xml)) xml = xml.replace(/<p:presentation\b/, '<p:presentation embedTrueTypeFonts="1"');
  presentation.data = Buffer.from(xml, 'utf8');

  return writeZip(entries);
}
