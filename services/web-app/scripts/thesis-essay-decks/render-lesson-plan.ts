/**
 * Renders a lesson plan (and the lessons' handouts) to PDF.
 *
 * The plans go with the hybrid decks, so they wear the same colours: Brian's
 * teal, sunshine, coral, orange and pink as accents (numerals, bands, slide
 * tags) on a white page, because lesson plans get printed. Fonts are the PDF
 * standard ones (Times, Helvetica, Courier), the way the lesson planner's PDF
 * export does it: every reader has them, nothing to embed.
 *
 * Each step shows the slides it uses ("Slides 3–5"), looked up by title in
 * the deck, so the numbers follow the deck when slides move.
 */
import { join } from 'node:path';
import PDFDocument from 'pdfkit';
import type { HybridDeck, HybridSlide } from './deck-types';
import { ACCENT_CYCLE, HYBRID as T, type AccentColor } from './hybrid-theme';
import type { LessonPlan, PlanStep, SlideSpan } from './lesson-plans';
import { parseMarks, plain } from './render-hybrid-deck';
import { ANIMAL_FARM_ESSAY, ESSAY_FORM, ESSAY_PROMPTS, QUOTING_HANDOUT } from './handouts';
import { SAMPLE_BODY, SAMPLE_CONCLUSION, SAMPLE_INTRODUCTION, SAMPLE_TITLE } from './sample-essay';

/** Images and icons, shipped with the decks so the app can serve them to the presenter. */
const ASSETS = join(import.meta.dir, '../../resources/thesis-essay-decks/assets');

// ---------------------------------------------------------------------------
// Slides, by title.

function titleOf(slide: HybridSlide): string | null {
  return 'title' in slide && typeof slide.title === 'string' ? plain(slide.title) : null;
}

/** One slide (by title, `#n` for the nth of that title) as a 0-based index. */
function slideIndex(deck: HybridDeck, name: string): number {
  const [title, nth] = name.split('#');
  const occurrence = nth ? Number(nth) : 1;
  let seen = 0;
  for (const [index, slide] of deck.slides.entries()) {
    if (titleOf(slide) === title && ++seen === occurrence) return index;
  }
  throw new Error(`No slide titled "${name}" in "${deck.title}"`);
}

/**
 * The 1-based slide numbers a span covers. `layout:<name>` is every slide of
 * that layout (the review quiz); a pair is a range, inclusive.
 */
export function resolveSpan(deck: HybridDeck, span: SlideSpan): number[] {
  if (typeof span === 'string' && span.startsWith('layout:')) {
    const layout = span.slice('layout:'.length);
    const numbers = deck.slides.flatMap((slide, index) => (slide.layout === layout ? [index + 1] : []));
    if (!numbers.length) throw new Error(`No ${layout} slides in "${deck.title}"`);
    return numbers;
  }
  if (typeof span === 'string') return [slideIndex(deck, span) + 1];
  const [from, to] = span.map((name) => slideIndex(deck, name) + 1);
  if (to < from) throw new Error(`Range "${span[0]}" to "${span[1]}" runs backwards`);
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

/** "Slide 3", "Slides 3–5", "Slides 6, 7", "Slides 2–7, 9". */
export function slideLabel(deck: HybridDeck, spans: readonly SlideSpan[]): string {
  const parts = spans.map((span) => {
    const numbers = resolveSpan(deck, span);
    const contiguous = numbers.every((n, i) => i === 0 || n === numbers[i - 1] + 1);
    return numbers.length > 1 && contiguous
      ? `${numbers[0]}–${numbers[numbers.length - 1]}`
      : numbers.join(', ');
  });
  const many = spans.length > 1 || parts[0].includes('–') || parts[0].includes(',');
  return `${many ? 'Slides' : 'Slide'} ${parts.join(', ')}`;
}

function* stepSpans(steps: readonly PlanStep[]): Generator<SlideSpan> {
  for (const step of steps) {
    yield* step.see ?? [];
    if (step.steps) yield* stepSpans(step.steps);
  }
}

/** Every slide a plan points at, for the tests. */
export function allSpans(plan: LessonPlan): SlideSpan[] {
  return plan.sections.flatMap((section) => [...stepSpans(section.steps)]);
}

// ---------------------------------------------------------------------------
// Characters. The standard PDF fonts draw Windows-1252 (WinAnsi) only.

const WIN_ANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');

export function isWinAnsi(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WIN_ANSI_EXTRA.has(char);
}

// ---------------------------------------------------------------------------
// Page.

type Doc = InstanceType<typeof PDFDocument>;

const PAGE = { width: 612, height: 792 }; // US Letter
const MARGIN = { top: 64, bottom: 64, left: 60, right: 60 };
const WIDTH = PAGE.width - MARGIN.left - MARGIN.right;
const BOTTOM = PAGE.height - MARGIN.bottom;

const FONT = {
  serif: 'Times-Roman',
  serifBold: 'Times-Bold',
  body: 'Helvetica',
  bold: 'Helvetica-Bold',
  italic: 'Helvetica-Oblique',
  boldItalic: 'Helvetica-BoldOblique',
  mono: 'Courier-Bold',
} as const;

const BODY_SIZE = 10.5;
const LINE_GAP = 2;
/** A fixed date, so a rebuild writes the same bytes and diffs stay quiet. */
const FIXED_DATE = new Date('2026-10-01T00:00:00Z');

const hex = (color: string) => `#${color}`;
const accent = (index: number): AccentColor => ACCENT_CYCLE[index % ACCENT_CYCLE.length];

function newDoc(title: string): Doc {
  return new PDFDocument({
    size: 'LETTER',
    margins: MARGIN,
    bufferPages: true,
    info: {
      Title: title,
      Author: 'YAWP! Writing Program',
      CreationDate: FIXED_DATE,
      ModDate: FIXED_DATE,
    },
  });
}

function finish(doc: Doc): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  return new Promise((resolve) => {
    doc.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks))));
    doc.end();
  });
}

