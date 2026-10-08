/**
 * A deck as a PowerPoint file.
 *
 * Yawp can already project a deck — full screen, arrow keys, notes on the
 * laptop — so this is not about Yawp being unable to show it. It is about the
 * deck leaving Yawp: the classroom desktop nobody is logged into, the
 * substitute who needs Tuesday's slides, the colleague who wants to borrow the
 * lesson, the teacher who wants to add two slides of their own. School AV is
 * PowerPoint-shaped, and a lesson a teacher cannot take with them is a lesson
 * with a condition attached.
 *
 * Deliberately no headless browser, for the same reason the PDF has none: the
 * deck is already structured, so it is laid out directly rather than rendered
 * and captured.
 */
import PptxGenJS from 'pptxgenjs';
import type { Slide, SlideDeck } from './slide-deck';

/** Yawp's print colour and ink, matched to the packet and the PDF. */
const BRAND = 'C05A3E';
const INK = '1A1A1A';
const MUTED = '6B7280';
const WASH = 'F7F4EF';
const PAPER = 'FFFFFF';

/** 16:9, which is what a classroom projector has been for fifteen years. */
const LAYOUT = { name: 'YAWP_16x9', width: 13.333, height: 7.5 };

const MARGIN = 0.7;
const CONTENT_WIDTH = LAYOUT.width - MARGIN * 2;

type PptxSlide = ReturnType<PptxGenJS['addSlide']>;

/**
 * The heading every content slide wears, so a room can tell where it is.
 * Title and closing slides get their own centred treatment instead.
 */
function addSlideTitle(slide: PptxSlide, text: string): void {
  slide.addText(text, {
    x: MARGIN,
    y: 0.45,
    w: CONTENT_WIDTH,
    h: 0.9,
    fontSize: 30,
    bold: true,
    color: INK,
    valign: 'middle',
  });
  slide.addShape('line', {
    x: MARGIN,
    y: 1.45,
    w: 1.6,
    h: 0,
    line: { color: BRAND, width: 3 },
  });
}

/** Where a content slide's body starts, under the title and its rule. */
const BODY_TOP = 1.85;
const BODY_HEIGHT = LAYOUT.height - BODY_TOP - 0.6;

function addTitleSlide(slide: PptxSlide, spec: Slide): void {
  slide.background = { color: WASH };
  slide.addText(spec.title, {
    x: MARGIN,
    y: 2.4,
    w: CONTENT_WIDTH,
    h: 1.5,
    fontSize: 44,
    bold: true,
    color: INK,
    align: 'center',
    valign: 'bottom',
  });
  slide.addShape('line', {
    x: LAYOUT.width / 2 - 0.8,
    y: 4.1,
    w: 1.6,
    h: 0,
    line: { color: BRAND, width: 3 },
  });
  if (spec.subtitle) {
    slide.addText(spec.subtitle, {
      x: MARGIN,
      y: 4.35,
      w: CONTENT_WIDTH,
      h: 0.9,
      fontSize: 20,
      color: MUTED,
      align: 'center',
      valign: 'top',
    });
  }
}

function addBulletSlide(slide: PptxSlide, spec: Slide): void {
  addSlideTitle(slide, spec.title);
  const bullets = spec.bullets ?? [];
  const numbered = spec.layout === 'steps';

  slide.addText(
    bullets.map((bullet, index) => ({
      text: numbered ? `${index + 1}.  ${bullet}` : bullet,
      options: {
        // Steps carry their own numbers so a teacher can say "step two"; the
        // list marker would then read "1. 1." beside it.
        bullet: numbered ? false : { code: '2022' },
        breakLine: true,
      },
    })),
    {
      x: MARGIN,
      y: BODY_TOP,
      w: CONTENT_WIDTH,
      h: BODY_HEIGHT,
      fontSize: bullets.length > 5 ? 22 : 26,
      color: INK,
      lineSpacingMultiple: 1.4,
      valign: 'top',
    }
  );
}

function addStatementSlide(slide: PptxSlide, spec: Slide): void {
  addSlideTitle(slide, spec.title);
  if (!spec.body) return;
  slide.addText(spec.body, {
    x: MARGIN,
    y: BODY_TOP,
    w: CONTENT_WIDTH,
    h: BODY_HEIGHT,
    fontSize: 28,
    color: INK,
    valign: 'top',
  });
}

/** A prompt is a statement the room is expected to answer, so it gets a card. */
function addPromptSlide(slide: PptxSlide, spec: Slide): void {
  addSlideTitle(slide, spec.title);
  if (!spec.body) return;
  slide.addText(spec.body, {
    x: MARGIN,
    y: BODY_TOP,
    w: CONTENT_WIDTH,
    h: BODY_HEIGHT * 0.8,
    fontSize: 28,
    color: INK,
    align: 'center',
    valign: 'middle',
    fill: { color: WASH },
    line: { color: BRAND, width: 1.5 },
    margin: 18,
  });
}

