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
import { classicSlide, deckDurationMinutes, type Slide, type SlideDeck } from './slide-deck';
import { deckColors, withoutColorMarks } from './deck-colors';
import { GALLERY_COLORS, galleryAccent, galleryRunningHead, planGalleryDeck, type GallerySlidePlan } from './deck-gallery';
import { deckArt } from './deck-art';
import type { SlidesPerPage } from './one-packet';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { registerKitFonts } from './kit-fonts.server';

/** The kit's ink and stone (lesson plan spec v1, "Type and color"). */
const KIT_PLAN_COLORS_HEX = { ink: '#1B1B1B', stone: '#6F6A63' } as const;

/** Yawp!'s print colour, matched to the packet page's header rule. */
const BRAND = '#c05a3e';
const INK = '#1a1a1a';
const MUTED = '#6b7280';
const HAIRLINE = '#e5e7eb';

const PAGE_MARGIN = 54; // 0.75in
const BODY_SIZE = 10.5;
const LINE_GAP = 2.5;
const INDENT_STEP = 16;
/** Room for the quote's rule plus a breath of space. */
const QUOTE_INDENT = 14;

type Font = 'body' | 'bold' | 'italic' | 'boldItalic' | 'mono' | 'monoBold';

const FONTS: Record<Font, string> = {
  body: 'Helvetica',
  bold: 'Helvetica-Bold',
  italic: 'Helvetica-Oblique',
  boldItalic: 'Helvetica-BoldOblique',
  mono: 'Courier',
  monoBold: 'Courier-Bold',
};

type Doc = InstanceType<typeof PDFDocument>;

/**
 * How a document is dressed: Yawp!'s print colour in Helvetica, or, with the
 * Lesson Deck Kit on, the lesson's own color in Georgia and Arial (Gelasio
 * and Arimo in a PDF), so a handout belongs to the same set as its deck and
 * plan.
 */
type PdfStyle = {
  fonts: Record<Font, string>;
  /** Headings and titles, when they are set in a serif. */
  serif: { regular: string; bold: string; italic: string } | null;
  brand: string;
  ink: string;
  muted: string;
};

const CLASSIC_STYLE: PdfStyle = { fonts: FONTS, serif: null, brand: BRAND, ink: INK, muted: MUTED };
const STYLES = new WeakMap<Doc, PdfStyle>();
const styleOf = (doc: Doc): PdfStyle => STYLES.get(doc) ?? CLASSIC_STYLE;

/** The Lesson Deck Kit's handouts: the lesson's color, its fonts. */
export type HandoutKit = { color: string };

/** The handout style for a lesson, from its deck's primary color; null with the kit off. */
export function handoutKit(packet: LessonPacket, flags: { deckGallery: boolean }): HandoutKit | null {
  if (!flags.deckGallery) return null;
  const deck = packet.sections.find((section) => section.deck)?.deck ?? null;
  return { color: deck ? galleryAccent(deck) : deckColors({}, null)[0]! };
}

function fontFor(doc: Doc, run: TextRun, serif = false): string {
  const { fonts, serif: serifFonts } = styleOf(doc);
  if (run.mono) return fonts[run.bold ? 'monoBold' : 'mono'];
  if (serif && serifFonts) return run.bold ? serifFonts.bold : run.italic ? serifFonts.italic : serifFonts.regular;
  if (run.bold && run.italic) return fonts.boldItalic;
  if (run.bold) return fonts.bold;
  if (run.italic) return fonts.italic;
  return fonts.body;
}

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
    color = styleOf(doc).ink,
    x,
    width,
    serif = false,
  }: { size: number; color?: string; x?: number; width?: number; serif?: boolean }
): void {
  if (!runs.length) {
    doc.moveDown(0.4);
    return;
  }

  // The left edge is set by moving the cursor, not by pdfkit's `indent` — that
  // option shifts the first line only, so an indented paragraph's second line
  // fell back to the margin and ran underneath the quote bar beside it.
  const left = x ?? doc.page.margins.left;
  const usable = width ?? doc.page.width - doc.page.margins.right - left;

  runs.forEach((run, index) => {
    const last = index === runs.length - 1;
    // Only the first write positions the block; the rest continue the line.
    if (index === 0) doc.x = left;
    doc
      .font(fontFor(doc, run, serif))
      .fontSize(size)
      .fillColor(run.href ? styleOf(doc).brand : color)
      .text(run.text, {
        continued: !last,
        width: usable,
        lineGap: LINE_GAP,
        underline: Boolean(run.href),
        ...(run.href ? { link: run.href } : {}),
      });
  });

  doc.fillColor(styleOf(doc).ink);
  doc.x = doc.page.margins.left;
}

