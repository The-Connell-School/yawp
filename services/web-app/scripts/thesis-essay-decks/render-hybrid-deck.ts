/**
 * Renders a hybrid Thesis-Driven Essay deck to PowerPoint.
 *
 * Built the way the lesson planner's tile renderer is (PR #437,
 * `lesson-pptx-tile.server.ts`): one 16:9 master with the YAWP! wordmark and
 * slide number, a mono eyebrow over a serif title, content on raised paper
 * tiles. Brian's decks add the colour: accent bands and numerals cycle his
 * teal, sunshine, coral, orange and pink; his icon bubbles and confetti dots
 * sit at the edges; key words wear his yellow highlighter.
 *
 * Every slide is ordinary shapes and text boxes, so a teacher can edit,
 * delete and add slides in PowerPoint or Google Slides.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import PptxGenJS from 'pptxgenjs';
import type { AssetImage, HybridDeck, HybridSlide } from './deck-types';
import { type AccentColor, accentAt, HYBRID as T, type IconName } from './hybrid-theme';

const ASSETS = join(import.meta.dir, 'assets');

/** Pixel sizes of the bundled images, for aspect ratios. */
export const ASSET_SIZES: Record<AssetImage, { w: number; h: number }> = {
  'fallen-man.jpg': { w: 1200, h: 801 },
  'elephant.png': { w: 2048, h: 1335 },
  'critical-essay-form.png': { w: 1545, h: 2000 },
  'yawp-editor-prewriting.png': { w: 2880, h: 1720 },
  'yawp-editor-thesis.png': { w: 2880, h: 1720 },
  'yawp-editor-introduction.png': { w: 2880, h: 1720 },
  'yawp-editor-body.png': { w: 2880, h: 1720 },
  'yawp-editor-conclusion.png': { w: 2880, h: 1720 },
  'yawp-my-documents.png': { w: 1485, h: 403 },
};

const LAYOUT = { name: 'YAWP_HYBRID_16x9', width: 13.333, height: 7.5 };
const MASTER = 'YAWP_HYBRID';
const W = LAYOUT.width;
const H = LAYOUT.height;
const MARGIN = 0.75;
const CONTENT_WIDTH = W - MARGIN * 2;
const BODY_TOP = 2.15;
const BODY_BOTTOM = H - 0.85;
const BODY_HEIGHT = BODY_BOTTOM - BODY_TOP;

type PptxSlide = ReturnType<PptxGenJS['addSlide']>;
type Box = { x: number; y: number; w: number; h: number };
type TextRun = { text: string; options?: PptxGenJS.TextPropsOptions };

// ---------------------------------------------------------------------------
// Rich text: `==highlight==` and `**accent bold**`.

export interface Segment {
  text: string;
  highlight?: boolean;
  strong?: boolean;
  italic?: boolean;
}

export function parseMarks(source: string): Segment[] {
  const segments: Segment[] = [];
  const pattern = /==(.+?)==|\*\*(.+?)\*\*|__(.+?)__/g;
  let last = 0;
  for (const match of source.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) segments.push({ text: source.slice(last, index) });
    if (match[1] !== undefined) segments.push({ text: match[1], highlight: true });
    else if (match[2] !== undefined) segments.push({ text: match[2], strong: true });
    else segments.push({ text: match[3], italic: true });
    last = index + match[0].length;
  }
  if (last < source.length) segments.push({ text: source.slice(last) });
  return segments;
}

/** The words alone, marks removed: for measuring and for tests. */
export function plain(source: string): string {
  return parseMarks(source)
    .map((segment) => segment.text)
    .join('');
}

function runs(source: string, accent: AccentColor, extra: PptxGenJS.TextPropsOptions = {}): TextRun[] {
  return parseMarks(source).map((segment) => ({
    text: segment.text,
    options: {
      ...extra,
      ...(segment.highlight ? { highlight: T.highlighter } : {}),
      ...(segment.strong ? { bold: true, color: T[accent] } : {}),
      ...(segment.italic ? { italic: true } : {}),
    },
  }));
}

/** Paragraphs of rich text, one per line, each optionally bulleted. */
function paragraphs(
  lines: string[],
  accent: AccentColor,
  options: { bullet?: boolean; gapAfter?: number } = {}
): TextRun[] {
  return lines.flatMap((line, lineIndex) => {
    const lineRuns = runs(line, accent);
    const last = lineRuns.length - 1;
    return lineRuns.map((run, runIndex) => ({
      text: run.text,
      options: {
        ...run.options,
        ...(runIndex === 0 && options.bullet
          ? { bullet: { code: '25CF' }, indentLevel: 0 }
          : {}),
        ...(runIndex === 0 && options.gapAfter ? { paraSpaceAfter: options.gapAfter } : {}),
        ...(runIndex === last && lineIndex < lines.length - 1 ? { breakLine: true } : {}),
      },
    }));
  });
}

// ---------------------------------------------------------------------------
// Pieces.

function addCard(slide: PptxSlide, box: Box, band?: AccentColor, fill: string = T.paper): void {
  slide.addShape('roundRect', {
    ...box,
    rectRadius: 0.14,
    fill: { color: fill },
    line: { color: T.rule, width: 0.75 },
    shadow: { type: 'outer', color: T.ink, opacity: 0.12, blur: 10, offset: 3, angle: 90 },
  });
  if (band) {
    // Brian's colour as a strip across the top of a raised tile.
    slide.addShape('rect', {
      x: box.x + 0.14,
      y: box.y,
      w: box.w - 0.28,
      h: 0.1,
      fill: { color: T[band] },
      line: { color: T[band], width: 0 },
    });
  }
}

function addDot(slide: PptxSlide, x: number, y: number, d: number, color: string): void {
  slide.addShape('ellipse', { x, y, w: d, h: d, fill: { color }, line: { color, width: 0 } });
}

/** One of Brian's bubbles: a coloured circle with a white line icon in it. */
function addBubble(
  slide: PptxSlide,
  icon: IconName,
  x: number,
  y: number,
  d: number,
  color: AccentColor
): void {
  addDot(slide, x, y, d, T[color]);
  const inset = d * 0.2;
  slide.addImage({
    path: join(ASSETS, 'icons', `${icon}.png`),
    x: x + inset,
    y: y + inset,
    w: d - inset * 2,
    h: d - inset * 2,
  });
}

/** The small bubble cluster in the top corner of a content slide. */
function addCornerCluster(slide: PptxSlide, icon: IconName, accent: AccentColor): void {
  const d = 0.95;
  const x = W - MARGIN - d;
  const y = 0.5;
  addBubble(slide, icon, x, y, d, accent);
  addDot(slide, x - 0.32, y + 0.08, 0.2, T[accentAt(ACCENT_OFFSET[accent] + 2)]);
  addDot(slide, x + d - 0.05, y + d - 0.02, 0.14, T[accentAt(ACCENT_OFFSET[accent] + 3)]);
}

