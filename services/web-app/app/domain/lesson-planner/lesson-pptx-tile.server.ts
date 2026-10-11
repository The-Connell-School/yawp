/**
 * The YAWP! deck template (Brian's review, E1).
 *
 * The first export was deliberately plain so teachers could add to it, and it
 * read like generic AI output. This one is designed, using the language of the
 * class tiles on the YAWP! dashboard: cards on a warm cream page, a mono
 * eyebrow over a serif title, a flat terracotta block where a class tile has
 * its art. Beautiful, not decorative: no clip art, no stock graphics, and none
 * of the site's artwork, only the shapes and colours around it.
 *
 * Every slide is still ordinary text boxes on an ordinary master, so a teacher
 * can edit, delete and add slides in PowerPoint exactly as before.
 */
import PptxGenJS from 'pptxgenjs';
import type { Slide, SlideDeck } from './slide-deck';
import { TILE_SLIDE_EYEBROWS } from './tile-theme';

/** The app's own tokens (app.css :root), as hex. */
export const TILE_THEME = {
  cream: 'F7F5EE', // --background
  paper: 'FFFEFA', // --popover
  ink: '3C3828', // --foreground
  muted: '7E7C78', // --muted-foreground
  wash: 'E6E2D6', // --accent
  rule: 'D6D4CC', // --border
  terracotta: 'D27151', // --primary
  /**
   * Cormorant Garamond is the app's display face, but PowerPoint cannot embed
   * a web font and a missing one falls back unpredictably. Georgia is on every
   * classroom machine and keeps the serif voice.
   */
  serif: 'Georgia',
  sans: 'Calibri',
  mono: 'Consolas',
} as const;

const T = TILE_THEME;
const LAYOUT = { name: 'YAWP_TILE_16x9', width: 13.333, height: 7.5 };
const MASTER = 'YAWP_TILE';
const MARGIN = 0.75;
const CONTENT_WIDTH = LAYOUT.width - MARGIN * 2;
/** Where content starts, under the eyebrow and the title. */
const BODY_TOP = 2.05;
const BODY_BOTTOM = LAYOUT.height - 0.85;
const BODY_HEIGHT = BODY_BOTTOM - BODY_TOP;

type PptxSlide = ReturnType<PptxGenJS['addSlide']>;

function eyebrow(spec: Slide): string {
  const label = TILE_SLIDE_EYEBROWS[spec.layout].toUpperCase();
  return spec.minutes ? `${label} · ${spec.minutes} MIN` : label;
}

/** A class-tile card: paper, a hairline ring, a soft shadow. */
function addCard(
  slide: PptxSlide,
  box: { x: number; y: number; w: number; h: number },
  fill: string = T.paper
): void {
  slide.addShape('roundRect', {
    ...box,
    rectRadius: 0.12,
    fill: { color: fill },
    line: { color: T.rule, width: 0.75 },
    shadow: {
      type: 'outer',
      color: '000000',
      opacity: 0.12,
      blur: 6,
      offset: 2,
      angle: 90,
    },
  });
}

/** The flat colour band a class tile wears where its art would be. */
function addBand(
  slide: PptxSlide,
  box: { x: number; y: number; w: number; h: number },
  color: string = T.terracotta
): void {
  slide.addShape('rect', { ...box, fill: { color }, line: { color } });
}

function addHeading(slide: PptxSlide, spec: Slide): void {
  slide.addText(eyebrow(spec), {
    x: MARGIN,
    y: 0.55,
    w: CONTENT_WIDTH,
    h: 0.35,
    fontFace: T.mono,
    fontSize: 11,
    color: T.terracotta,
    charSpacing: 2,
    valign: 'bottom',
  });
  slide.addText(spec.title, {
    x: MARGIN,
    y: 0.92,
    w: CONTENT_WIDTH,
    h: 0.95,
    fontFace: T.serif,
    fontSize: 34,
    color: T.ink,
    valign: 'top',
  });
}

function addTitleSlide(slide: PptxSlide, spec: Slide, deck: SlideDeck): void {
  // The art block of a class tile, full height, as flat colour.
  addBand(slide, { x: 0, y: 0, w: 4.6, h: LAYOUT.height });
  slide.addText(eyebrow(spec), {
    x: 5.3,
    y: 2.1,
    w: 7.3,
    h: 0.4,
    fontFace: T.mono,
    fontSize: 12,
    color: T.terracotta,
    charSpacing: 2,
  });
  slide.addText(spec.title, {
    x: 5.3,
    y: 2.5,
    w: 7.3,
    h: 2.2,
    fontFace: T.serif,
    fontSize: 48,
    color: T.ink,
    valign: 'top',
  });
  const subtitle = spec.subtitle ?? deck.subtitle;
  if (subtitle) {
    slide.addText(subtitle, {
      x: 5.3,
      y: 4.8,
      w: 7.3,
      h: 0.8,
      fontFace: T.sans,
      fontSize: 20,
      color: T.muted,
      valign: 'top',
    });
  }
}