/** Start a new page when the next thing would not fit on this one. */
function ensureSpace(doc: Doc, height: number): void {
  if (doc.y + height > BOTTOM) doc.addPage();
}

/** Rich text (`**bold**`, `__italic__`) as one wrapped paragraph. */
function writeRich(
  doc: Doc,
  source: string,
  { x, width, size = BODY_SIZE, color = T.ink }: { x: number; width: number; size?: number; color?: string }
): void {
  const segments = parseMarks(source);
  doc.fillColor(hex(color)).fontSize(size);
  segments.forEach((segment, index) => {
    const bold = segment.strong || segment.highlight;
    const font = bold && segment.italic ? FONT.boldItalic : bold ? FONT.bold : segment.italic ? FONT.italic : FONT.body;
    const options = { width, lineGap: LINE_GAP, continued: index < segments.length - 1 };
    doc.font(font);
    if (index === 0) doc.text(segment.text, x, doc.y, options);
    else doc.text(segment.text, options);
  });
}

function richHeight(doc: Doc, source: string, width: number, size = BODY_SIZE): number {
  return doc.font(FONT.body).fontSize(size).heightOfString(plain(source), { width, lineGap: LINE_GAP });
}

/** The small mono label over a block: "STUDENTS WILL…". */
function eyebrow(doc: Doc, text: string, x: number, y: number, color: string, width = WIDTH): void {
  doc
    .font(FONT.mono)
    .fontSize(8)
    .fillColor(hex(color))
    .text(text.toUpperCase(), x, y, { width, characterSpacing: 1.2, lineBreak: false });
}

/** A slide tag under a step: a tinted pill, "SLIDES 3–5". */
function slideTag(doc: Doc, label: string, x: number, color: AccentColor): void {
  const text = label.toUpperCase();
  doc.font(FONT.mono).fontSize(7.5);
  const w = doc.widthOfString(text, { characterSpacing: 0.8 }) + 12;
  const y = doc.y + 3;
  doc.save().roundedRect(x, y, w, 13, 6.5).fillOpacity(0.18).fill(hex(T[color])).restore();
  doc
    .font(FONT.mono)
    .fontSize(7.5)
    .fillColor(hex(T.ink))
    .text(text, x + 6, y + 3.2, { characterSpacing: 0.8, lineBreak: false });
  doc.y = y + 13;
}

// ---------------------------------------------------------------------------
// Blocks.

function header(doc: Doc, kicker: string, title: string, overview: string): void {
  doc.rect(0, 0, PAGE.width, 10).fill(hex(T.teal));
  const dots: AccentColor[] = ['sunshine', 'coral', 'orange', 'pink'];
  dots.forEach((color, i) => doc.circle(PAGE.width - MARGIN.right - 6 - i * 13, 40, 4).fill(hex(T[color])));

  eyebrow(doc, kicker, MARGIN.left, 36, T.teal);
  doc
    .font(FONT.serifBold)
    .fontSize(22)
    .fillColor(hex(T.ink))
    .text(title, MARGIN.left, 52, { width: WIDTH - 60, lineGap: 1 });
  doc.moveDown(0.4);
  writeRich(doc, overview, { x: MARGIN.left, width: WIDTH, size: 11, color: T.muted });
  doc.moveDown(1);
}