const ACCENT_OFFSET: Record<AccentColor, number> = {
  teal: 0,
  sunshine: 1,
  coral: 2,
  orange: 3,
  pink: 4,
};

function titleSize(title: string): number {
  const length = plain(title).length;
  if (length > 80) return 26;
  if (length > 34) return 30;
  return 36;
}

function addHeading(slide: PptxSlide, spec: HybridSlide, accent: AccentColor): void {
  const width = CONTENT_WIDTH - 1.6;
  slide.addText(spec.eyebrow.toUpperCase(), {
    x: MARGIN,
    y: 0.55,
    w: width,
    h: 0.35,
    fontFace: T.mono,
    fontSize: 12,
    bold: true,
    color: T[accent],
    charSpacing: 2,
    valign: 'bottom',
    margin: 0,
  });
  if ('title' in spec) {
    slide.addText(runs(spec.title, accent), {
      x: MARGIN,
      y: 0.95,
      w: width,
      h: 1.05,
      fontFace: T.serif,
      fontSize: titleSize(spec.title),
      color: T.ink,
      valign: 'top',
      margin: 0,
    });
  }
}

function imageBox(image: AssetImage, maxW: number, maxH: number): { w: number; h: number } {
  const { w, h } = ASSET_SIZES[image];
  const scale = Math.min(maxW / w, maxH / h);
  return { w: w * scale, h: h * scale };
}

/** A photo or figure framed on a raised tile. */
function addFramedImage(slide: PptxSlide, image: AssetImage, box: Box): void {
  addCard(slide, box);
  const pad = 0.14;
  slide.addImage({
    path: join(ASSETS, image),
    x: box.x + pad,
    y: box.y + pad,
    w: box.w - pad * 2,
    h: box.h - pad * 2,
    rounding: false,
  });
}

// ---------------------------------------------------------------------------
// Layouts.

function addTitleSlide(slide: PptxSlide, spec: Extract<HybridSlide, { layout: 'title' }>): void {
  const panel = 5.1;
  slide.addShape('rect', { x: 0, y: 0, w: panel, h: H, fill: { color: T.teal }, line: { color: T.teal, width: 0 } });

  // Brian's big white circle with the wordmark, and his bubbles around it.
  const d = 3.4;
  const cx = (panel - d) / 2;
  const cy = (H - d) / 2;
  slide.addShape('ellipse', {
    x: cx,
    y: cy,
    w: d,
    h: d,
    fill: { color: T.paper },
    line: { color: T.paper, width: 0 },
    shadow: { type: 'outer', color: T.ink, opacity: 0.18, blur: 14, offset: 4, angle: 90 },
  });
  slide.addText('YAWP!', {
    x: cx,
    y: cy + 1.0,
    w: d,
    h: 1.0,
    fontFace: T.serif,
    fontSize: 60,
    bold: true,
    color: T.ink,
    align: 'center',
    valign: 'middle',
    margin: 0,
  });
  slide.addText('WRITING PROGRAM', {
    x: cx,
    y: cy + 2.0,
    w: d,
    h: 0.4,
    fontFace: T.mono,
    fontSize: 12,
    bold: true,
    charSpacing: 3,
    color: T.terracotta,
    align: 'center',
    margin: 0,
  });
  addBubble(slide, 'lightbulb', cx + d - 1.0, cy - 0.55, 1.45, 'sunshine');
  addBubble(slide, 'puzzle', cx - 0.45, cy + 0.15, 1.0, 'orange');
  addBubble(slide, 'thumbs', cx + 0.05, cy + d - 0.85, 1.15, 'coral');
  addDot(slide, cx - 0.2, cy + 1.45, 0.28, T.paper);
  addDot(slide, cx + d + 0.05, cy + 1.2, 0.36, T.pink);
  addDot(slide, cx + d - 0.55, cy + d + 0.1, 0.5, T.orange);
  addDot(slide, cx + d - 1.35, cy + d + 0.35, 0.16, T.sunshine);
  addDot(slide, cx + 1.25, cy + d + 0.25, 0.2, T.paper);

  const x = panel + 0.8;
  const w = W - x - MARGIN;
  slide.addText(spec.eyebrow.toUpperCase(), {
    x,
    y: 2.25,
    w,
    h: 0.4,
    fontFace: T.mono,
    fontSize: 13,
    bold: true,
    charSpacing: 2,
    color: T.teal,
    margin: 0,
  });
  slide.addText([{ text: spec.title, options: { highlight: T.highlighter } }], {
    x,
    y: 2.7,
    w,
    h: 1.5,
    fontFace: T.serif,
    fontSize: spec.title.length > 12 ? 46 : 66,
    color: T.ink,
    valign: 'middle',
    margin: 0,
  });
  slide.addText(spec.subtitle, {
    x,
    y: 4.3,
    w,
    h: 0.7,
    fontFace: T.sans,
    fontSize: 22,
    color: T.muted,
    valign: 'top',
    margin: 0,
  });
  // Brian's five colours as a row of dots: the deck's palette, said once.
  ['teal', 'sunshine', 'coral', 'orange', 'pink'].forEach((color, index) => {
    addDot(slide, x + index * 0.42, 5.25, 0.26, T[color as AccentColor]);
  });
}

