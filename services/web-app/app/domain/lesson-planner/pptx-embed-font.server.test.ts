import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { kitDisplayFontFile, ttfToEot } from './pptx-embed-font.server';

const ttf = new Uint8Array(readFileSync(join(process.cwd(), 'public/lesson-planner/fonts/Fraunces-Bold.ttf')));

describe('the kit’s Fraunces Bold', () => {
  test('the file ships with the app, named so PowerPoint matches it to "Fraunces" bold', () => {
    const file = kitDisplayFontFile();
    expect(file).not.toBeNull();
    expect(file!.length).toBe(ttf.length);
  });
});

describe('ttfToEot: the font as PowerPoint embeds it (.fntdata)', () => {
  const eot = Buffer.from(ttfToEot(ttf));
  const utf16 = (text: string) => Buffer.from(text, 'utf16le');

  test('an Embedded OpenType header in front of the untouched font', () => {
    expect(eot.readUInt32LE(0)).toBe(eot.length);
    expect(eot.readUInt32LE(4)).toBe(ttf.length);
    expect(eot.readUInt32LE(8)).toBe(0x00020001);
    // Not compressed, not obfuscated.
    expect(eot.readUInt32LE(12)).toBe(0);
    expect(eot.readUInt16LE(34)).toBe(0x504c);
    expect(Buffer.compare(eot.subarray(eot.length - ttf.length), Buffer.from(ttf))).toBe(0);
  });

  test('carries the font’s own weight, embedding permission and names', () => {
    expect(eot.readUInt32LE(28)).toBe(700);
    // fsType 0: installable embedding (SIL Open Font License).
    expect(eot.readUInt16LE(32)).toBe(0);
    const familySize = eot.readUInt16LE(82);
    expect(eot.subarray(84, 84 + familySize).equals(utf16('Fraunces'))).toBe(true);
    const styleAt = 84 + familySize + 2;
    const styleSize = eot.readUInt16LE(styleAt);
    expect(eot.subarray(styleAt + 2, styleAt + 2 + styleSize).equals(utf16('Bold'))).toBe(true);
    expect(eot.includes(utf16('Fraunces Bold'))).toBe(true);
  });

  test('refuses something that is not a TrueType font', () => {
    expect(() => ttfToEot(new Uint8Array([1, 2, 3, 4]))).toThrow();
  });
});