/** The goals, side by side on raised tiles. */
function goals(doc: Doc, plan: LessonPlan): void {
  const columns: { label: string; items: readonly string[]; color: AccentColor }[] = [
    { label: 'Students will…', items: plan.studentGoals, color: 'teal' },
  ];
  if (plan.teacherGoals) columns.push({ label: 'Teacher will…', items: plan.teacherGoals, color: 'orange' });

  const gap = 14;
  const tileW = (WIDTH - gap * (columns.length - 1)) / columns.length;
  const textW = tileW - 36;
  const heights = columns.map(
    (column) =>
      40 + column.items.reduce((sum, item) => sum + richHeight(doc, item, textW, 10) + 5, 0)
  );
  const tileH = Math.max(...heights);
  ensureSpace(doc, tileH + 10);
  const top = doc.y;

  columns.forEach((column, i) => {
    const x = MARGIN.left + i * (tileW + gap);
    doc.save().roundedRect(x, top, tileW, tileH, 8).fill(hex(T.paper)).restore();
    doc.save().roundedRect(x, top, tileW, tileH, 8).lineWidth(0.75).stroke(hex(T.rule)).restore();
    doc.save().roundedRect(x, top, tileW, 5, 2.5).fill(hex(T[column.color])).restore();
    eyebrow(doc, column.label, x + 16, top + 16, T[column.color], tileW - 32);
    doc.y = top + 32;
    for (const item of column.items) {
      const y = doc.y;
      doc.circle(x + 19, y + 6, 3).fill(hex(T[column.color]));
      writeRich(doc, item, { x: x + 28, width: textW, size: 10 });
      doc.y += 5;
    }
  });
  doc.x = MARGIN.left;
  doc.y = top + tileH + 16;
}

function materials(doc: Doc, items: readonly string[]): void {
  const text = items.join('   ·   ');
  ensureSpace(doc, 30 + richHeight(doc, text, WIDTH, 10));
  eyebrow(doc, 'Materials needed', MARGIN.left, doc.y, T.coral);
  doc.y += 13;
  writeRich(doc, text, { x: MARGIN.left, width: WIDTH, size: 10 });
  doc.moveDown(1.2);
}

function sectionHeading(doc: Doc, heading: string, color: AccentColor): void {
  ensureSpace(doc, 60);
  doc.moveDown(0.3);
  const y = doc.y;
  doc.save().rect(MARGIN.left, y, 28, 3).fill(hex(T[color])).restore();
  doc
    .font(FONT.serifBold)
    .fontSize(15)
    .fillColor(hex(T.ink))
    .text(heading, MARGIN.left, y + 9, { width: WIDTH });
  doc.moveDown(0.5);
}

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'];

function steps(
  doc: Doc,
  deck: HybridDeck,
  list: readonly PlanStep[],
  { depth, x, color }: { depth: number; x: number; color: AccentColor }
): void {
  list.forEach((step, index) => {
    const marker = depth === 0 ? String(index + 1) : depth === 1 ? `${LETTERS[index]}.` : `${ROMAN[index]}.`;
    const indent = depth === 0 ? 28 : 18;
    const textX = x + indent;
    const width = MARGIN.left + WIDTH - textX;
    const stepColor = depth === 0 ? accent(index) : color;
    // Keep a step's text and its slide tag on one page; only a very long
    // step (Brian's movie story) is left to flow across the break.
    ensureSpace(doc, Math.min(richHeight(doc, step.text, width) + (step.see ? 18 : 0), 220));

    const y = doc.y;
    if (depth === 0) {
      doc.circle(x + 10, y + 6.5, 10).fill(hex(T[stepColor]));
      doc
        .font(FONT.bold)
        .fontSize(9.5)
        .fillColor('#FFFFFF')
        .text(marker, x, y + 2, { width: 20, align: 'center', lineBreak: false });
    } else {
      doc
        .font(FONT.bold)
        .fontSize(BODY_SIZE - 0.5)
        .fillColor(hex(T.muted))
        .text(marker, x, y, { width: indent - 4, lineBreak: false });
    }
    doc.y = y;
    writeRich(doc, step.text, { x: textX, width });
    if (step.see?.length) slideTag(doc, slideLabel(deck, step.see), textX, stepColor);
    doc.y += depth === 0 ? 8 : 5;
    if (step.steps) steps(doc, deck, step.steps, { depth: depth + 1, x: textX, color: stepColor });
  });
}

