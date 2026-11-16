/**
 * Georgia and Arial in a PDF (Yawp! Lesson Deck Kit): a PDF has to carry its
 * fonts, and Georgia and Arial cannot be shipped, so it embeds Gelasio and
 * Arimo, their metric-compatible open stand-ins (SIL Open Font License,
 * public/lesson-planner/fonts). Where the files are missing, the PDF falls
 * back to the built-in Times and Helvetica rather than failing.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type PDFDocument from 'pdfkit';

export type KitPdfFonts = {
  serif: string;
  serifItalic: string;
  serifBold: string;
  sans: string;
  sansItalic: string;
  sansBold: string;
};

const FILES: Record<keyof KitPdfFonts, [file: string, fallback: string]> = {
  serif: ['Gelasio-Regular.ttf', 'Times-Roman'],
  serifItalic: ['Gelasio-Italic.ttf', 'Times-Italic'],
  serifBold: ['Gelasio-Bold.ttf', 'Times-Bold'],
  sans: ['Arimo-Regular.ttf', 'Helvetica'],
  sansItalic: ['Arimo-Italic.ttf', 'Helvetica-Oblique'],
  sansBold: ['Arimo-Bold.ttf', 'Helvetica-Bold'],
};

function fontPath(file: string): string | null {
  for (const root of ['build/client', 'public']) {
    const path = join(process.cwd(), root, 'lesson-planner/fonts', file);
    if (existsSync(path)) return path;
  }
  return null;
}

const DISPLAY_NAME = 'kit-display';
const withDisplay = new WeakSet<object>();

/**
 * Fraunces Bold on a PDF (spec v4.1 titles and headlines), registered the
 * first time a document needs it. It is open (SIL Open Font License), so the
 * PDF carries Fraunces itself; where the file is missing, Times Bold.
 */
export function registerKitDisplayFont(pdf: InstanceType<typeof PDFDocument>): string {
  const path = fontPath('Fraunces-Bold.ttf');
  if (!path) return 'Times-Bold';
  if (!withDisplay.has(pdf)) {
    pdf.registerFont(DISPLAY_NAME, path);
    withDisplay.add(pdf);
  }
  return DISPLAY_NAME;
}

/** Registers the kit's fonts on a PDF and returns the names to use. */
export function registerKitFonts(pdf: InstanceType<typeof PDFDocument>): KitPdfFonts {
  const names = {} as KitPdfFonts;
  for (const [key, [file, fallback]] of Object.entries(FILES) as Array<[keyof KitPdfFonts, [string, string]]>) {
    const path = fontPath(file);
    if (path) {
      const name = `kit-${key}`;
      pdf.registerFont(name, path);
      names[key] = name;
    } else {
      names[key] = fallback;
    }
  }
  return names;
}