const HEADING_SIZE: Record<1 | 2 | 3, number> = { 1: 15, 2: 12.5, 3: 10.5 };

/** Enough room left on this page to be worth starting a block here? */
function ensureRoom(doc: Doc, needed: number): void {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + needed > bottom) doc.addPage();
}

/**
 * How short a table row is allowed to be.
 *
 * Teachers build tables with empty cells for students to write in. Sized to
 * their content those rows collapse to a single line of nothing, and the
 * handout arrives with no room to answer in.
 */
const MIN_WRITABLE_ROW = 26;

/**
 * Where a table row's bottom edge goes: below its text, or far enough down to
 * leave a line worth writing on, whichever is lower. Header rows hug their
 * text — nobody writes in a header.
 */
export function tableRowBottom(
  top: number,
  contentBottom: number,
  header: boolean
): number {
  if (header) return contentBottom;
  return Math.max(contentBottom, top + MIN_WRITABLE_ROW);
}

function drawBlock(doc: Doc, block: Block, previous?: Block): void {
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
        color: block.level === 3 ? styleOf(doc).muted : styleOf(doc).ink,
        serif: true,
      });
      doc.moveDown(0.25);
      break;
    }

    case 'paragraph':
      doc.moveDown(0.35);
      writeRuns(doc, block.runs, { size: BODY_SIZE });
      break;

    case 'quote': {
      doc.moveDown(0.5);
      const top = doc.y;
      writeRuns(doc, block.runs, {
        size: BODY_SIZE,
        color: '#4b5563',
        x: left + QUOTE_INDENT,
        width: contentWidth - QUOTE_INDENT,
      });
      // The rule is drawn after the text so it can match its real height, and
      // only when the quote did not spill onto a new page.
      if (doc.y > top) {
        doc
          .save()
          .lineWidth(2)
          .strokeColor(styleOf(doc).serif ? '#D8D0C1' : `${styleOf(doc).brand}66`)
          .moveTo(left + 2, top)
          .lineTo(left + 2, doc.y)
          .stroke()
          .restore();
      }
      doc.moveDown(0.35);
      break;
    }

    case 'listItem': {
      const indent = INDENT_STEP * block.depth;
      // A list that starts straight after a paragraph needs the same breathing
      // room any other block would get; between its own items, less.
      doc.moveDown(previous?.kind === 'listItem' ? 0.2 : 0.45);
      const top = doc.y;
      doc
        .font(styleOf(doc).fonts.body)
        .fontSize(BODY_SIZE)
        .fillColor(styleOf(doc).muted)
        .text(block.marker, left + indent, top, {
          width: INDENT_STEP - 4,
          lineBreak: false,
        });
      // Back to the marker's line so the text sits beside it, and hanging —
      // a wrapped item lines up under its own text, not under the marker.
      doc.y = top;
      writeRuns(doc, block.runs, {
        size: BODY_SIZE,
        x: left + indent + INDENT_STEP,
        width: contentWidth - indent - INDENT_STEP,
      });
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
        const runs = block.header
          ? cell.map((run) => ({ ...run, bold: true }))
          : cell;
        writeRuns(doc, runs.length ? runs : [{ text: ' ' }], {
          size: BODY_SIZE - 0.5,
          color: block.header ? styleOf(doc).muted : styleOf(doc).ink,
          x: left + cellWidth * index,
          width: cellWidth - 8,
        });
        tallest = Math.max(tallest, doc.y);
      });

      doc.x = left;
      // Body rows keep a writable height even when their cells are empty.
      doc.y = tableRowBottom(top, tallest, block.header);
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
  const blocks = markdownBlocks(markdown);
  blocks.forEach((block, index) => drawBlock(doc, block, blocks[index - 1]));
}