function sourceNote(doc: Doc, text: string): void {
  ensureSpace(doc, 40);
  doc.moveDown(0.6);
  const y = doc.y;
  doc.save().moveTo(MARGIN.left, y).lineTo(MARGIN.left + WIDTH, y).lineWidth(0.5).stroke(hex(T.rule)).restore();
  doc
    .font(FONT.italic)
    .fontSize(8.5)
    .fillColor(hex(T.muted))
    .text(text, MARGIN.left, y + 8, { width: WIDTH, lineGap: 1.5 });
}

/** The YAWP! wordmark, the lesson and the page number at every page's foot. */
function footers(doc: Doc, label: string): void {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    // Drawing in the bottom margin would otherwise start another page.
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const y = PAGE.height - 38;
    doc.font(FONT.serifBold).fontSize(9).fillColor(hex(T.terracotta)).text('YAWP!', MARGIN.left, y, { lineBreak: false });
    doc
      .font(FONT.body)
      .fontSize(8)
      .fillColor(hex(T.muted))
      .text(label, MARGIN.left, y + 1, { width: WIDTH, align: 'center', lineBreak: false });
    doc.text(`${i + 1} of ${range.count}`, MARGIN.left, y + 1, { width: WIDTH, align: 'right', lineBreak: false });
    doc.page.margins.bottom = bottom;
  }
}

// ---------------------------------------------------------------------------
// Documents.

function lessonNumber(plan: LessonPlan): number {
  return Number(/^lesson-(\d+)/.exec(plan.deck)?.[1] ?? 0);
}

export function renderLessonPlan(plan: LessonPlan, deck: HybridDeck): Promise<Uint8Array> {
  const lesson = lessonNumber(plan);
  const doc = newDoc(plan.title);
  header(doc, `Thesis-Driven Essay · Lesson ${lesson} · Lesson plan`, plan.title, plan.overview);
  goals(doc, plan);
  materials(doc, plan.materials);
  plan.sections.forEach((section, i) => {
    const color = accent(i + 2);
    sectionHeading(doc, section.heading, color);
    if (section.intro) {
      writeRich(doc, section.intro, { x: MARGIN.left, width: WIDTH });
      doc.moveDown(0.5);
    }
    steps(doc, deck, section.steps, { depth: 0, x: MARGIN.left, color });
  });
  sourceNote(doc, plan.source);
  footers(doc, `Lesson ${lesson} · ${deck.title} · goes with the Lesson ${lesson} slide deck`);
  return finish(doc);
}

/**
 * The student sign-up handout: today's join flow, for the Day 1 lesson. It
 * replaces the old "Student Sign-up Process" PDF, which showed the teacher
 * class-code flow.
 */