function addSectionSlide(slide: PptxSlide, spec: Extract<HybridSlide, { layout: 'section' }>): void {
  slide.background = { color: T.tealSoft };
  const d = 5.4;
  const cx = (W - d) / 2;
  const cy = (H - d) / 2;
  slide.addShape('ellipse', {
    x: cx,
    y: cy,
    w: d,
    h: d,
    fill: { color: T.paper },
    line: { color: T.paper, width: 0 },
    shadow: { type: 'outer', color: T.ink, opacity: 0.14, blur: 16, offset: 4, angle: 90 },
  });
  slide.addText(spec.kicker.toUpperCase(), {
    x: cx,
    y: cy + 1.45,
    w: d,
    h: 0.5,
    fontFace: T.mono,
    fontSize: 16,
    bold: true,
    charSpacing: 3,
    color: T.teal,
    align: 'center',
    margin: 0,
  });
  slide.addText([{ text: spec.title, options: { highlight: T.highlighter } }], {
    x: cx,
    y: cy + 1.95,
    w: d,
    h: 1.25,
    fontFace: T.serif,
    fontSize: spec.title.length > 18 ? 36 : spec.title.length > 14 ? 40 : 58,
    color: T.ink,
    align: 'center',
    valign: 'middle',
    margin: 0,
  });
  if (spec.line) {
    slide.addText(spec.line, {
      x: cx + 0.8,
      y: cy + 3.3,
      w: d - 1.6,
      h: 0.9,
      fontFace: T.sans,
      fontSize: 18,
      italic: true,
      color: T.muted,
      align: 'center',
      valign: 'top',
      margin: 0,
    });
  }
  addBubble(slide, 'lightbulb', cx + d - 1.1, cy - 0.35, 1.55, 'sunshine');
  addBubble(slide, 'puzzle', cx - 0.75, cy + 0.55, 1.1, 'orange');
  addBubble(slide, 'thumbs', cx + 0.1, cy + d - 1.2, 1.3, 'coral');
  addDot(slide, cx - 0.55, cy + 1.95, 0.3, T.paper);
  addDot(slide, cx + d + 0.15, cy + 1.6, 0.48, T.pink);
  addDot(slide, cx + d + 0.45, cy + 1.2, 0.16, T.paper);
  addDot(slide, cx + d - 1.0, cy + d - 0.15, 0.5, T.pink);
  addDot(slide, cx + d - 0.3, cy + d + 0.1, 0.7, T.orange);
  addDot(slide, cx - 0.35, cy + d - 1.55, 0.4, T.orange);
  addDot(slide, cx + 1.3, cy + d - 0.05, 0.24, T.teal);
}

function addStatementSlide(slide: PptxSlide, spec: Extract<HybridSlide, { layout: 'statement' }>, accent: AccentColor): void {
  addHeading(slide, spec, accent);
  const d = 2.4;
  const iconX = MARGIN + 0.4;
  const iconY = BODY_TOP + (BODY_HEIGHT - d) / 2;
  if (spec.icon) {
    addBubble(slide, spec.icon, iconX, iconY, d, accent);
    addDot(slide, iconX + d - 0.2, iconY - 0.1, 0.34, T[accentAt(ACCENT_OFFSET[accent] + 2)]);
    addDot(slide, iconX - 0.15, iconY + d - 0.35, 0.22, T[accentAt(ACCENT_OFFSET[accent] + 4)]);
  }
  const x = spec.icon ? iconX + d + 0.7 : MARGIN + 0.8;
  const length = plain(spec.body).length;
  slide.addText(runs(spec.body, accent), {
    x,
    y: BODY_TOP,
    w: W - MARGIN - x,
    h: BODY_HEIGHT,
    fontFace: T.serif,
    fontSize: length > 200 ? 26 : length > 90 ? 32 : 40,
    color: T.ink,
    valign: 'middle',
    lineSpacingMultiple: 1.15,
    margin: 0,
  });
}

function addStepsSlide(slide: PptxSlide, spec: Extract<HybridSlide, { layout: 'steps' }>, accent: AccentColor): void {
  addHeading(slide, spec, accent);
  addCornerCluster(slide, 'pencil', accent);
  let top = BODY_TOP;
  if (spec.intro) {
    slide.addText(runs(spec.intro, accent), {
      x: MARGIN,
      y: top - 0.05,
      w: CONTENT_WIDTH,
      h: 0.95,
      fontFace: T.sans,
      fontSize: 22,
      color: T.ink,
      valign: 'top',
      margin: 0,
    });
    top += 1.1;
  }
  if (spec.strip) {
    addStepsWithStrip(slide, spec, accent, spec.strip, top);
    return;
  }
  const count = spec.items.length;
  const gap = 0.35;
  // Four long steps read better as a 2 x 2 grid of wide tiles.
  const longest = Math.max(...spec.items.map((item) => plain(item).length));
  const perRow = count === 4 && longest > 60 ? 2 : count;
  const rows = Math.ceil(count / perRow);
  const w = (CONTENT_WIDTH - gap * (perRow - 1)) / perRow;
  const h = rows > 1 ? (BODY_BOTTOM - top - gap * (rows - 1)) / rows : Math.min(BODY_BOTTOM - top, 4.1);
  const grid = rows > 1;
  spec.items.forEach((item, index) => {
    const color = accentAt(ACCENT_OFFSET[accent] + index);
    const x = MARGIN + (index % perRow) * (w + gap);
    const y = top + Math.floor(index / perRow) * (h + gap);
    addCard(slide, { x, y, w, h }, color);
    if (grid) {
      addDot(slide, x + 0.3, y + 0.35, 0.6, T[color]);
      slide.addText(String(index + 1), {
        x: x + 0.3,
        y: y + 0.35,
        w: 0.6,
        h: 0.6,
        fontFace: T.serif,
        fontSize: 22,
        bold: true,
        color: T.paper,
        align: 'center',
        valign: 'middle',
        margin: 0,
      });
      slide.addText(runs(item, color), {
        x: x + 1.15,
        y: y + 0.25,
        w: w - 1.45,
        h: h - 0.45,
        fontFace: T.sans,
        fontSize: longest > 110 ? 18 : 20,
        color: T.ink,
        valign: 'top',
        margin: 0,
      });
      return;
    }
    addDot(slide, x + 0.35, top + 0.4, 0.8, T[color]);
    slide.addText(String(index + 1), {
      x: x + 0.35,
      y: top + 0.4,
      w: 0.8,
      h: 0.8,
      fontFace: T.serif,
      fontSize: 30,
      bold: true,
      color: T.paper,
      align: 'center',
      valign: 'middle',
      margin: 0,
    });
    slide.addText(runs(item, color), {
      x: x + 0.35,
      y: top + 1.4,
      w: w - 0.7,
      h: h - 1.6,
      fontFace: T.sans,
      fontSize: count > 3 ? 22 : 26,
      color: T.ink,
      valign: 'top',
      margin: 0,
    });
  });
}

/** Steps as a numbered 2-column list, with a real YAWP! screenshot under them. */
function addStepsWithStrip(
  slide: PptxSlide,
  spec: Extract<HybridSlide, { layout: 'steps' }>,
  accent: AccentColor,
  strip: AssetImage,
  top: number
): void {
  const colGap = 0.5;
  const colW = (CONTENT_WIDTH - colGap) / 2;
  const rowH = 0.95;
  spec.items.forEach((item, index) => {
    const color = accentAt(ACCENT_OFFSET[accent] + index);
    const x = MARGIN + (index % 2) * (colW + colGap);
    const y = top + Math.floor(index / 2) * rowH;
    addDot(slide, x, y + 0.12, 0.6, T[color]);
    slide.addText(String(index + 1), {
      x,
      y: y + 0.12,
      w: 0.6,
      h: 0.6,
      fontFace: T.serif,
      fontSize: 22,
      bold: true,
      color: T.paper,
      align: 'center',
      valign: 'middle',
      margin: 0,
    });
    slide.addText(runs(item, color), {
      x: x + 0.8,
      y,
      w: colW - 0.8,
      h: rowH - 0.05,
      fontFace: T.sans,
      fontSize: 20,
      color: T.ink,
      valign: 'middle',
      margin: 0,
    });
  });
  const listBottom = top + Math.ceil(spec.items.length / 2) * rowH;
  const pad = 0.28;
  const size = imageBox(strip, CONTENT_WIDTH - pad, BODY_BOTTOM - listBottom - 0.25 - pad);
  addFramedImage(slide, strip, {
    x: (W - size.w - pad) / 2,
    y: BODY_BOTTOM - size.h - pad,
    w: size.w + pad,
    h: size.h + pad,
  });
}