/** "· 5 min", or nothing when the slide never claimed a length. */
function slideTiming(slide: Slide): string {
  return slide.minutes ? ` · ${slide.minutes} min` : '';
}

/** A slide's picture on paper: 6in wide, 16:9. Two slides and their notes fit a page. */
const SLIDE_WIDTH = 432;
const SLIDE_HEIGHT = (SLIDE_WIDTH * 9) / 16;

/** An image's path, from the built client or the source public folder. */
function publicFile(src: string): string | null {
  for (const root of ['build/client', 'public']) {
    const path = join(process.cwd(), root, src);
    if (existsSync(path)) return path;
  }
  return null;
}

function groundFill(plan: GallerySlidePlan, primary: string): string {
  if (plan.ground === 'pine') return GALLERY_COLORS.pine;
  if (plan.ground === 'ink') return GALLERY_COLORS.ink;
  if (plan.ground === 'accent') return primary;
  return GALLERY_COLORS.paper;
}

/**
 * One slide, drawn as the class sees it (Brian's round 3, 1.6): its ground
 * and color from the gallery plan, the running head, the mode word, the
 * headline in the serif, then what the slide shows. Vector, so it prints
 * sharp and stays small, and its words stay searchable. Every line is held
 * inside the card; what does not fit ends in an ellipsis.
 */