function addQuoteSlide(slide: PptxSlide, spec: Slide): void {
  addSlideTitle(slide, spec.title);
  if (spec.body) {
    slide.addText(`“${spec.body}”`, {
      x: MARGIN,
      y: BODY_TOP,
      w: CONTENT_WIDTH,
      h: BODY_HEIGHT * 0.7,
      fontSize: 30,
      italic: true,
      color: INK,
      valign: 'middle',
    });
  }
  if (spec.attribution) {
    slide.addText(`— ${spec.attribution}`, {
      x: MARGIN,
      y: BODY_TOP + BODY_HEIGHT * 0.7,
      w: CONTENT_WIDTH,
      h: 0.6,
      fontSize: 18,
      color: MUTED,
      valign: 'top',
    });
  }
}

function addCompareSlide(slide: PptxSlide, spec: Slide): void {
  addSlideTitle(slide, spec.title);
  const gutter = 0.45;
  const columnWidth = (CONTENT_WIDTH - gutter) / 2;

  [spec.left, spec.right].forEach((column, index) => {
    if (!column) return;
    const x = MARGIN + index * (columnWidth + gutter);
    slide.addText(column.label, {
      x,
      y: BODY_TOP,
      w: columnWidth,
      h: 0.5,
      fontSize: 16,
      bold: true,
      color: BRAND,
      valign: 'middle',
    });
    slide.addText(column.text, {
      x,
      y: BODY_TOP + 0.55,
      w: columnWidth,
      h: BODY_HEIGHT - 0.55,
      fontSize: 22,
      color: INK,
      valign: 'top',
      fill: { color: WASH },
      line: { color: 'E5E7EB', width: 1 },
      margin: 14,
    });
  });
}

function addClosingSlide(slide: PptxSlide, spec: Slide): void {
  slide.background = { color: WASH };
  slide.addText(spec.title, {
    x: MARGIN,
    y: 2.6,
    w: CONTENT_WIDTH,
    h: 1.2,
    fontSize: 38,
    bold: true,
    color: INK,
    align: 'center',
    valign: 'bottom',
  });
  if (spec.body) {
    slide.addText(spec.body, {
      x: MARGIN,
      y: 3.9,
      w: CONTENT_WIDTH,
      h: 1.2,
      fontSize: 22,
      color: MUTED,
      align: 'center',
      valign: 'top',
    });
  }
  for (const bullet of spec.bullets ?? []) {
    // A closing that arrived as a list still has to say its list.
    slide.addText(bullet, {
      x: MARGIN,
      y: 4.9,
      w: CONTENT_WIDTH,
      h: 1.2,
      fontSize: 20,
      color: MUTED,
      align: 'center',
      valign: 'top',
    });
    break;
  }
}

function addSlide(deck: PptxGenJS, spec: Slide): void {
  const slide = deck.addSlide();
  slide.background = { color: PAPER };

  switch (spec.layout) {
    case 'title':
      addTitleSlide(slide, spec);
      break;
    case 'closing':
      addClosingSlide(slide, spec);
      break;
    case 'bullets':
    case 'steps':
      addBulletSlide(slide, spec);
      break;
    case 'compare':
      addCompareSlide(slide, spec);
      break;
    case 'quote':
      addQuoteSlide(slide, spec);
      break;
    case 'prompt':
      addPromptSlide(slide, spec);
      break;
    case 'statement':
      addStatementSlide(slide, spec);
      break;
  }

  // The reason this export exists rather than a screenshot: PowerPoint has a
  // notes pane, and the notes are where the lesson actually lives.
  slide.addNotes(spec.speakerNotes);
}

export async function renderDeckPptx(deck: SlideDeck): Promise<Uint8Array> {
  const pptx = new PptxGenJS();
  pptx.defineLayout(LAYOUT);
  pptx.layout = LAYOUT.name;

  // What a teacher sees in the file's properties, and in the "recent" list of
  // whatever opens it.
  pptx.title = deck.title;
  if (deck.subtitle) pptx.subject = deck.subtitle;
  pptx.company = 'Yawp!';

  for (const slide of deck.slides) addSlide(pptx, slide);

  const written = await pptx.write({ outputType: 'nodebuffer' });
  return new Uint8Array(written as Buffer);
}

/**
 * A filename a teacher can find later.
 *
 * Same rules as `pdfFilename`, and for the same reason: browsers read the name
 * out of a `Content-Disposition` header, and Chromium falls back to "download"
 * for the whole header when it meets a character it does not like.
 */
export function pptxFilename(title: string): string {
  const base = (title || 'Lesson')
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return `${base || 'Lesson'}.pptx`;
}