function addPhotoSlide(slide: PptxSlide, spec: Extract<HybridSlide, { layout: 'photo' }>, accent: AccentColor): void {
  addHeading(slide, spec, accent);
  if (spec.icon) addCornerCluster(slide, spec.icon, accent);
  const size = imageBox(spec.image, 7.4, BODY_HEIGHT + 0.1);
  addFramedImage(slide, spec.image, { x: MARGIN, y: BODY_TOP - 0.05, ...size });
  const x = MARGIN + size.w + 0.55;
  const w = W - MARGIN - x;
  const many = spec.lines.length > 2;
  if (many) {
    const rowH = BODY_HEIGHT / spec.lines.length;
    spec.lines.forEach((line, index) => {
      const color = accentAt(ACCENT_OFFSET[accent] + index);
      const y = BODY_TOP + index * rowH;
      addDot(slide, x, y + (rowH - 0.42) / 2, 0.42, T[color]);
      slide.addText(runs(line, color), {
        x: x + 0.62,
        y,
        w: w - 0.62,
        h: rowH,
        fontFace: T.serif,
        fontSize: 24,
        color: T.ink,
        valign: 'middle',
        margin: 0,
      });
    });
    return;
  }
  slide.addText(
    spec.lines.map((line, index) => ({
      text: plain(line),
      options: {
        fontFace: index === 0 ? T.serif : T.sans,
        fontSize: index === 0 ? 40 : 20,
        color: index === 0 ? T.ink : T.muted,
        ...(index === 0 ? { highlight: T.highlighter } : {}),
        breakLine: index < spec.lines.length - 1,
        paraSpaceAfter: 14,
      },
    })),
    { x, y: BODY_TOP, w, h: BODY_HEIGHT, valign: 'middle', margin: 0 }
  );
}

function addQuoteSlide(slide: PptxSlide, spec: Extract<HybridSlide, { layout: 'quote' }>, accent: AccentColor): void {
  addHeading(slide, spec, accent);
  const photoW = spec.image ? 3.3 : 0;
  const box = { x: MARGIN, y: BODY_TOP - 0.05, w: CONTENT_WIDTH - (photoW ? photoW + 0.45 : 0), h: BODY_HEIGHT + 0.1 };
  addCard(slide, box, accent);
  slide.addText('“', {
    x: box.x + 0.3,
    y: box.y + 0.15,
    w: 1.1,
    h: 1.2,
    fontFace: T.serif,
    fontSize: 96,
    color: T[accent],
    valign: 'top',
    margin: 0,
  });
  slide.addText(runs(spec.body, accent), {
    x: box.x + 1.25,
    y: box.y + 0.4,
    w: box.w - 1.75,
    h: box.h - 1.45,
    fontFace: T.serif,
    fontSize: plain(spec.body).length > 300 ? 19 : 26,
    italic: true,
    color: T.ink,
    valign: 'middle',
    lineSpacingMultiple: 1.2,
    margin: 0,
  });
  slide.addText(`— ${spec.attribution}`, {
    x: box.x + 1.25,
    y: box.y + box.h - 0.85,
    w: box.w - 1.75,
    h: 0.5,
    fontFace: T.sans,
    fontSize: 18,
    color: T.muted,
    margin: 0,
  });
  if (spec.image) {
    const size = imageBox(spec.image, photoW, box.h);
    addFramedImage(slide, spec.image, {
      x: W - MARGIN - size.w,
      y: box.y + (box.h - size.h) / 2,
      ...size,
    });
    addBubble(slide, 'eye', W - MARGIN - 0.75, box.y + (box.h - size.h) / 2 - 0.45, 0.85, 'teal');
  }
}

function addPromptSlide(slide: PptxSlide, spec: Extract<HybridSlide, { layout: 'prompt' }>, accent: AccentColor): void {
  addHeading(slide, spec, accent);
  addCornerCluster(slide, 'puzzle', accent);
  const box = { x: MARGIN, y: BODY_TOP - 0.05, w: CONTENT_WIDTH, h: BODY_HEIGHT + 0.1 };
  addCard(slide, box, accent);
  // The option as a pill, the way a class tile carries its label.
  slide.addShape('roundRect', {
    x: box.x + 0.45,
    y: box.y + 0.38,
    w: 4.2,
    h: 0.46,
    rectRadius: 0.23,
    fill: { color: T[accent] },
    line: { color: T[accent], width: 0 },
  });
  slide.addText(spec.label.toUpperCase(), {
    x: box.x + 0.45,
    y: box.y + 0.38,
    w: 4.2,
    h: 0.46,
    fontFace: T.mono,
    fontSize: 12,
    bold: true,
    charSpacing: 1.5,
    color: T.paper,
    align: 'center',
    valign: 'middle',
    margin: 0,
  });
  slide.addText(runs(spec.body, accent), {
    x: box.x + 0.45,
    y: box.y + 1.0,
    w: box.w - 0.9,
    h: box.h - 1.25,
    fontFace: T.serif,
    fontSize: spec.body.split('\n').length >= 6 || plain(spec.body).length > 560 ? 18 : 22,
    color: T.ink,
    valign: 'top',
    lineSpacingMultiple: 1.2,
    margin: 0,
  });
}

function addFigureSlide(slide: PptxSlide, spec: Extract<HybridSlide, { layout: 'figure' }>, accent: AccentColor): void {
  addHeading(slide, spec, accent);
  const size = imageBox(spec.image, 7.6, BODY_HEIGHT + 0.25);
  addFramedImage(slide, spec.image, { x: MARGIN, y: BODY_TOP - 0.15, ...size });
  const x = MARGIN + size.w + 0.6;
  const w = W - MARGIN - x;
  const rowH = Math.min(BODY_HEIGHT / spec.callouts.length, 1.0);
  const top = BODY_TOP + (BODY_HEIGHT - rowH * spec.callouts.length) / 2;
  spec.callouts.forEach((callout, index) => {
    const color = accentAt(ACCENT_OFFSET[accent] + index);
    const y = top + index * rowH;
    addDot(slide, x, y + (rowH - 0.32) / 2, 0.32, T[color]);
    slide.addText(runs(callout, color), {
      x: x + 0.52,
      y,
      w: w - 0.52,
      h: rowH,
      fontFace: T.sans,
      fontSize: w > 5 ? 24 : 20,
      color: T.ink,
      valign: 'middle',
      margin: 0,
    });
  });
}