function drawSlideFace(
  doc: Doc,
  deck: SlideDeck,
  plan: GallerySlidePlan,
  art: { path: string } | null,
  box: { x: number; y: number; w: number; h: number }
): void {
  const primary = galleryAccent(deck);
  const light = plan.dark || plan.ground === 'accent';
  const ink = light ? '#F3F0E8' : GALLERY_COLORS.ink;
  const muted = light ? '#D9D4CC' : GALLERY_COLORS.stone;
  const accent = plan.ground === 'accent' ? '#F6E3DA' : plan.dark ? GALLERY_COLORS.accentOnDark : plan.color;
  const serif = styleOf(doc).serif?.regular ?? 'Times-Roman';
  const serifItalic = styleOf(doc).serif?.italic ?? 'Times-Italic';
  const sans = styleOf(doc).fonts.body;
  const sansBold = styleOf(doc).fonts.bold;
  const slide = plan.slide;
  const face = classicSlide(slide);
  const clean = (text: string | undefined | null) => (text ? withoutColorMarks(text).trim() : '');

  doc.save();
  doc.rect(box.x, box.y, box.w, box.h).fill(groundFill(plan, primary));
  doc.rect(box.x, box.y, box.w, box.h).clip();

  // The painting hangs on the right, cropped to its box.
  const pad = box.w * 0.06;
  let textWidth = box.w - pad * 2;
  if (art && plan.showArt) {
    const artWidth = box.w * 0.4;
    const artX = box.x + box.w - artWidth;
    try {
      // `cover` fills the box and spills past it: the clip keeps it there.
      doc.save();
      doc.rect(artX, box.y, artWidth, box.h).clip();
      doc.image(art.path, artX, box.y, { cover: [artWidth, box.h], align: 'center', valign: 'center' });
      doc.restore();
      textWidth = box.w - artWidth - pad * 2;
    } catch {
      // An image PDFKit cannot read: the slide is drawn without it.
      doc.restore();
    }
  }

  let y = box.y + pad * 0.8;
  const x = box.x + pad;
  const write = (
    text: string,
    options: { font: string; size: number; color: string; gap?: number; maxHeight?: number }
  ) => {
    if (!text) return;
    const room = Math.max(0, box.y + box.h - pad * 0.6 - y);
    const height = Math.min(options.maxHeight ?? room, room);
    if (height < options.size) return;
    doc.font(options.font).fontSize(options.size).fillColor(options.color);
    const used = Math.min(doc.heightOfString(text, { width: textWidth }), height);
    doc.text(text, x, y, { width: textWidth, height, ellipsis: true, lineGap: 1 });
    y += used + (options.gap ?? 4);
  };

  if (plan.template !== 'title') {
    write(galleryRunningHead(deck).toUpperCase(), { font: sans, size: 5.5, color: muted, gap: 8, maxHeight: 8 });
  }
  if (plan.mode) write(plan.mode, { font: serifItalic, size: 12, color: accent, gap: 4 });

  if (plan.template === 'title') {
    y = box.y + box.h * 0.32;
    write(clean(slide.title), { font: serif, size: 24, color: ink, gap: 6, maxHeight: box.h * 0.36 });
    write(clean(slide.subtitle), { font: serifItalic, size: 11, color: accent });
  } else if (slide.agenda?.length) {
    if (!plan.mode) write(clean(slide.title), { font: serif, size: 16, color: ink, gap: 8 });
    for (const item of slide.agenda) {
      const row = y;
      write(clean(item.title), { font: sans, size: 10, color: ink, gap: 0 });
      if (item.minutes) {
        doc.font(sans).fontSize(8.5).fillColor(muted).text(`${item.minutes} min`, x, row + 1, { width: textWidth, align: 'right' });
      }
      doc.moveTo(x, y + 3).lineTo(x + textWidth, y + 3).lineWidth(0.4).strokeColor(light ? '#4A5C59' : GALLERY_COLORS.rule).stroke();
      y += 7;
    }
  } else if (slide.question || face.layout === 'prompt' || face.layout === 'statement') {
    const headline = clean(slide.question ?? slide.body ?? slide.title);
    const size = headline.length > 140 ? 13 : headline.length > 70 ? 16 : 20;
    write(headline, { font: serif, size, color: ink, gap: 6 });
    const said = (text: string) => text.toLowerCase().replace(/[^\p{L}\s]/gu, '').trim();
    const title = clean(slide.title);
    if (title !== headline && said(title) !== said(plan.mode ?? '')) write(title, { font: sans, size: 7.5, color: muted });
    write(clean(slide.attribution) ? `— ${clean(slide.attribution)}` : '', { font: serifItalic, size: 8.5, color: muted });
  } else {
    write(clean(slide.title), { font: serif, size: 18, color: ink, gap: 8, maxHeight: box.h * 0.3 });
    write(clean(face.subtitle), { font: serifItalic, size: 10, color: accent });
    write(clean(face.body), { font: sans, size: 10, color: ink });
    for (const bullet of face.bullets ?? []) write(`•  ${clean(bullet)}`, { font: sans, size: 10, color: ink, gap: 3 });
    for (const column of [face.left, face.right]) {
      if (!column) continue;
      write(clean(column.label), { font: sansBold, size: 9, color: accent, gap: 1 });
      write(clean(column.text), { font: sans, size: 10, color: ink, gap: 6 });
    }
    write(clean(face.attribution) ? `— ${clean(face.attribution)}` : '', { font: serifItalic, size: 8.5, color: muted });
  }

  doc.restore();
  // A hairline around a paper slide, so it reads as a slide on white paper.
  doc.save().lineWidth(0.5).strokeColor(GALLERY_COLORS.rule).rect(box.x, box.y, box.w, box.h).stroke().restore();
}

/**
 * A deck, printed the way a teacher uses one on paper.
 *
 * Each slide as the class sees it, with what the teacher planned to say under
 * it (Brian's round 3, 1.6: "Include images of the actual slides in the PDF,
 * so a teacher can share the whole lesson with anyone"). Two slides to a
 * page; a slide never splits from its notes. Notes are set as a quote so the
 * bar down the margin tells them apart from what students see.
 */