function addPromptSlide(slide: PptxSlide, spec: Slide): void {
  addHeading(slide, spec);
  if (!spec.body) return;
  const box = { x: MARGIN + 0.6, y: BODY_TOP, w: CONTENT_WIDTH - 1.2, h: BODY_HEIGHT };
  addCard(slide, box);
  addBand(slide, { x: box.x, y: box.y, w: box.w, h: 0.18 });
  slide.addText(spec.body, {
    x: box.x + 0.5,
    y: box.y + 0.4,
    w: box.w - 1,
    h: box.h - 0.6,
    fontFace: T.serif,
    fontSize: spec.body.length > 160 ? 30 : 36,
    color: T.ink,
    align: 'center',
    valign: 'middle',
  });
}

function addStatementSlide(slide: PptxSlide, spec: Slide): void {
  addHeading(slide, spec);
  if (!spec.body) return;
  // Very large, with space around it: the line the room should remember.
  slide.addText(spec.body, {
    x: MARGIN + 0.8,
    y: BODY_TOP,
    w: CONTENT_WIDTH - 1.6,
    h: BODY_HEIGHT,
    fontFace: T.serif,
    fontSize: spec.body.length > 140 ? 34 : 42,
    color: T.ink,
    align: 'center',
    valign: 'middle',
  });
}

function addStepsSlide(slide: PptxSlide, spec: Slide): void {
  addHeading(slide, spec);
  const steps = spec.bullets ?? [];
  const perRow = steps.length <= 4 ? steps.length : Math.ceil(steps.length / 2);
  const rows = Math.ceil(steps.length / perRow);
  const gap = 0.3;
  const w = (CONTENT_WIDTH - gap * (perRow - 1)) / perRow;
  // Tiles sized to their words, not stretched to fill the page.
  const h = Math.min((BODY_HEIGHT - gap * (rows - 1)) / rows, 3.2);
  steps.forEach((step, index) => {
    const x = MARGIN + (index % perRow) * (w + gap);
    const y = BODY_TOP + Math.floor(index / perRow) * (h + gap);
    addCard(slide, { x, y, w, h });
    slide.addText(String(index + 1), {
      x: x + 0.3,
      y: y + 0.25,
      w: 1,
      h: 0.8,
      fontFace: T.serif,
      fontSize: 36,
      color: T.terracotta,
      valign: 'top',
    });
    slide.addText(step, {
      x: x + 0.3,
      y: y + 1.05,
      w: w - 0.6,
      h: h - 1.3,
      fontFace: T.sans,
      fontSize: perRow > 3 ? 20 : 26,
      color: T.ink,
      valign: 'top',
    });
  });
}

function addBulletSlide(slide: PptxSlide, spec: Slide): void {
  addHeading(slide, spec);
  const bullets = spec.bullets ?? [];
  const box = { x: MARGIN, y: BODY_TOP, w: CONTENT_WIDTH, h: BODY_HEIGHT };
  addCard(slide, box);
  addBand(slide, { x: box.x, y: box.y, w: 0.14, h: box.h });
  slide.addText(
    bullets.map((bullet) => ({
      text: bullet,
      options: { bullet: { code: '2022' }, breakLine: true },
    })),
    {
      x: box.x + 0.5,
      y: box.y + 0.3,
      w: box.w - 0.9,
      h: box.h - 0.6,
      fontFace: T.sans,
      fontSize: bullets.length > 5 ? 22 : 26,
      color: T.ink,
      lineSpacingMultiple: 1.35,
      valign: 'top',
    }
  );
}

function addCompareSlide(slide: PptxSlide, spec: Slide): void {
  addHeading(slide, spec);
  const gap = 0.4;
  const w = (CONTENT_WIDTH - gap) / 2;
  [spec.left, spec.right].forEach((column, index) => {
    if (!column) return;
    const x = MARGIN + index * (w + gap);
    addCard(slide, { x, y: BODY_TOP, w, h: BODY_HEIGHT });
    // Left warm, right wash: two tiles you can tell apart from the back row.
    addBand(
      slide,
      { x, y: BODY_TOP, w, h: 0.7 },
      index === 0 ? T.terracotta : T.wash
    );
    slide.addText(column.label, {
      x: x + 0.35,
      y: BODY_TOP,
      w: w - 0.7,
      h: 0.7,
      fontFace: T.mono,
      fontSize: 13,
      charSpacing: 2,
      color: index === 0 ? T.paper : T.ink,
      valign: 'middle',
    });
    slide.addText(column.text, {
      x: x + 0.35,
      y: BODY_TOP + 0.95,
      w: w - 0.7,
      h: BODY_HEIGHT - 1.2,
      fontFace: T.serif,
      fontSize: column.text.length > 180 ? 20 : 24,
      color: T.ink,
      valign: 'top',
    });
  });
}