function addCompareSlide(slide: PptxSlide, spec: Extract<HybridSlide, { layout: 'compare' }>, accent: AccentColor): void {
  addHeading(slide, spec, accent);
  const gap = 0.5;
  const w = (CONTENT_WIDTH - gap) / 2;
  const top = BODY_TOP + (plain(spec.title).length > 55 ? 0.25 : 0);
  const h = BODY_BOTTOM - top;
  [spec.left, spec.right].forEach((column, index) => {
    const x = MARGIN + index * (w + gap);
    addCard(slide, { x, y: top, w, h });
    slide.addShape('roundRect', {
      x,
      y: top,
      w,
      h: 0.78,
      rectRadius: 0.14,
      fill: { color: T[column.accent] },
      line: { color: T[column.accent], width: 0 },
    });
    // Square off the band's lower corners where it meets the tile.
    slide.addShape('rect', {
      x,
      y: top + 0.5,
      w,
      h: 0.28,
      fill: { color: T[column.accent] },
      line: { color: T[column.accent], width: 0 },
    });
    slide.addText(column.label.toUpperCase(), {
      x: x + 0.4,
      y: top,
      w: w - 0.8,
      h: 0.78,
      fontFace: T.mono,
      fontSize: 15,
      bold: true,
      charSpacing: 2,
      color: T.paper,
      valign: 'middle',
      margin: 0,
    });
    const bullet = column.lines.length > 2;
    const longest = Math.max(...column.lines.map((line) => plain(line).length));
    slide.addText(paragraphs(column.lines, column.accent, { bullet, gapAfter: 14 }), {
      x: x + 0.4,
      y: top + 1.05,
      w: w - 0.8,
      h: h - (spec.sticker ? 1.9 : 1.35),
      fontFace: bullet ? T.sans : T.serif,
      fontSize: bullet ? 24 : longest > 90 ? 21 : 26,
      color: T.ink,
      valign: 'top',
      lineSpacingMultiple: 1.15,
      margin: 0,
    });
  });
  if (spec.sticker) {
    // Brian's starburst Pro-tip, as a tilted sticker on the seam.
    const d = 2.0;
    slide.addShape('ellipse', {
      x: W - MARGIN - d + 0.2,
      y: BODY_BOTTOM - d + 0.35,
      w: d,
      h: d,
      fill: { color: T.sunshine },
      line: { color: T.paper, width: 3 },
      shadow: { type: 'outer', color: T.ink, opacity: 0.18, blur: 8, offset: 3, angle: 90 },
    });
    slide.addText(spec.sticker, {
      x: W - MARGIN - d + 0.4,
      y: BODY_BOTTOM - d + 0.55,
      w: d - 0.4,
      h: d - 0.4,
      fontFace: T.sans,
      fontSize: 17,
      bold: true,
      color: T.ink,
      align: 'center',
      valign: 'middle',
      rotate: -10,
      margin: 0,
    });
  }
}

function addExampleSlide(slide: PptxSlide, spec: Extract<HybridSlide, { layout: 'example' }>, accent: AccentColor): void {
  addHeading(slide, spec, accent);
  addCornerCluster(slide, 'question', accent);
  const box = { x: MARGIN, y: BODY_TOP - 0.05, w: CONTENT_WIDTH, h: BODY_HEIGHT + 0.1 };
  addCard(slide, box, accent);
  slide.addText(runs(spec.body, accent), {
    x: box.x + 0.5,
    y: box.y + 0.35,
    w: box.w - 1.0,
    h: box.h - 0.6,
    fontFace: T.serif,
    fontSize: plain(spec.body).length > 1000 ? 16.5 : plain(spec.body).length < 250 ? 32 : 18,
    color: T.ink,
    valign: 'middle',
    lineSpacingMultiple: 1.25,
    margin: 0,
  });
}

function addGridSlide(slide: PptxSlide, spec: Extract<HybridSlide, { layout: 'grid' }>, accent: AccentColor): void {
  addHeading(slide, spec, accent);
  addCornerCluster(slide, 'lightbulb', 'sunshine');
  const perRow = Math.ceil(spec.items.length / 2);
  const gap = 0.32;
  const w = (CONTENT_WIDTH - gap * (perRow - 1)) / perRow;
  const h = (BODY_HEIGHT - gap) / 2;
  spec.items.forEach((item, index) => {
    const row = Math.floor(index / perRow);
    const inRow = row === 0 ? perRow : spec.items.length - perRow;
    const rowOffset = (CONTENT_WIDTH - (inRow * w + (inRow - 1) * gap)) / 2;
    const col = index - row * perRow;
    const x = MARGIN + rowOffset + col * (w + gap);
    const y = BODY_TOP + row * (h + gap);
    const color = accentAt(index);
    addCard(slide, { x, y, w, h }, color);
    addDot(slide, x + 0.3, y + 0.42, 0.3, T[color]);
    slide.addText(runs(item, color), {
      x: x + 0.8,
      y: y + 0.32,
      w: w - 1.05,
      h: h - 0.5,
      fontFace: T.serif,
      fontSize: plain(item).length > 85 ? 19 : 20,
      color: T.ink,
      valign: 'top',
      margin: 0,
    });
  });
}