function drawSlideDeck(doc: Doc, deck: SlideDeck, perPage: SlidesPerPage = 2): void {
  const minutes = deckDurationMinutes(deck);
  const summary = [
    `${deck.slides.length} slide${deck.slides.length === 1 ? '' : 's'}`,
    minutes > 0 ? `${minutes} min` : null,
    deck.subtitle,
  ]
    .filter(Boolean)
    .join(' · ');

  drawBlock(doc, { kind: 'rule' });
  drawBlock(doc, {
    kind: 'heading',
    level: 3,
    runs: [{ text: `Slides — ${summary}`, bold: true }],
  });

  const plans = planGalleryDeck(deck);
  const artFile = deckArt(deck.art);
  const art = artFile ? publicFile(artFile.src) : null;
  const left = doc.page.margins.left;

  if (perPage === 4) {
    drawSlideGrid(doc, deck, plans, art);
    return;
  }

  plans.forEach((plan, index) => {
    const slide = plan.slide;
    // The picture, its caption and the start of its notes stay together.
    ensureRoom(doc, SLIDE_HEIGHT + 64);
    const top = doc.y + 4;
    drawSlideFace(doc, deck, plan, art ? { path: art } : null, { x: left, y: top, w: SLIDE_WIDTH, h: SLIDE_HEIGHT });
    doc.x = left;
    doc.y = top + SLIDE_HEIGHT + 6;
    const blocks: Block[] = [
      {
        kind: 'paragraph',
        runs: [
          { text: `Slide ${index + 1} of ${deck.slides.length}`, bold: true },
          { text: `${slideTiming(slide)} · ${withoutColorMarks(slide.title)}` },
        ],
      },
      {
        kind: 'quote',
        runs: [
          { text: 'Notes: ', bold: true },
          { text: slide.speakerNotes },
        ],
      },
    ];
    blocks.forEach((block, position) => drawBlock(doc, block, blocks[position - 1]));
    doc.y += 10;
  });
}

/** A slide in the 2×2 grid: half a column wide, 16:9, its caption and notes under it. */
const GRID_GAP = 18;
const GRID_CAPTION = 64;

/**
 * Four slides to a sheet (Brian's round 4, item 5): a 2×2 grid, each slide
 * drawn as in the two-up layout and scaled down, with its number, minutes and
 * title, and the start of its notes under it. A sheet holds two rows, so a
 * new group of four starts a new sheet.
 */
function drawSlideGrid(
  doc: Doc,
  deck: SlideDeck,
  plans: GallerySlidePlan[],
  art: string | null
): void {
  const left = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const tileWidth = (width - GRID_GAP) / 2;
  const tileHeight = (tileWidth * 9) / 16;
  const rowHeight = tileHeight + GRID_CAPTION;
  const scale = tileWidth / SLIDE_WIDTH;
  const sans = styleOf(doc).fonts.body;
  const sansBold = styleOf(doc).fonts.bold;
  const bottom = () => doc.page.height - doc.page.margins.bottom;

  let top = doc.y + 6;
  for (let index = 0; index < plans.length; index += 1) {
    const column = index % 2;
    if (column === 0 && ((index > 0 && index % 4 === 0) || top + rowHeight > bottom())) {
      doc.addPage();
      top = doc.page.margins.top;
    }
    const plan = plans[index]!;
    const x = left + column * (tileWidth + GRID_GAP);

    // Drawn at full size and scaled, so the type keeps its proportions.
    doc.save();
    doc.translate(x, top);
    doc.scale(scale);
    drawSlideFace(doc, deck, plan, art ? { path: art } : null, { x: 0, y: 0, w: SLIDE_WIDTH, h: SLIDE_HEIGHT });
    doc.restore();

    const slide = plan.slide;
    let y = top + tileHeight + 4;
    doc.font(sansBold).fontSize(7.5).fillColor(styleOf(doc).ink);
    const caption = `Slide ${index + 1} of ${deck.slides.length}${slideTiming(slide)} · ${withoutColorMarks(slide.title)}`;
    doc.text(caption, x, y, { width: tileWidth, height: 10, ellipsis: true, lineBreak: false });
    y += 11;
    if (slide.speakerNotes) {
      doc.font(sans).fontSize(7).fillColor(styleOf(doc).muted);
      doc.text(withoutColorMarks(slide.speakerNotes), x, y, {
        width: tileWidth,
        height: GRID_CAPTION - 18,
        ellipsis: true,
        lineGap: 0.5,
      });
    }
    if (column === 1 || index === plans.length - 1) top += rowHeight;
  }
  doc.x = left;
  doc.y = top;
}