function addQuoteSlide(slide: PptxSlide, spec: Slide): void {
  addHeading(slide, spec);
  const box = { x: MARGIN + 0.6, y: BODY_TOP, w: CONTENT_WIDTH - 1.2, h: BODY_HEIGHT };
  addCard(slide, box);
  slide.addText('“', {
    x: box.x + 0.3,
    y: box.y + 0.05,
    w: 1.2,
    h: 1.3,
    fontFace: T.serif,
    fontSize: 96,
    color: T.terracotta,
    valign: 'top',
  });
  if (spec.body) {
    slide.addText(spec.body, {
      x: box.x + 1.2,
      y: box.y + 0.5,
      w: box.w - 2,
      h: box.h - 1.5,
      fontFace: T.serif,
      fontSize: 30,
      italic: true,
      color: T.ink,
      valign: 'middle',
    });
  }
  if (spec.attribution) {
    slide.addText(`— ${spec.attribution}`, {
      x: box.x + 1.2,
      y: box.y + box.h - 0.95,
      w: box.w - 2,
      h: 0.6,
      fontFace: T.sans,
      fontSize: 18,
      color: T.muted,
    });
  }
}

function addClosingSlide(slide: PptxSlide, spec: Slide): void {
  slide.background = { color: T.terracotta };
  slide.addText(eyebrow(spec), {
    x: MARGIN,
    y: 2.2,
    w: CONTENT_WIDTH,
    h: 0.4,
    fontFace: T.mono,
    fontSize: 12,
    charSpacing: 2,
    color: T.paper,
    align: 'center',
  });
  slide.addText(spec.title, {
    x: MARGIN,
    y: 2.65,
    w: CONTENT_WIDTH,
    h: 1.3,
    fontFace: T.serif,
    fontSize: 46,
    color: T.paper,
    align: 'center',
    valign: 'middle',
  });
  const line = spec.body ?? spec.bullets?.[0];
  if (line) {
    slide.addText(line, {
      x: MARGIN + 1,
      y: 4.1,
      w: CONTENT_WIDTH - 2,
      h: 1.2,
      fontFace: T.sans,
      fontSize: 22,
      color: T.paper,
      align: 'center',
      valign: 'top',
    });
  }
}

function addSlide(pptx: PptxGenJS, spec: Slide, deck: SlideDeck): void {
  const slide = pptx.addSlide({ masterName: MASTER });
  switch (spec.layout) {
    case 'title':
      addTitleSlide(slide, spec, deck);
      break;
    case 'closing':
      addClosingSlide(slide, spec);
      break;
    case 'prompt':
      addPromptSlide(slide, spec);
      break;
    case 'statement':
      addStatementSlide(slide, spec);
      break;
    case 'steps':
      addStepsSlide(slide, spec);
      break;
    case 'bullets':
      addBulletSlide(slide, spec);
      break;
    case 'compare':
      addCompareSlide(slide, spec);
      break;
    case 'quote':
      addQuoteSlide(slide, spec);
      break;
  }
  slide.addNotes(spec.speakerNotes);
}

export async function renderDeckPptxTile(deck: SlideDeck): Promise<Uint8Array> {
  const pptx = new PptxGenJS();
  pptx.defineLayout(LAYOUT);
  pptx.layout = LAYOUT.name;
  pptx.title = deck.title;
  if (deck.subtitle) pptx.subject = deck.subtitle;
  pptx.company = 'Yawp!';

  // A small typographic wordmark and the slide number, on the master, in
  // place of the little footer mark Brian asked to lose.
  pptx.defineSlideMaster({
    title: MASTER,
    background: { color: T.cream },
    objects: [
      {
        text: {
          text: 'YAWP!',
          options: {
            x: MARGIN,
            y: LAYOUT.height - 0.55,
            w: 2,
            h: 0.35,
            fontFace: T.serif,
            fontSize: 11,
            bold: true,
            color: T.terracotta,
          },
        },
      },
    ],
    slideNumber: {
      x: LAYOUT.width - MARGIN - 0.6,
      y: LAYOUT.height - 0.55,
      w: 0.6,
      h: 0.35,
      fontFace: T.mono,
      fontSize: 10,
      color: T.muted,
      align: 'right',
    },
  });

  for (const slide of deck.slides) addSlide(pptx, slide, deck);

  const written = await pptx.write({ outputType: 'nodebuffer' });
  return new Uint8Array(written as Buffer);
}