function addTimerSlide(slide: PptxSlide, spec: Extract<HybridSlide, { layout: 'timer' }>, accent: AccentColor): void {
  slide.addText(spec.eyebrow.toUpperCase(), {
    x: MARGIN + 0.4,
    y: 2.3,
    w: 6,
    h: 0.4,
    fontFace: T.mono,
    fontSize: 14,
    bold: true,
    charSpacing: 2,
    color: T[accent],
    margin: 0,
  });
  slide.addText([{ text: spec.title, options: { highlight: T.highlighter } }], {
    x: MARGIN + 0.4,
    y: 2.75,
    w: 6,
    h: 1.4,
    fontFace: T.serif,
    fontSize: 66,
    color: T.ink,
    valign: 'middle',
    margin: 0,
  });
  slide.addText(`for ${spec.minutes} minutes. ${spec.line}`, {
    x: MARGIN + 0.4,
    y: 4.2,
    w: 6,
    h: 0.9,
    fontFace: T.sans,
    fontSize: 24,
    color: T.muted,
    valign: 'top',
    margin: 0,
  });
  const d = 4.4;
  const x = W - MARGIN - d - 0.4;
  const y = (H - d) / 2;
  slide.addShape('ellipse', {
    x,
    y,
    w: d,
    h: d,
    fill: { color: T[accent] },
    line: { color: T[accent], width: 0 },
    shadow: { type: 'outer', color: T.ink, opacity: 0.16, blur: 14, offset: 4, angle: 90 },
  });
  slide.addText(String(spec.minutes), {
    x,
    y: y + 0.45,
    w: d,
    h: 2.6,
    fontFace: T.serif,
    fontSize: 170,
    bold: true,
    color: T.paper,
    align: 'center',
    valign: 'middle',
    margin: 0,
  });
  slide.addText('MINUTES', {
    x,
    y: y + 3.0,
    w: d,
    h: 0.5,
    fontFace: T.mono,
    fontSize: 18,
    bold: true,
    charSpacing: 4,
    color: T.paper,
    align: 'center',
    margin: 0,
  });
  addBubble(slide, 'timer', x + d - 1.0, y - 0.2, 1.25, 'teal');
  addDot(slide, x - 0.35, y + 0.6, 0.42, T.pink);
  addDot(slide, x - 0.1, y + d - 0.4, 0.26, T.sunshine);
  addDot(slide, x + d - 0.2, y + d - 0.5, 0.6, T.coral);
  addDot(slide, x + d + 0.2, y + 1.6, 0.18, T.teal);
}

function addEquationSlide(slide: PptxSlide, spec: Extract<HybridSlide, { layout: 'equation' }>, accent: AccentColor): void {
  slide.background = { color: T.sunshineSoft };
  addHeading(slide, spec, accent);
  const d = 2.85;
  const sign = 1.0;
  const total = d * 3 + sign * 2;
  const left = (W - total) / 2;
  const y = BODY_TOP + 0.25;
  const parts: { text: string; color: AccentColor; icon: IconName }[] = [
    { text: spec.terms[0], color: 'teal', icon: 'question' },
    { text: spec.terms[1], color: 'orange', icon: 'timer' },
    { text: spec.result, color: 'coral', icon: 'lightbulb' },
  ];
  parts.forEach((part, index) => {
    const x = left + index * (d + sign);
    slide.addShape('ellipse', {
      x,
      y,
      w: d,
      h: d,
      fill: { color: T[part.color] },
      line: { color: T.paper, width: 3 },
      shadow: { type: 'outer', color: T.ink, opacity: 0.14, blur: 10, offset: 3, angle: 90 },
    });
    slide.addImage({
      path: join(ASSETS, 'icons', `${part.icon}.png`),
      x: x + d / 2 - 0.45,
      y: y + 0.4,
      w: 0.9,
      h: 0.9,
    });
    slide.addText(part.text, {
      x: x + 0.2,
      y: y + 1.35,
      w: d - 0.4,
      h: 1.0,
      fontFace: T.serif,
      fontSize: 26,
      bold: true,
      color: T.paper,
      align: 'center',
      valign: 'middle',
      margin: 0,
    });
    if (index < 2) {
      slide.addText(index === 0 ? '+' : '=', {
        x: x + d,
        y,
        w: sign,
        h: d,
        fontFace: T.serif,
        fontSize: 60,
        color: T.ink,
        align: 'center',
        valign: 'middle',
        margin: 0,
      });
    }
  });
  slide.addText(spec.line, {
    x: MARGIN,
    y: y + d + 0.35,
    w: CONTENT_WIDTH,
    h: 0.5,
    fontFace: T.sans,
    fontSize: 20,
    italic: true,
    color: T.muted,
    align: 'center',
    margin: 0,
  });
}

function addQuizSlide(slide: PptxSlide, spec: Extract<HybridSlide, { layout: 'quiz' }>, accent: AccentColor): void {
  addHeading(slide, spec, accent);
  addCornerCluster(slide, 'question', accent);
  const box = { x: MARGIN, y: BODY_TOP - 0.05, w: CONTENT_WIDTH, h: BODY_HEIGHT + 0.1 };
  addCard(slide, box, accent);
  const count = spec.options.length;
  const rowH = Math.min((box.h - 0.6) / count, 1.0);
  const top = box.y + (box.h - rowH * count) / 2;
  spec.options.forEach((option, index) => {
    const y = top + index * rowH;
    const isAnswer = spec.answer === index;
    const letter = String.fromCharCode(97 + index);
    const d = 0.5;
    if (isAnswer) {
      addDot(slide, box.x + 0.45, y + (rowH - d) / 2, d, T[accent]);
    } else {
      slide.addShape('ellipse', {
        x: box.x + 0.45,
        y: y + (rowH - d) / 2,
        w: d,
        h: d,
        fill: { color: T.paper },
        line: { color: spec.answer === undefined ? T[accent] : T.rule, width: 1.25 },
      });
    }
    slide.addText(letter, {
      x: box.x + 0.45,
      y: y + (rowH - d) / 2,
      w: d,
      h: d,
      fontFace: T.mono,
      fontSize: 14,
      bold: true,
      color: isAnswer ? T.paper : spec.answer === undefined ? T[accent] : T.muted,
      align: 'center',
      valign: 'middle',
      margin: 0,
    });
    slide.addText(
      [
        {
          text: option,
          options: {
            ...(isAnswer ? { highlight: T.highlighter, bold: true } : {}),
            color: spec.answer === undefined || isAnswer ? T.ink : T.muted,
          },
        },
      ],
      {
        x: box.x + 1.2,
        y,
        w: box.w - 1.6,
        h: rowH,
        fontFace: T.sans,
        fontSize: count > 4 ? 22 : 28,
        valign: 'middle',
        margin: 0,
      }
    );
  });
}

function addOrderingSlide(slide: PptxSlide, spec: Extract<HybridSlide, { layout: 'ordering' }>, accent: AccentColor): void {
  addHeading(slide, spec, accent);
  addCornerCluster(slide, 'puzzle', accent);
  const count = spec.items.length;
  const gap = 0.14;
  const rowH = Math.min((BODY_HEIGHT - gap * (count - 1)) / count, 0.72);
  const w = Math.min(CONTENT_WIDTH, 9.5);
  const x = MARGIN + (CONTENT_WIDTH - w) / 2;
  const top = BODY_TOP + (BODY_HEIGHT - (rowH * count + gap * (count - 1))) / 2;
  spec.items.forEach((item, index) => {
    const y = top + index * (rowH + gap);
    const color = spec.numbered ? accentAt(index) : accent;
    addCard(slide, { x, y, w, h: rowH });
    const d = 0.42;
    if (spec.numbered) {
      addDot(slide, x + 0.25, y + (rowH - d) / 2, d, T[color]);
      slide.addText(String(index + 1), {
        x: x + 0.25,
        y: y + (rowH - d) / 2,
        w: d,
        h: d,
        fontFace: T.serif,
        fontSize: 16,
        bold: true,
        color: T.paper,
        align: 'center',
        valign: 'middle',
        margin: 0,
      });
    } else {
      slide.addShape('ellipse', {
        x: x + 0.25,
        y: y + (rowH - d) / 2,
        w: d,
        h: d,
        fill: { color: T.paper },
        line: { color: T.rule, width: 1.25 },
      });
    }
    slide.addText(runs(item, color), {
      x: x + 0.9,
      y,
      w: w - 1.2,
      h: rowH,
      fontFace: T.sans,
      fontSize: plain(item).length > 70 ? 17 : 22,
      color: T.ink,
      valign: 'middle',
      margin: 0,
    });
  });
}