export function renderSignUpHandout(): Promise<Uint8Array> {
  const doc = newDoc('Join your class on YAWP!');
  header(
    doc,
    'Thesis-Driven Essay · Day 1 · Student handout',
    'Join your class on YAWP!',
    'You’ll write your essay on **yawp.school**. Joining takes about a minute, and you don’t need an email address.'
  );

  const imageW = 150;
  const listW = WIDTH - imageW - 24;
  const top = doc.y;
  doc
    .save()
    .roundedRect(MARGIN.left + listW + 24, top, imageW, 365, 8)
    .fill(hex(T.paper))
    .restore();
  doc.image(join(ASSETS, 'yawp-join-page.png'), MARGIN.left + listW + 30, top + 6, {
    fit: [imageW - 12, 353],
    align: 'center',
  });

  doc.y = top;
  const joinSteps: PlanStep[] = [
    { text: 'Open the **join link** your teacher gives you, or scan the **QR code** on the board.' },
    { text: 'Type your **display name**: your real name, the way your teacher should see it.' },
    {
      text: 'Choose a **handle**: it’s how you log in. 3 to 30 characters: letters, numbers, dots, underscores and hyphens.',
    },
    { text: 'Choose a **password** and type it twice.' },
    { text: 'Click **Join class.** Already have a YAWP! account? Log in from the same page instead.' },
  ];
  doc.x = MARGIN.left;
  const right = MARGIN.left + listW;
  joinSteps.forEach((step, index) => {
    const y = doc.y;
    doc.circle(MARGIN.left + 10, y + 6.5, 10).fill(hex(T[accent(index)]));
    doc
      .font(FONT.bold)
      .fontSize(9.5)
      .fillColor('#FFFFFF')
      .text(String(index + 1), MARGIN.left, y + 2, { width: 20, align: 'center', lineBreak: false });
    doc.y = y;
    writeRich(doc, step.text, { x: MARGIN.left + 28, width: right - MARGIN.left - 28 });
    doc.y += 12;
  });

  // Somewhere to keep the login: forgotten passwords are the usual snag.
  doc.y += 6;
  const boxTop = doc.y;
  doc.save().roundedRect(MARGIN.left, boxTop, listW, 92, 8).fill(hex(T.sunshineSoft)).restore();
  eyebrow(doc, 'Write it down', MARGIN.left + 14, boxTop + 12, T.ink, listW - 28);
  doc.font(FONT.body).fontSize(10.5).fillColor(hex(T.ink));
  doc.text('My handle:', MARGIN.left + 14, boxTop + 34, { lineBreak: false });
  doc.text('My password:', MARGIN.left + 14, boxTop + 62, { lineBreak: false });
  for (const lineY of [boxTop + 45, boxTop + 73]) {
    doc
      .save()
      .moveTo(MARGIN.left + 90, lineY)
      .lineTo(MARGIN.left + listW - 14, lineY)
      .lineWidth(0.75)
      .stroke(hex(T.ink))
      .restore();
  }

  doc.y = Math.max(boxTop + 110, top + 385);
  sectionHeading(doc, 'You’re in', 'coral');
  const dashTop = doc.y;
  const dashW = 260;
  doc.image(join(ASSETS, 'yawp-student-dashboard.png'), MARGIN.left, dashTop, { fit: [dashW, 170] });
  doc.y = dashTop;
  const after: PlanStep[] = [
    { text: 'Your class is on your **dashboard.** Open it to see your assignments.' },
    { text: 'Start the **Thesis-Driven Essay.** That creates your document.' },
    { text: 'The **Tutor** on the left guides you through each step. Next class, open the same document: don’t make a new one.' },
  ];
  const listX = MARGIN.left + dashW + 20;
  after.forEach((step, index) => {
    const y = doc.y;
    doc.circle(listX + 4, y + 6, 3.5).fill(hex(T[accent(index + 2)]));
    doc.y = y;
    writeRich(doc, step.text, { x: listX + 14, width: MARGIN.left + WIDTH - listX - 14 });
    doc.y += 8;
  });

  footers(doc, 'Day 1 · Student sign-up handout · yawp.school');
  return finish(doc);
}

/**
 * The sample essay, "Bored in the USA", for students to read and mark up on
 * Day 1 and come back to in later lessons. The thesis is left unmarked: on
 * Day 1 the class finds it themselves.
 */
export function renderSampleEssayHandout(): Promise<Uint8Array> {
  const doc = newDoc(`Sample essay: ${SAMPLE_TITLE}`);
  header(
    doc,
    'Thesis-Driven Essay · Day 1 · Student handout',
    'Sample essay',
    'By Haley, a student. As you read, **underline or highlight anything you find interesting:** at least one thing in every paragraph.'
  );

  essay(doc, SAMPLE_TITLE, [SAMPLE_INTRODUCTION, ...SAMPLE_BODY, SAMPLE_CONCLUSION]);
  footers(doc, 'Day 1 · Sample essay · “Bored in the USA”');
  return finish(doc);
}

/** An essay as students read it: a centred serif title, then indented paragraphs. */
function essay(doc: Doc, title: string, paragraphs: readonly string[]): void {
  doc
    .font(FONT.serifBold)
    .fontSize(15)
    .fillColor(hex(T.ink))
    .text(title, MARGIN.left + 30, doc.y, { width: WIDTH - 60, align: 'center', lineGap: 2 });
  doc.moveDown(1);

  for (const paragraph of paragraphs) {
    doc.font(FONT.serif).fontSize(12);
    ensureSpace(doc, 3 * 18);
    doc.fillColor(hex(T.ink)).text(paragraph, MARGIN.left, doc.y, {
      width: WIDTH,
      lineGap: 5,
      indent: 28,
      align: 'left',
    });
    doc.moveDown(0.8);
  }
}

/**
 * Brian's model literary essay on Animal Farm, for Day 1 next to "Bored in
 * the USA": what the same form looks like when the essay is about a book.
 */
