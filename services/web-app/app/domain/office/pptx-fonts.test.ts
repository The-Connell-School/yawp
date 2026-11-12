import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import PptxGenJS from 'pptxgenjs';
import { embedPptxFont, ttfToEot } from './pptx-fonts';
import { readZipEntries } from './zip';

const FRAUNCES = readFileSync(join(import.meta.dir, '../../../public/lesson-planner/fonts/Fraunces-Bold.ttf'));

const utf16 = (buffer: Buffer, at: number, size: number) => buffer.subarray(at, at + size).toString('utf16le');

describe('ttfToEot', () => {
  const eot = ttfToEot(FRAUNCES);

  test('writes an Embedded OpenType header, version 2.1, uncompressed, with the font after it', () => {
    expect(eot.readUInt32LE(0)).toBe(eot.length);
    expect(eot.readUInt32LE(4)).toBe(FRAUNCES.length);
    expect(eot.readUInt32LE(8)).toBe(0x00020001);
    expect(eot.readUInt32LE(12)).toBe(0); // no compression, no XOR
    expect(eot.readUInt16LE(34)).toBe(0x504c); // the magic number
    expect(eot.subarray(eot.length - FRAUNCES.length).equals(FRAUNCES)).toBe(true);
  });

  test('carries the font’s weight, its embedding permission and its names', () => {
    expect(eot.readUInt32LE(28)).toBe(700);
    expect(eot.readUInt16LE(32)).toBe(0); // installable: may be embedded
    let at = 80;
    const names: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      expect(eot.readUInt16LE(at)).toBe(0); // padding
      const size = eot.readUInt16LE(at + 2);
      names.push(utf16(eot, at + 4, size));
      at += 4 + size;
    }
    expect(names[0]).toBe('Fraunces');
    expect(names[1]).toBe('Bold');
    expect(names[3]).toBe('Fraunces Bold');
    // Version 2.1 ends the header with an empty root string.
    expect(eot.readUInt16LE(at)).toBe(0);
    expect(eot.readUInt16LE(at + 2)).toBe(0);
    expect(at + 4).toBe(eot.length - FRAUNCES.length);
  });

  test('refuses a file that is not a TrueType font', () => {
    expect(() => ttfToEot(Buffer.from('not a font at all, really not'))).toThrow();
  });
});

describe('embedPptxFont', () => {
  async function plainDeck(): Promise<Uint8Array> {
    const pptx = new PptxGenJS();
    pptx.addSlide().addText('Develop your thesis', { x: 1, y: 1, w: 6, h: 1, fontFace: 'Fraunces', bold: true });
    return new Uint8Array((await pptx.write({ outputType: 'nodebuffer' })) as Buffer);
  }

  test('adds the font part, its type, its relationship and the embedded font list', async () => {
    const parts = readZipEntries(embedPptxFont(await plainDeck(), { typeface: 'Fraunces', bold: FRAUNCES }));
    const text = (name: string) => parts.get(name)!.read().toString('utf8');

    expect(parts.get('ppt/fonts/font1.fntdata')!.read().equals(ttfToEot(FRAUNCES))).toBe(true);
    expect(text('[Content_Types].xml')).toContain('<Default Extension="fntdata" ContentType="application/x-fontdata"/>');
    expect(text('ppt/_rels/presentation.xml.rels')).toMatch(
      /<Relationship Id="(rId\w+)" Type="http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/relationships\/font" Target="fonts\/font1\.fntdata"\/>/
    );
    const presentation = text('ppt/presentation.xml');
    const id = /Id="(rId\w+)"[^>]*relationships\/font/.exec(text('ppt/_rels/presentation.xml.rels'))![1];
    expect(presentation).toContain(`<p:embeddedFont><p:font typeface="Fraunces"`);
    expect(presentation).toContain(`<p:bold r:id="${id}"/>`);
    expect(presentation).toContain('embedTrueTypeFonts="1"');
    // The schema's order: the list comes right after the notes size.
    expect(presentation).toMatch(/<p:notesSz [^>]*\/><p:embeddedFontLst>/);
  });

  test('keeps every other part as it was', async () => {
    const before = readZipEntries(await plainDeck());
    const after = readZipEntries(embedPptxFont(await plainDeck(), { typeface: 'Fraunces', bold: FRAUNCES }));
    for (const [name, entry] of before) {
      if (['[Content_Types].xml', 'ppt/_rels/presentation.xml.rels', 'ppt/presentation.xml', 'docProps/core.xml'].includes(name)) continue;
      expect(after.get(name)!.read().equals(entry.read())).toBe(true);
    }
  });
});