function addOaSlide(slide: PptxSlide, spec: Extract<HybridSlide, { layout: 'oa' }>, accent: AccentColor): void {
  addHeading(slide, spec, accent);
  const gap = 0.4;
  const w = (CONTENT_WIDTH - gap) / 2;
  const topH = spec.thesis ? 2.35 : BODY_HEIGHT;
  const columns: { label: string; color: AccentColor; lines: string[]; bullet: boolean }[] = [
    { label: 'Observation', color: 'teal', lines: [spec.observation], bullet: false },
    { label: 'Analysis', color: 'orange', lines: spec.analysis, bullet: true },
  ];
  columns.forEach((column, index) => {
    const x = MARGIN + index * (w + gap);
    addCard(slide, { x, y: BODY_TOP, w, h: topH }, column.color);
    slide.addText(column.label.toUpperCase(), {
      x: x + 0.35,
      y: BODY_TOP + 0.22,
      w: w - 0.7,
      h: 0.35,
      fontFace: T.mono,
      fontSize: 12,
      bold: true,
      charSpacing: 2,
      color: T[column.color],
      margin: 0,
    });
    slide.addText(paragraphs(column.lines, column.color, { bullet: column.bullet, gapAfter: 6 }), {
      x: x + 0.35,
      y: BODY_TOP + 0.6,
      w: w - 0.7,
      h: topH - 0.8,
      fontFace: column.bullet ? T.sans : T.serif,
      fontSize: spec.thesis ? (column.bullet ? 18 : 24) : column.bullet ? 22 : 30,
      color: T.ink,
      valign: 'top',
      lineSpacingMultiple: 1.1,
      margin: 0,
    });
  });
  if (!spec.thesis) return;
  const y = BODY_TOP + topH + 0.45;
  const h = BODY_BOTTOM - y;
  // The equals sign between the two parts and what they make.
  slide.addText('=', {
    x: MARGIN,
    y: BODY_TOP + topH + 0.02,
    w: CONTENT_WIDTH,
    h: 0.42,
    fontFace: T.serif,
    fontSize: 26,
    bold: true,
    color: T.muted,
    align: 'center',
    valign: 'middle',
    margin: 0,
  });
  addCard(slide, { x: MARGIN, y, w: CONTENT_WIDTH, h }, 'coral');
  slide.addText('THESIS', {
    x: MARGIN + 0.35,
    y: y + 0.18,
    w: 2,
    h: 0.3,
    fontFace: T.mono,
    fontSize: 12,
    bold: true,
    charSpacing: 2,
    color: T.coral,
    margin: 0,
  });
  slide.addText(runs(spec.thesis, 'coral'), {
    x: MARGIN + 0.35,
    y: y + 0.48,
    w: CONTENT_WIDTH - 0.7,
    h: h - 0.6,
    fontFace: T.serif,
    fontSize: plain(spec.thesis).length > 190 ? 18 : 21,
    color: T.ink,
    valign: 'top',
    lineSpacingMultiple: 1.1,
    margin: 0,
  });
}

/** The thesis as runs, each part bold in its own colour. */
function thesisRuns(thesis: string, parts: { span: string }[]): TextRun[] {
  const out: TextRun[] = [];
  let rest = thesis;
  parts.forEach((part, index) => {
    const at = rest.indexOf(part.span);
    if (at < 0) return;
    if (at > 0) out.push({ text: rest.slice(0, at) });
    out.push({ text: part.span, options: { bold: true, color: T[accentAt(index)] } });
    rest = rest.slice(at + part.span.length);
  });
  if (rest) out.push({ text: rest });
  return out;
}

function addThesisPartsSlide(slide: PptxSlide, spec: Extract<HybridSlide, { layout: 'thesis-parts' }>, accent: AccentColor): void {
  addHeading(slide, spec, accent);
  const thesisH = 1.9;
  addCard(slide, { x: MARGIN, y: BODY_TOP, w: CONTENT_WIDTH, h: thesisH }, accent);
  slide.addText('THESIS', {
    x: MARGIN + 0.35,
    y: BODY_TOP + 0.18,
    w: 2,
    h: 0.3,
    fontFace: T.mono,
    fontSize: 12,
    bold: true,
    charSpacing: 2,
    color: T[accent],
    margin: 0,
  });
  slide.addText(thesisRuns(spec.thesis, spec.parts), {
    x: MARGIN + 0.35,
    y: BODY_TOP + 0.5,
    w: CONTENT_WIDTH - 0.7,
    h: thesisH - 0.65,
    fontFace: T.serif,
    fontSize: spec.thesis.length > 190 ? 19 : 22,
    color: T.ink,
    valign: 'top',
    lineSpacingMultiple: 1.1,
    margin: 0,
  });
  const top = BODY_TOP + thesisH + 0.35;
  const rowH = Math.min((BODY_BOTTOM - top) / spec.parts.length, 0.85);
  spec.parts.forEach((part, index) => {
    const color = accentAt(index);
    const y = top + index * rowH;
    const d = 0.46;
    addDot(slide, MARGIN + 0.2, y + (rowH - d) / 2, d, T[color]);
    slide.addText(String(index + 1), {
      x: MARGIN + 0.2,
      y: y + (rowH - d) / 2,
      w: d,
      h: d,
      fontFace: T.serif,
      fontSize: 16,
      bold: true,
      color: T.paper,
      align: 'center',
      valign: 'middle',
      margin: 0,
    });
    slide.addText(
      [
        { text: `${part.label}: `, options: { fontFace: T.mono, fontSize: 13, bold: true, color: T[color] } },
        { text: part.span, options: { fontFace: T.sans, fontSize: 22, color: T.ink } },
      ],
      { x: MARGIN + 0.9, y, w: CONTENT_WIDTH - 1.1, h: rowH, valign: 'middle', margin: 0 }
    );
  });
}