export function renderAnimalFarmEssayHandout(): Promise<Uint8Array> {
  const doc = newDoc(`Exemplar essay: ${ANIMAL_FARM_ESSAY.title}`);
  header(
    doc,
    'Thesis-Driven Essay · Day 1 · Student handout',
    'Exemplar essay',
    'A literary essay on George Orwell’s __Animal Farm__, by Brian Connell. As you read, **find the thesis statement**, then notice how each body paragraph proves one part of it.'
  );
  doc.font(FONT.serif).fontSize(12).fillColor(hex(T.ink));
  for (const line of ANIMAL_FARM_ESSAY.heading) doc.text(line, MARGIN.left, doc.y, { width: WIDTH, lineGap: 2 });
  doc.moveDown(1);
  essay(doc, ANIMAL_FARM_ESSAY.title, ANIMAL_FARM_ESSAY.paragraphs);
  footers(doc, 'Day 1 · Exemplar essay · Animal Farm');
  return finish(doc);
}

// ---------------------------------------------------------------------------
// The Critical Essay Form: the essay as an hourglass.

/** A five-pointed star, for the thesis at the point of the introduction. */
function star(doc: Doc, cx: number, cy: number, outer: number, fill: string, stroke: string): void {
  const points: [number, number][] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : outer * 0.45;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    points.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
  }
  doc.save().polygon(...points).lineWidth(1.25).fillAndStroke(hex(fill), hex(stroke)).restore();
}

/** Centred lines inside a shape, one under the other. */
function centredLines(doc: Doc, lines: readonly string[], cx: number, y: number, lineH: number, size: number): void {
  doc.font(FONT.body).fontSize(size).fillColor('#FFFFFF');
  lines.forEach((line, i) => {
    doc.text(line, cx - 100, y + i * lineH, { width: 200, align: 'center', lineBreak: false });
  });
}

function sideNote(doc: Doc, text: string, x: number, y: number, width: number, align: 'left' | 'right'): void {
  doc.font(FONT.body).fontSize(10).fillColor(hex(T.ink));
  const segments = parseMarks(text);
  segments.forEach((segment, index) => {
    doc.font(segment.strong ? FONT.bold : FONT.body);
    const options = { width, align, lineGap: 1.5, continued: index < segments.length - 1 };
    if (index === 0) doc.text(segment.text, x, y, options);
    else doc.text(segment.text, options);
  });
}

/**
 * The Critical Essay Form on one page: the introduction narrows to the
 * thesis (the star), the body paragraphs stack under it, and the conclusion
 * widens back out. The notes sit beside the part they explain.
 */
