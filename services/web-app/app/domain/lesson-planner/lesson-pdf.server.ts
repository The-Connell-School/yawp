/**
 * The lesson packet as a real PDF file.
 *
 * "Save as PDF" used to mean the browser's print dialog with the right filename
 * suggested, which is not the same as a file. This produces the file: one
 * click, one download, text that stays selectable and searchable.
 *
 * Deliberately no headless browser. Rendering the page would mean shipping
 * Chromium in the production image — several hundred megabytes, a few hundred
 * more of memory per render, and a new way for the app server to be knocked
 * over by a big lesson. The packet is already a structured document, so it is
 * laid out directly instead, using the fonts every PDF reader already has.
 */
import PDFDocument from 'pdfkit';
import type { Block, TextRun } from './markdown-blocks';
import { markdownBlocks } from './markdown-blocks';
import type { LessonPacket } from './lesson-packet';
import { buildStudentHandout } from './student-handout';

/** Yawp's print colour, matched to the packet page's header rule. */
const BRAND = '#c05a3e';
const INK = '#1a1a1a';
const MUTED = '#6b7280';
const HAIRLINE = '#e5e7eb';

const PAGE_MARGIN = 54; // 0.75in
const BODY_SIZE = 10.5;
const LINE_GAP = 2.5;
const INDENT_STEP = 16;

type Font = 'body' | 'bold' | 'italic' | 'boldItalic' | 'mono' | 'monoBold';

const FONTS: Record<Font, string> = {
  body: 'Helvetica',
  bold: 'Helvetica-Bold',
  italic: 'Helvetica-Oblique',
  boldItalic: 'Helvetica-BoldOblique',
  mono: 'Courier',
  monoBold: 'Courier-Bold',
};

function fontFor(run: TextRun): string {
  if (run.mono) return FONTS[run.bold ? 'monoBold' : 'mono'];
  if (run.bold && run.italic) return FONTS.boldItalic;
  if (run.bold) return FONTS.bold;
  if (run.italic) return FONTS.italic;
  return FONTS.body;
}

type Doc = InstanceType<typeof PDFDocument>;

/**
 * Draw one block's runs as a single flowing paragraph.
 *
 * pdfkit continues a line when a write is marked `continued`, so a paragraph
 * with mixed weights still wraps as one paragraph rather than breaking at every
 * change of font.
 */
function writeRuns(
  doc: Doc,
  runs: TextRun[],
  {
    size,
    color = INK,
    indent = 0,
    width,
  }: { size: number; color?: string; indent?: number; width?: number }
): void {
  if (!runs.length) {
    doc.moveDown(0.4);
    return;
  }

  const usable =
    width ??
    doc.page.width - doc.page.margins.left - doc.page.margins.right - indent;

  runs.forEach((run, index) => {
    const last = index === runs.length - 1;
    doc
      .font(fontFor(run))
      .fontSize(size)
      .fillColor(run.href ? BRAND : color)
      .text(run.text, {
        continued: !last,
        width: usable,
        indent: index === 0 ? indent : 0,
        lineGap: LINE_GAP,
        underline: Boolean(run.href),
        ...(run.href ? { link: run.href } : {}),
      });
  });

  doc.fillColor(INK);
}

const HEADING_SIZE: Record<1 | 2 | 3, number> = { 1: 15, 2: 12.5, 3: 10.5 };

/** Enough room left on this page to be worth starting a block here? */
function ensureRoom(doc: Doc, needed: number): void {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + needed > bottom) doc.addPage();
}

function drawBlock(doc: Doc, block: Block): void {
  const left = doc.page.margins.left;
  const contentWidth =
    doc.page.width - doc.page.margins.left - doc.page.margins.right;

  switch (block.kind) {
    case 'heading': {
      // A heading alone at the foot of a page is a heading on the wrong page.
      ensureRoom(doc, HEADING_SIZE[block.level] * 3);
      doc.moveDown(block.level === 1 ? 0.7 : 0.55);
      const runs = block.runs.map((run) => ({ ...run, bold: true }));
      writeRuns(doc, runs, {
        size: HEADING_SIZE[block.level],
        color: block.level === 3 ? MUTED : INK,
      });
      doc.moveDown(0.25);
      break;
    }

    case 'paragraph':
      doc.moveDown(0.35);
      writeRuns(doc, block.runs, { size: BODY_SIZE });
      break;

    case 'quote': {
      doc.moveDown(0.4);
      const top = doc.y;
      writeRuns(doc, block.runs, {
        size: BODY_SIZE,
        color: '#4b5563',
        indent: 12,
        width: contentWidth - 12,
      });
      // The rule is drawn after the text so it can match its real height, and
      // only when the quote did not spill onto a new page.
      if (doc.y > top) {
        doc
          .save()
          .lineWidth(2)
          .strokeColor(`${BRAND}66`)
          .moveTo(left + 2, top)
          .lineTo(left + 2, doc.y)
          .stroke()
          .restore();
      }
      break;
    }

    case 'listItem': {
      const indent = INDENT_STEP * block.depth;
      doc.moveDown(0.2);
      const top = doc.y;
      doc
        .font(FONTS.body)
        .fontSize(BODY_SIZE)
        .fillColor(MUTED)
        .text(block.marker, left + indent, top, { width: INDENT_STEP - 4 });
      doc.y = top;
      doc.x = left;
      writeRuns(doc, block.runs, {
        size: BODY_SIZE,
        indent: indent + INDENT_STEP,
        width: contentWidth - indent - INDENT_STEP,
      });
      doc.x = left;
      break;
    }

    case 'rule':
      doc.moveDown(0.6);
      ensureRoom(doc, 12);
      doc
        .save()
        .lineWidth(0.75)
        .strokeColor(HAIRLINE)
        .moveTo(left, doc.y)
        .lineTo(left + contentWidth, doc.y)
        .stroke()
        .restore();
      doc.moveDown(0.6);
      break;

    case 'tableRow': {
      ensureRoom(doc, 30);
      const columns = Math.max(block.cells.length, 1);
      const cellWidth = contentWidth / columns;
      doc.moveDown(0.25);
      const top = doc.y;
      let tallest = top;

      block.cells.forEach((cell, index) => {
        doc.y = top;
        doc.x = left + cellWidth * index;
        const runs = block.header
          ? cell.map((run) => ({ ...run, bold: true }))
          : cell;
        writeRuns(doc, runs.length ? runs : [{ text: ' ' }], {
          size: BODY_SIZE - 0.5,
          color: block.header ? MUTED : INK,
          width: cellWidth - 8,
        });
        tallest = Math.max(tallest, doc.y);
      });

      doc.x = left;
      doc.y = tallest;
      doc
        .save()
        .lineWidth(0.5)
        .strokeColor(HAIRLINE)
        .moveTo(left, doc.y + 2)
        .lineTo(left + contentWidth, doc.y + 2)
        .stroke()
        .restore();
      doc.moveDown(0.3);
      break;
    }
  }
}