function addPassageSlide(slide: PptxSlide, spec: Extract<HybridSlide, { layout: 'passage' }>, accent: AccentColor): void {
  addHeading(slide, spec, accent);
  const box = { x: MARGIN, y: BODY_TOP - 0.05, w: CONTENT_WIDTH, h: BODY_HEIGHT + 0.1 };
  addCard(slide, box, accent);
  let top = box.y + 0.3;
  if (spec.label) {
    slide.addText(spec.label.toUpperCase(), {
      x: box.x + 0.5,
      y: top,
      w: box.w - 1,
      h: 0.3,
      fontFace: T.mono,
      fontSize: 12,
      bold: true,
      charSpacing: 2,
      color: T[accent],
      margin: 0,
    });
    top += 0.4;
  }
  const length = plain(spec.body).length;
  slide.addText(runs(spec.body, accent), {
    x: box.x + 0.5,
    y: top,
    w: box.w - 1,
    h: box.y + box.h - 0.3 - top,
    fontFace: T.serif,
    fontSize: length > 1500 ? 12.5 : length > 1150 ? 13.5 : length > 850 ? 15 : length > 700 ? 17 : length > 450 ? 20 : 24,
    color: T.ink,
    valign: 'top',
    lineSpacingMultiple: 1.2,
    margin: 0,
  });
}

function addCloserSlide(slide: PptxSlide, spec: Extract<HybridSlide, { layout: 'closer' }>): void {
  slide.background = { color: T.teal };
  const d = 4.2;
  const cx = (W - d) / 2;
  const cy = (H - d) / 2 - (spec.line ? 0.3 : 0);
  slide.addShape('ellipse', {
    x: cx,
    y: cy,
    w: d,
    h: d,
    fill: { color: T.paper },
    line: { color: T.paper, width: 0 },
    shadow: { type: 'outer', color: T.ink, opacity: 0.18, blur: 14, offset: 4, angle: 90 },
  });
  slide.addText('YAWP!', {
    x: cx,
    y: cy + 1.25,
    w: d,
    h: 1.2,
    fontFace: T.serif,
    fontSize: 72,
    bold: true,
    color: T.ink,
    align: 'center',
    valign: 'middle',
    margin: 0,
  });
  slide.addText('WRITING PROGRAM', {
    x: cx,
    y: cy + 2.5,
    w: d,
    h: 0.4,
    fontFace: T.mono,
    fontSize: 13,
    bold: true,
    charSpacing: 3,
    color: T.terracotta,
    align: 'center',
    margin: 0,
  });
  addBubble(slide, 'lightbulb', cx + d - 1.2, cy - 0.5, 1.6, 'sunshine');
  addBubble(slide, 'puzzle', cx - 0.6, cy + 0.3, 1.1, 'orange');
  addBubble(slide, 'thumbs', cx + 0.1, cy + d - 1.1, 1.3, 'coral');
  addDot(slide, cx - 0.35, cy + 1.9, 0.3, T.paper);
  addDot(slide, cx + d + 0.1, cy + 1.5, 0.45, T.pink);
  addDot(slide, cx + d - 0.5, cy + d + 0.05, 0.6, T.orange);
  addDot(slide, cx + d - 1.4, cy + d + 0.3, 0.18, T.sunshine);
  addDot(slide, cx + 1.4, cy + d + 0.2, 0.22, T.paper);
  if (spec.line) {
    slide.addText(spec.line, {
      x: MARGIN,
      y: cy + d + 0.55,
      w: CONTENT_WIDTH,
      h: 0.6,
      fontFace: T.sans,
      fontSize: 22,
      color: T.paper,
      align: 'center',
      margin: 0,
    });
  }
}

function addSlide(pptx: PptxGenJS, spec: HybridSlide, index: number): void {
  const slide = pptx.addSlide({ masterName: MASTER });
  const accent = spec.accent ?? accentAt(index);
  switch (spec.layout) {
    case 'title':
      addTitleSlide(slide, spec);
      break;
    case 'section':
      addSectionSlide(slide, spec);
      break;
    case 'statement':
      addStatementSlide(slide, spec, accent);
      break;
    case 'steps':
      addStepsSlide(slide, spec, accent);
      break;
    case 'photo':
      addPhotoSlide(slide, spec, accent);
      break;
    case 'quote':
      addQuoteSlide(slide, spec, accent);
      break;
    case 'prompt':
      addPromptSlide(slide, spec, accent);
      break;
    case 'figure':
      addFigureSlide(slide, spec, accent);
      break;
    case 'compare':
      addCompareSlide(slide, spec, accent);
      break;
    case 'example':
      addExampleSlide(slide, spec, accent);
      break;
    case 'grid':
      addGridSlide(slide, spec, accent);
      break;
    case 'timer':
      addTimerSlide(slide, spec, accent);
      break;
    case 'equation':
      addEquationSlide(slide, spec, accent);
      break;
    case 'quiz':
      addQuizSlide(slide, spec, accent);
      break;
    case 'ordering':
      addOrderingSlide(slide, spec, accent);
      break;
    case 'oa':
      addOaSlide(slide, spec, accent);
      break;
    case 'thesis-parts':
      addThesisPartsSlide(slide, spec, accent);
      break;
    case 'passage':
      addPassageSlide(slide, spec, accent);
      break;
    case 'closer':
      addCloserSlide(slide, spec);
      break;
  }
  slide.addNotes(spec.notes);
}

export async function renderHybridDeck(deck: HybridDeck): Promise<Uint8Array> {
  const pptx = new PptxGenJS();
  pptx.defineLayout(LAYOUT);
  pptx.layout = LAYOUT.name;
  pptx.title = deck.title;
  pptx.subject = deck.subtitle;
  pptx.company = 'YAWP!';

  pptx.defineSlideMaster({
    title: MASTER,
    background: { color: T.cream },
    objects: [
      {
        text: {
          text: 'YAWP!',
          options: {
            x: MARGIN,
            y: H - 0.55,
            w: 2,
            h: 0.35,
            fontFace: T.serif,
            fontSize: 11,
            bold: true,
            color: T.terracotta,
            margin: 0,
          },
        },
      },
    ],
    slideNumber: {
      x: W - MARGIN - 0.6,
      y: H - 0.55,
      w: 0.6,
      h: 0.35,
      fontFace: T.mono,
      fontSize: 10,
      color: T.muted,
      align: 'right',
    },
  });

  deck.slides.forEach((slide, index) => addSlide(pptx, slide, index));

  const written = await pptx.write({ outputType: 'nodebuffer' });
  return new Uint8Array(written as Buffer);
}

/** For tests: confirm an asset is where the renderer will look. */
export function readAsset(name: string): Buffer {
  return readFileSync(join(ASSETS, name));
}