export function renderEssayFormHandout(): Promise<Uint8Array> {
  const form = ESSAY_FORM;
  const doc = newDoc('Critical Essay Form');
  header(doc, 'Thesis-Driven Essay · Student handout', 'Critical Essay Form', form.overview);

  const noteW = 128;
  const shapeW = 210;
  const cx = PAGE.width / 2;
  const left = cx - shapeW / 2;
  const right = cx + shapeW / 2;
  const leftNoteX = MARGIN.left;
  const rightNoteX = MARGIN.left + WIDTH - noteW;

  // Introduction: an upside-down triangle, general at the top, narrowing.
  const introTop = doc.y + 4;
  const introH = 172;
  doc.save().polygon([left, introTop], [right, introTop], [cx, introTop + introH]).fill(hex(T.teal)).restore();
  doc
    .font(FONT.bold)
    .fontSize(12)
    .fillColor('#FFFFFF')
    .text(form.introduction.label.toUpperCase(), cx - 100, introTop + 12, {
      width: 200,
      align: 'center',
      characterSpacing: 1,
      lineBreak: false,
    });
  centredLines(doc, form.introduction.openings, cx, introTop + 32, 13, 9.5);
  sideNote(doc, form.introduction.note, rightNoteX, introTop + 22, noteW, 'left');

  // The thesis: the star at the point, the last sentence of the introduction.
  const starY = introTop + introH + 2;
  star(doc, cx, starY, 13, T.sunshine, T.ink);
  eyebrow(doc, form.thesis.label, leftNoteX, starY - 4, T.ink, noteW);
  doc
    .save()
    .moveTo(leftNoteX + noteW - 4, starY)
    .lineTo(cx - 18, starY)
    .lineWidth(1.25)
    .stroke(hex(T.ink))
    .restore();
  doc
    .save()
    .polygon([cx - 16, starY], [cx - 23, starY - 3.5], [cx - 23, starY + 3.5])
    .fill(hex(T.ink))
    .restore();
  sideNote(doc, form.thesis.note, leftNoteX, starY + 12, noteW, 'left');

  // Body paragraphs: one pill each, in Brian's colours.
  const pillW = 160;
  const pillH = 30;
  const pillGap = 8;
  const bodyTop = starY + 22;
  form.body.paragraphs.forEach((label, i) => {
    const y = bodyTop + i * (pillH + pillGap);
    const color = (['sunshine', 'coral', 'orange', 'pink'] as const)[i % 4];
    doc.save().roundedRect(cx - pillW / 2, y, pillW, pillH, pillH / 2).fill(hex(T[color])).restore();
    doc
      .font(FONT.bold)
      .fontSize(11)
      .fillColor(color === 'sunshine' ? hex(T.ink) : '#FFFFFF')
      .text(label, cx - pillW / 2, y + 9.5, { width: pillW, align: 'center', lineBreak: false });
  });
  const bodyBottom = bodyTop + form.body.paragraphs.length * (pillH + pillGap) - pillGap;
  const bracketX = cx + pillW / 2 + 12;
  doc
    .save()
    .moveTo(bracketX - 6, bodyTop)
    .lineTo(bracketX, bodyTop)
    .lineTo(bracketX, bodyBottom)
    .lineTo(bracketX - 6, bodyBottom)
    .lineWidth(1.25)
    .stroke(hex(T.ink))
    .restore();
  sideNote(doc, form.body.note, rightNoteX, bodyTop + 2, noteW, 'left');

  // Conclusion: a triangle the right way up, widening back out.
  const conTop = bodyBottom + 14;
  const conH = 172;
  doc
    .save()
    .polygon([cx, conTop], [right, conTop + conH], [left, conTop + conH])
    .fill(hex(T.teal))
    .restore();
  doc
    .font(FONT.bold)
    .fontSize(12)
    .fillColor('#FFFFFF')
    .text(form.conclusion.label.toUpperCase(), cx - 100, conTop + 86, {
      width: 200,
      align: 'center',
      characterSpacing: 1,
      lineBreak: false,
    });
  centredLines(doc, form.conclusion.moves, cx, conTop + 106, 13, 9.5);
  sideNote(doc, form.conclusion.note, leftNoteX, conTop + 70, noteW, 'right');

  footers(doc, 'Critical Essay Form · goes with Lessons 1 to 3');
  return finish(doc);
}

// ---------------------------------------------------------------------------
// Prompts and quotations.

function paragraph(doc: Doc, text: string, { x = MARGIN.left, size = BODY_SIZE, color = T.ink as string } = {}): void {
  const width = MARGIN.left + WIDTH - x;
  ensureSpace(doc, Math.min(richHeight(doc, text, width, size), 60));
  writeRich(doc, text, { x, width, size, color });
  doc.moveDown(0.6);
}

/** Brian's essay prompts, for the teacher to use or adapt in Lesson 2. */
export function renderEssayPromptsHandout(): Promise<Uint8Array> {
  const doc = newDoc('Sample essay prompts');
  header(doc, 'Thesis-Driven Essay · Lesson 2 · For teachers', 'Sample essay prompts', ESSAY_PROMPTS.intro);

  ESSAY_PROMPTS.prompts.forEach((prompt, index) => {
    const color = accent(index);
    const textX = MARGIN.left + 32;
    const width = MARGIN.left + WIDTH - textX;
    const height =
      26 + prompt.paragraphs.reduce((sum, text) => sum + richHeight(doc, text, width, 11) + 8, 0);
    ensureSpace(doc, height + 30);

    const y = doc.y;
    doc.circle(MARGIN.left + 11, y + 9, 11).fill(hex(T[color]));
    doc
      .font(FONT.bold)
      .fontSize(10.5)
      .fillColor('#FFFFFF')
      .text(String(index + 1), MARGIN.left, y + 4, { width: 22, align: 'center', lineBreak: false });
    doc
      .font(FONT.serifBold)
      .fontSize(15)
      .fillColor(hex(T.ink))
      .text(prompt.heading, textX, y + 1, { width });
    doc.moveDown(0.4);
    for (const text of prompt.paragraphs) paragraph(doc, text, { x: textX, size: 11 });
    paragraph(doc, `__${ESSAY_PROMPTS.organized}__`, { x: textX, size: 10, color: T.muted });
    doc.moveDown(0.6);
  });

  footers(doc, 'Lesson 2 · Sample essay prompts');
  return finish(doc);
}