function drawMarkdown(doc: Doc, markdown: string): void {
  for (const block of markdownBlocks(markdown)) drawBlock(doc, block);
}

function drawTitle(
  doc: Doc,
  { title, subtitle }: { title: string; subtitle: string | null }
): void {
  const left = doc.page.margins.left;
  const contentWidth =
    doc.page.width - doc.page.margins.left - doc.page.margins.right;

  doc
    .font(FONTS.bold)
    .fontSize(19)
    .fillColor(INK)
    .text(title, { width: contentWidth, lineGap: 1 });

  if (subtitle) {
    doc
      .font(FONTS.body)
      .fontSize(10)
      .fillColor(MUTED)
      .text(subtitle, { width: contentWidth });
  }

  doc
    .save()
    .lineWidth(2)
    .strokeColor(BRAND)
    .moveTo(left, doc.y + 7)
    .lineTo(left + contentWidth, doc.y + 7)
    .stroke()
    .restore();
  doc.y += 14;
  doc.x = left;
}

async function finish(doc: Doc): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  doc.end();
  return new Uint8Array(await done);
}

function newDocument(title: string): Doc {
  const doc = new PDFDocument({
    size: 'LETTER',
    margin: PAGE_MARGIN,
    // Readers show these in the tab and the file properties.
    info: { Title: title, Creator: 'Yawp! Lesson Planner' },
    autoFirstPage: true,
  });
  doc.fillColor(INK).font(FONTS.body).fontSize(BODY_SIZE);
  return doc;
}

/** "English 10 · 50 min" — whatever of it is actually known. */
function packetSubtitle(packet: LessonPacket): string | null {
  const parts = [
    packet.className,
    packet.totalMinutes > 0 ? `${packet.totalMinutes} min` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

/**
 * The whole lesson: every resource the teacher filed, in order, with the
 * material kept inside a reply printed alongside it.
 */
export async function renderPacketPdf(
  packet: LessonPacket
): Promise<Uint8Array> {
  const doc = newDocument(packet.title);
  drawTitle(doc, { title: packet.title, subtitle: packetSubtitle(packet) });

  packet.sections.forEach((section, index) => {
    if (index > 0) doc.addPage();
    drawBlock(doc, {
      kind: 'heading',
      level: 1,
      runs: [{ text: section.title, bold: true }],
    });
    drawMarkdown(doc, section.content);

    for (const material of section.materials) {
      drawBlock(doc, {
        kind: 'heading',
        level: 2,
        runs: [{ text: material.title, bold: true }],
      });
      drawMarkdown(doc, material.content);
    }
  });

  return finish(doc);
}

/**
 * The student-facing half, numbered as one packet a class can be led through —
 * the same reading the packet page shows, minus whatever the teacher excluded.
 */
export async function renderHandoutPdf({
  packet,
  excluded = [],
}: {
  packet: LessonPacket;
  excluded?: string[];
}): Promise<Uint8Array> {
  const handout = buildStudentHandout({ packet, excluded });
  const doc = newDocument(handout.title);
  drawTitle(doc, { title: handout.title, subtitle: handout.className });

  // The line students write their own name on. A handout without one comes
  // back in a pile nobody can sort.
  doc
    .font(FONTS.body)
    .fontSize(9.5)
    .fillColor(MUTED)
    .text('Name: ______________________________     Date: ______________');
  doc.moveDown(0.5);

  handout.parts.forEach((part, index) => {
    if (index > 0) doc.addPage();
    drawBlock(doc, {
      kind: 'heading',
      level: 1,
      runs: [{ text: `${part.number}. ${part.title}`, bold: true }],
    });
    drawMarkdown(doc, part.content);
  });

  if (!handout.parts.length) {
    doc
      .font(FONTS.italic)
      .fontSize(BODY_SIZE)
      .fillColor(MUTED)
      .text('Nothing in this lesson is marked for students yet.');
  }

  return finish(doc);
}

/**
 * A filename a teacher can find later: the lesson's own name.
 *
 * The separator is a plain hyphen rather than the en dash the rest of this
 * codebase writes. Browsers pick the download's name out of a
 * `Content-Disposition` header, and Chromium quietly falls back to "download"
 * for the whole header when the name carries a character it does not like —
 * so the one character we control here stays firmly inside ASCII.
 */
export function pdfFilename(title: string, suffix?: string): string {
  const base = (title || 'Lesson')
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return `${base || 'Lesson'}${suffix ? ` - ${suffix}` : ''}.pdf`;
}
