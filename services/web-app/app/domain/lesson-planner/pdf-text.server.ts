/**
 * Every character a PDF prints comes out as itself (Nov 22 review: the
 * speaker notes printed "mētis" as "m7F—2—2F†R6ÆPverness").
 *
 * pdfkit's built-in fonts (Helvetica, Times, Courier) only have the
 * Windows-1252 characters. Hand one anything else, a macron, a Greek word, an
 * arrow, and pdfkit writes its code as three hex digits into a stream that
 * reads two at a time, so that character and every one after it on the line
 * turn to garbage. A guarded document prints such text in Arimo or Gelasio,
 * the open fonts the Lesson Deck Kit already ships (Arimo has Helvetica's
 * measurements), and only where those files are missing spells it in
 * Windows-1252 instead ("ē" as "e"), never as garbage.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type PDFDocument from 'pdfkit';

type Doc = InstanceType<typeof PDFDocument>;

/** The non-Latin-1 characters pdfkit's built-in fonts do have (Windows-1252). */
const WIN_ANSI_EXTRA = new Set([
  402, 710, 732, 338, 339, 352, 353, 376, 381, 382, 8211, 8212, 8216, 8217, 8218, 8220, 8221, 8222, 8224, 8225, 8226,
  8230, 8240, 8249, 8250, 8364, 8482,
]);

function inWinAnsi(code: number): boolean {
  if (code === 9 || code === 10 || code === 13) return true;
  if (code >= 32 && code < 127) return true;
  if (code >= 160 && code <= 255) return true;
  return WIN_ANSI_EXTRA.has(code);
}

/** Whether every character prints in a built-in PDF font. */
export function isWinAnsi(text: string): boolean {
  for (const char of text) if (!inWinAnsi(char.codePointAt(0)!)) return false;
  return true;
}

/** Letters that do not come apart into a Latin letter and a mark. */
const SPELLED: Record<string, string> = {
  ł: 'l',
  Ł: 'L',
  đ: 'd',
  Đ: 'D',
  ħ: 'h',
  Ħ: 'H',
  ı: 'i',
  ŀ: 'l',
  Ŀ: 'L',
  ŋ: 'ng',
  ʻ: '‘',
  ʼ: '’',
  ʹ: '′',
  '′': "'",
  '″': '"',
  '‐': '-',
  '‑': '-',
  '‒': '–',
  '―': '—',
  '−': '-',
  '⁄': '/',
  '→': '->',
  '←': '<-',
  '↔': '<->',
  '⇒': '=>',
  '≤': '<=',
  '≥': '>=',
  '≠': '!=',
  '≈': '~',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  ' ': ' ',
  '​': '',
  '‌': '',
  '‍': '',
  '﻿': '',
};

/**
 * The text in Windows-1252, for a built-in font: "mētis" → "metis",
 * "Æneid", "naïve", curly quotes and dashes as they are. A last resort; a
 * guarded document embeds a font instead wherever it can.
 */
export function winAnsiText(text: string): string {
  let out = '';
  for (const char of text.normalize('NFC')) {
    const code = char.codePointAt(0)!;
    if (inWinAnsi(code)) {
      out += char;
      continue;
    }
    if (char in SPELLED) {
      out += SPELLED[char];
      continue;
    }
    const bare = char.normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (bare && isWinAnsi(bare)) {
      out += bare;
      continue;
    }
    // A mark on its own goes with its letter; a picture (an emoji) is left out.
    if (/^[̀-ͯ︀-️]$/u.test(char) || /\p{Extended_Pictographic}/u.test(char)) continue;
    out += '?';
  }
  return out;
}

/** The built-in fonts, and the open font that stands in for each. */
const STAND_INS: Record<string, string> = {
  Helvetica: 'Arimo-Regular.ttf',
  'Helvetica-Bold': 'Arimo-Bold.ttf',
  'Helvetica-Oblique': 'Arimo-Italic.ttf',
  'Helvetica-BoldOblique': 'Arimo-Bold.ttf',
  'Times-Roman': 'Gelasio-Regular.ttf',
  'Times-Bold': 'Gelasio-Bold.ttf',
  'Times-Italic': 'Gelasio-Italic.ttf',
  'Times-BoldItalic': 'Gelasio-Bold.ttf',
};

const STANDARD = new Set([
  ...Object.keys(STAND_INS),
  'Courier',
  'Courier-Bold',
  'Courier-Oblique',
  'Courier-BoldOblique',
  'Symbol',
  'ZapfDingbats',
]);

function fontFile(file: string): string | null {
  for (const root of ['build/client', 'public']) {
    const path = join(process.cwd(), root, 'lesson-planner/fonts', file);
    if (existsSync(path)) return path;
  }
  return null;
}

/** The current font's name, when it is one of pdfkit's built-in fonts. */
function standardFont(doc: Doc): string | null {
  const name = (doc as unknown as { _font?: { name?: string } })._font?.name;
  return name && STANDARD.has(name) ? name : null;
}

const GUARDED = new WeakSet<object>();

/**
 * Makes `doc.text` (and the measuring it does) safe for any character: on a
 * built-in font, text it cannot print is set in the font's open stand-in, or,
 * with no file for it, spelled in Windows-1252. Text a built-in font can
 * print is untouched, so a document reads exactly as before.
 */
export function guardPdfText(doc: Doc, { files = fontFile }: { files?: (file: string) => string | null } = {}): Doc {
  if (GUARDED.has(doc)) return doc;
  GUARDED.add(doc);
  const registered = new Map<string, string | null>();
  const standIn = (font: string): string | null => {
    if (!registered.has(font)) {
      const file = STAND_INS[font];
      const path = file ? files(file) : null;
      const name = path ? `yawp-stand-in-${font}` : null;
      if (path && name) doc.registerFont(name, path);
      registered.set(font, name);
    }
    return registered.get(font)!;
  };

  /** Runs `write` with text the current font can print. */
  const safely = <T>(text: unknown, write: (text: unknown) => T): T => {
    const font = typeof text === 'string' && !isWinAnsi(text) ? standardFont(doc) : null;
    if (!font) return write(text);
    const name = standIn(font);
    if (!name) return write(winAnsiText(text as string));
    doc.font(name);
    try {
      return write(text);
    } finally {
      doc.font(font);
    }
  };

  const text = doc.text.bind(doc) as (...args: unknown[]) => Doc;
  const widthOfString = doc.widthOfString.bind(doc) as (...args: unknown[]) => number;
  const heightOfString = doc.heightOfString.bind(doc) as (...args: unknown[]) => number;
  Object.assign(doc, {
    text: (value: unknown, ...rest: unknown[]) => safely(value, (safe) => text(safe, ...rest)),
    widthOfString: (value: unknown, ...rest: unknown[]) => safely(value, (safe) => widthOfString(safe, ...rest)),
    heightOfString: (value: unknown, ...rest: unknown[]) => safely(value, (safe) => heightOfString(safe, ...rest)),
  });
  return doc;
}