/** Fill-in-the-blank sentence templates on a raised tile. */
function templates(doc: Doc, label: string, lines: readonly string[], color: AccentColor): void {
  const lineH = 19;
  const tileH = 34 + lines.length * lineH;
  ensureSpace(doc, tileH + 12);
  const top = doc.y;
  doc.save().roundedRect(MARGIN.left, top, WIDTH, tileH, 8).fill(hex(T.paper)).restore();
  doc.save().roundedRect(MARGIN.left, top, WIDTH, tileH, 8).lineWidth(0.75).stroke(hex(T.rule)).restore();
  doc.save().roundedRect(MARGIN.left, top, 5, tileH, 2.5).fill(hex(T[color])).restore();
  eyebrow(doc, label, MARGIN.left + 18, top + 13, T[color], WIDTH - 36);
  lines.forEach((line, i) => {
    doc
      .font(FONT.serif)
      .fontSize(12)
      .fillColor(hex(T.ink))
      .text(line, MARGIN.left + 18, top + 30 + i * lineH, { width: WIDTH - 36, lineBreak: false });
  });
  doc.x = MARGIN.left;
  doc.y = top + tileH + 12;
}

/** A worked example: serif, set in from the margin behind a coloured rule. */
function example(doc: Doc, text: string, color: AccentColor): void {
  const x = MARGIN.left + 18;
  const width = WIDTH - 18;
  doc.font(FONT.serif).fontSize(12);
  const height = doc.heightOfString(text, { width, lineGap: 3 });
  ensureSpace(doc, height + 10);
  const top = doc.y;
  doc.save().rect(MARGIN.left + 4, top, 3, height).fill(hex(T[color])).restore();
  doc.fillColor(hex(T.ink)).text(text, x, top, { width, lineGap: 3 });
  doc.moveDown(0.6);
}

/**
 * Lesson 5's handout: bringing in quotations and explaining them (Purdue
 * OWL's "Quoting Others"), then citing them and the works cited page.
 */
export function renderQuotingHandout(): Promise<Uint8Array> {
  const { owl, citing, worksCited } = QUOTING_HANDOUT;
  const doc = newDoc('Quoting and citing sources');
  header(doc, 'Thesis-Driven Essay · Lesson 5 · Student handout', 'Quoting and citing sources', QUOTING_HANDOUT.overview);

  sectionHeading(doc, `1  ${owl.heading}`, 'teal');
  paragraph(doc, `__${owl.source}__`, { size: 9.5, color: T.muted });
  paragraph(doc, owl.intro);
  owl.situations.forEach((situation, i) => {
    const y = doc.y;
    doc
      .font(FONT.bold)
      .fontSize(BODY_SIZE)
      .fillColor(hex(T.muted))
      .text(`${LETTERS[i]}.`, MARGIN.left + 10, y, { width: 16, lineBreak: false });
    doc.y = y;
    writeRich(doc, situation, { x: MARGIN.left + 28, width: WIDTH - 28 });
    doc.y += 4;
  });
  doc.moveDown(0.6);
  paragraph(doc, owl.problem);
  templates(doc, owl.introducing.label, owl.introducing.templates, 'teal');
  paragraph(doc, owl.that);
  paragraph(doc, owl.explainIntro);
  templates(doc, owl.explaining.label, owl.explaining.templates, 'orange');

  sectionHeading(doc, `2  ${citing.heading}`, 'coral');
  paragraph(doc, citing.intro);
  paragraph(doc, citing.ways);
  for (const [way, color] of [
    [citing.parentheses, 'coral'],
    [citing.direct, 'pink'],
  ] as const) {
    ensureSpace(doc, 80);
    eyebrow(doc, way.label, MARGIN.left, doc.y, T[color]);
    doc.y += 14;
    example(doc, way.example, color);
    paragraph(doc, way.note);
    if ('questionExample' in way) {
      example(doc, way.questionExample, color);
      paragraph(doc, way.questionNote, { size: 10, color: T.muted });
    } else {
      example(doc, way.thatExample, color);
      paragraph(doc, way.thatNote);
    }
    doc.moveDown(0.4);
  }

  sectionHeading(doc, `3  ${worksCited.heading}`, 'sunshine');
  paragraph(doc, worksCited.text);
  ensureSpace(doc, 30);
  doc
    .font(FONT.body)
    .fontSize(9)
    .fillColor(hex(T.teal))
    .text(worksCited.link, MARGIN.left, doc.y, { width: WIDTH, link: worksCited.link, underline: true });

  footers(doc, 'Lesson 5 · Quoting and citing sources');
  return finish(doc);
}