function drawTitle(
  doc: Doc,
  { title, subtitle }: { title: string; subtitle: string | null }
): void {
  const left = doc.page.margins.left;
  const contentWidth =
    doc.page.width - doc.page.margins.left - doc.page.margins.right;

  doc
    .font(styleOf(doc).serif?.regular ?? styleOf(doc).fonts.bold)
    .fontSize(styleOf(doc).serif ? 22 : 19)
    .fillColor(styleOf(doc).ink)
    .text(title, { width: contentWidth, lineGap: 1 });

  if (subtitle) {
    doc
      .font(styleOf(doc).fonts.body)
      .fontSize(10)
      .fillColor(styleOf(doc).muted)
      .text(subtitle, { width: contentWidth });
  }

  doc
    .save()
    .lineWidth(2)
    .strokeColor(styleOf(doc).brand)
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

function newDocument(title: string, kit?: HandoutKit | null): Doc {
  const doc = new PDFDocument({
    size: 'LETTER',
    margin: PAGE_MARGIN,
    // Readers show these in the tab and the file properties.
    info: { Title: title, Creator: 'Yawp! Lesson Planner' },
    autoFirstPage: true,
  });
  if (kit) {
    const fonts = registerKitFonts(doc);
    STYLES.set(doc, {
      fonts: { body: fonts.sans, bold: fonts.sansBold, italic: fonts.sansItalic, boldItalic: fonts.sansBold, mono: FONTS.mono, monoBold: FONTS.monoBold },
      serif: { regular: fonts.serif, bold: fonts.serifBold, italic: fonts.serifItalic },
      brand: kit.color,
      ink: KIT_PLAN_COLORS_HEX.ink,
      muted: KIT_PLAN_COLORS_HEX.stone,
    });
  }
  doc.fillColor(styleOf(doc).ink).font(styleOf(doc).fonts.body).fontSize(BODY_SIZE);
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
  packet: LessonPacket,
  { slidesPerPage = 2 }: { slidesPerPage?: SlidesPerPage } = {}
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
    if (section.deck) drawSlideDeck(doc, section.deck, slidesPerPage);

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
 * The slide deck on its own (Oct 24 handoff, task 4: the slide deck's PDF):
 * each slide, what is on it, and its notes, as the packet prints it.
 */
export async function renderSlidesPdf({
  lessonTitle,
  deck,
  perPage = 2,
}: {
  lessonTitle: string;
  deck: SlideDeck;
  /** 2 with full notes, or 4 as a 2×2 grid (Brian's round 4, item 5). */
  perPage?: SlidesPerPage;
}): Promise<Uint8Array> {
  const doc = newDocument(deck.title);
  drawTitle(doc, { title: deck.title, subtitle: lessonTitle });
  drawSlideDeck(doc, deck, perPage);
  return finish(doc);
}

/**
 * Whether a download should be rendered as a page students write on.
 *
 * The handout view obviously is. Less obviously, so is a single student-facing
 * piece downloaded on its own — a teacher saves just the warm-up or just the
 * exit ticket far more often than the whole packet, and that sheet still ends
 * up in thirty pairs of hands and has to come back sortable.
 */
export function printsForStudents({
  wantsHandout,
  singleSectionAudience,
}: {
  wantsHandout: boolean;
  singleSectionAudience?: string | null;
}): boolean {
  return wantsHandout || singleSectionAudience === 'student';
}

/**
 * The student-facing half, numbered as one packet a class can be led through —
 * the same reading the packet page shows, minus whatever the teacher excluded.
 */
export async function renderHandoutPdf({
  packet,
  excluded = [],
  only,
  kit = null,
}: {
  packet: LessonPacket;
  excluded?: string[];
  /** The Lesson Deck Kit's handout style (handoutKit), or null. */
  kit?: HandoutKit | null;
  /**
   * Render exactly one handout piece by its id, ignoring `excluded` — a
   * teacher who asked for one piece by name gets that piece, not an empty
   * document because it happened to be unchecked. Used when a teacher wants
   * pieces as separate files rather than one combined handout.
   */
  only?: string;
}): Promise<Uint8Array> {
  const handout = buildStudentHandout({
    packet,
    excluded: only ? [] : excluded,
  });
  const parts = only
    ? handout.parts.filter((part) => part.id === only)
    : handout.parts;
  const doc = newDocument(
    only ? (parts[0]?.title ?? handout.title) : handout.title,
    kit
  );
  drawTitle(doc, {
    title: only ? (parts[0]?.title ?? handout.title) : handout.title,
    subtitle: handout.className,
  });

  // The line students fill in themselves. Section belongs here as much as
  // name: a teacher running five periods collects five piles of the same
  // worksheet, and a page with only a name on it cannot be sorted back into
  // the class it came from. Given its own breathing room above and below —
  // set right against the title rule and the first heading, it read as one
  // cramped paragraph rather than a line meant to be written on.
  doc.moveDown(0.6);
  doc
    .font(styleOf(doc).fonts.body)
    .fontSize(10.5)
    .fillColor(styleOf(doc).muted)
    .text(
      'Name: _______________________     Section: ____________     Date: ____________'
    );
  doc.moveDown(1.1);

  parts.forEach((part, index) => {
    if (index > 0) doc.addPage();
    drawBlock(doc, {
      kind: 'heading',
      level: 1,
      // A lone piece isn't part of a sequence, so it gets its title alone —
      // "1. Exit Ticket" reads like something is missing when it is the whole
      // document.
      runs: [
        {
          text: only ? part.title : `${part.number}. ${part.title}`,
          bold: true,
        },
      ],
    });
    drawMarkdown(doc, part.content);
  });

  if (!parts.length) {
    doc
      .font(styleOf(doc).fonts.italic)
      .fontSize(BODY_SIZE)
      .fillColor(styleOf(doc).muted)
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

/**
 * Handouts for any step (Brian's run 3, item 8): the steps the teacher picked,
 * each as students should read it, numbered, with answer lines sized to the
 * writing it asks for.
 */
export async function renderStepHandoutPdf({
  title,
  className,
  parts,
  kit = null,
}: {
  title: string;
  className: string | null;
  parts: Array<{ id: string; title: string; content: string; lines: number }>;
  /** The Lesson Deck Kit's handout style (handoutKit), or null. */
  kit?: HandoutKit | null;
}): Promise<Uint8Array> {
  const single = parts.length === 1;
  const heading = single ? parts[0]!.title : title;
  const doc = newDocument(heading, kit);
  drawTitle(doc, { title: heading, subtitle: className });
  doc.moveDown(0.6);
  doc
    .font(styleOf(doc).fonts.body)
    .fontSize(10.5)
    .fillColor(styleOf(doc).muted)
    .text('Name: _______________________     Section: ____________     Date: ____________');
  doc.moveDown(1.1);

  parts.forEach((part, index) => {
    if (index > 0) doc.addPage();
    if (!single) {
      drawBlock(doc, {
        kind: 'heading',
        level: 1,
        runs: [{ text: `${index + 1}. ${part.title}`, bold: true }],
      });
    }
    drawMarkdown(doc, part.content);
    if (part.lines > 0) {
      doc.moveDown(0.8);
      const left = doc.page.margins.left;
      const right = doc.page.width - doc.page.margins.right;
      for (let line = 0; line < part.lines; line += 1) {
        if (doc.y + 26 > doc.page.height - doc.page.margins.bottom) doc.addPage();
        doc.y += 24;
        doc.moveTo(left, doc.y).lineTo(right, doc.y).lineWidth(0.5).strokeColor('#C9C2B8').stroke();
      }
      doc.moveDown(0.5);
    }
  });

  if (!parts.length) {
    doc
      .font(styleOf(doc).fonts.italic)
      .fontSize(BODY_SIZE)
      .fillColor(styleOf(doc).muted)
      .text('Pick the steps that go in this handout.');
  }

  return finish(doc);
}
