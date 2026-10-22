/**
 * The gallery deck as PowerPoint (Yawp! Lesson Deck Kit, spec v3, "Building
 * it for Slides and PowerPoint"). The same templates, grounds, colors and
 * rhythm as Present (`planGalleryDeck`), on a 13.333 × 7.5 in canvas where a
 * kit pixel is 0.01042 in and a point is px × 0.75.
 *
 * Georgia and Arial only, as the theme fonts too: both ship with PowerPoint
 * and appear in Google Slides, so nothing substitutes and nothing reflows.
 * Georgia is never bold. Only rectangles, 1px lines, circles and pills; no
 * shadows, gradients or transparency (on dark grounds the hairlines are solid
 * #4A5C59 or #3A3936). Images arrive pre-cropped to their boxes, so nothing
 * stretches in either app. Every word is a real text box, and a slide's
 * label, headline and body share one so they push each other down instead of
 * colliding. No slide numbers.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import PptxGenJS from 'pptxgenjs';
import { deckArt, type DeckArt } from './deck-art';
import { splitColorMarks } from './deck-colors';
import {
  GALLERY_COLORS,
  galleryColors,
  galleryRunningHead,
  planGalleryDeck,
  promptTypeSize,
  type GallerySlidePlan,
} from './deck-gallery';
import type { SlideDeck } from './slide-deck';
import { notesWithMinutes } from './tile-theme';
import { upperKeepingBrand } from '~/domain/brand';

const LAYOUT = { name: 'YAWP_GALLERY_16x9', width: 13.333, height: 7.5 };
const SERIF = 'Georgia';
const SANS = 'Arial';
const hex = (color: string) => color.replace('#', '').toUpperCase();
const C = Object.fromEntries(Object.entries(GALLERY_COLORS).map(([key, value]) => [key, hex(value)])) as {
  [K in keyof typeof GALLERY_COLORS]: string;
};
const CREAM = 'F3F0E8';

/** A kit pixel in inches. */
const px = (value: number) => (value * LAYOUT.width) / 1280;
/** A kit pixel size in points. */
const pt = (value: number) => Math.round(value * 0.75 * 10) / 10;

type PptxSlide = ReturnType<PptxGenJS['addSlide']>;
type Tone = { ink: string; muted: string; accent: string; rule: string; color: string };
type Box = { x: number; y: number; w: number; h: number };
type Run = { text: string; options: PptxGenJS.TextPropsOptions };

/** An image's bytes, from the built client or the source public folder. */
function imageData(src: string): string | null {
  for (const root of ['build/client', 'public']) {
    const path = join(process.cwd(), root, src);
    if (existsSync(path)) return `image/jpeg;base64,${readFileSync(path).toString('base64')}`;
  }
  return null;
}

function toneFor(plan: GallerySlidePlan): Tone {
  const color = hex(plan.color);
  if (plan.ground === 'pine') return { ink: CREAM, muted: 'C5CCC9', accent: C.accentOnDark, rule: C.pineRule, color: C.accentOnDark };
  if (plan.ground === 'ink') return { ink: CREAM, muted: 'BDB9B2', accent: C.accentOnDark, rule: C.inkRule, color: C.accentOnDark };
  if (plan.ground === 'accent') return { ink: CREAM, muted: 'F1DED6', accent: 'F6E3DA', rule: 'C9876B', color: CREAM };
  return { ink: C.ink, muted: C.stone, accent: color, rule: C.rule, color };
}

function groundColor(plan: GallerySlidePlan, primary: string): string {
  if (plan.ground === 'pine') return C.pine;
  if (plan.ground === 'ink') return C.ink;
  if (plan.ground === 'accent') return hex(primary);
  return C.paper;
}

/** A soft, solid tint of a color on paper: the band behind a right answer. */
function band(color: string): string {
  const [r, g, b] = [0, 2, 4].map((at) => parseInt(color.slice(at, at + 2), 16));
  const paper = [0xf3, 0xf0, 0xe8];
  return [r!, g!, b!]
    .map((channel, i) => Math.round(paper[i]! + (channel - paper[i]!) * 0.16).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

type Ctx = {
  slide: PptxSlide;
  plan: GallerySlidePlan;
  tone: Tone;
  deck: SlideDeck;
  art: DeckArt | null;
  colors: string[];
  image: (src: string) => string | null;
};

const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi'];

// Runs ------------------------------------------------------------------

const serif = (text: string, size: number, color: string, extra: PptxGenJS.TextPropsOptions = {}): Run => ({
  text,
  options: { fontFace: SERIF, fontSize: pt(size), color, bold: false, ...extra },
});
const sans = (text: string, size: number, color: string, extra: PptxGenJS.TextPropsOptions = {}): Run => ({
  text,
  options: { fontFace: SANS, fontSize: pt(size), color, ...extra },
});
const caps = (text: string, size: number, color: string): Run =>
  sans(upperKeepingBrand(text), size, color, { bold: true, charSpacing: size * 0.16 * 0.75 });

/** Text with its color marks, as runs in one face. */
function marked(ctx: Ctx, text: string, make: (text: string, color: string, extra?: PptxGenJS.TextPropsOptions) => Run, color: string, accentWord?: string): Run[] {
  const runs: Run[] = [];
  for (const part of splitColorMarks(text, ctx.colors)) {
    if (part.color) {
      runs.push(make(part.text, hex(part.color)));
      continue;
    }
    const at = accentWord ? part.text.toLowerCase().indexOf(accentWord.toLowerCase()) : -1;
    if (!accentWord || at < 0) {
      runs.push(make(part.text, color));
      continue;
    }
    runs.push(make(part.text.slice(0, at), color));
    runs.push(make(part.text.slice(at, at + accentWord.length), ctx.tone.accent, { italic: true }));
    runs.push(make(part.text.slice(at + accentWord.length), color));
  }
  return runs.filter((run) => run.text);
}

/** Paragraphs in one text box: each paragraph is runs, ended with a break. */
function block(ctx: Ctx, paragraphs: Run[][], box: Box, extra: PptxGenJS.TextPropsOptions = {}): void {
  const runs: PptxGenJS.TextProps[] = [];
  paragraphs
    .filter((paragraph) => paragraph.length)
    .forEach((paragraph, i, all) => {
      paragraph.forEach((run, j) => {
        const last = j === paragraph.length - 1;
        runs.push({
          text: run.text,
          options: {
            ...run.options,
            ...(last && i < all.length - 1 ? { breakLine: true } : {}),
            paraSpaceAfter: last ? 14 : undefined,
          },
        });
      });
    });
  if (!runs.length) return;
  ctx.slide.addText(runs, {
    x: px(box.x),
    y: px(box.y),
    w: px(box.w),
    h: px(box.h),
    margin: 0,
    valign: 'middle',
    lineSpacingMultiple: 1.05,
    fit: 'shrink',
    ...extra,
  });
}

function line(ctx: Ctx, x: number, y: number, w: number, color = ctx.tone.rule, weight = 0.75): void {
  ctx.slide.addShape('line', { x: px(x), y: px(y), w: px(w), h: 0, line: { color, width: weight } });
}

function pill(ctx: Ctx, text: string, box: Box, fill: string | null, color: string): void {
  ctx.slide.addText(text, {
    shape: 'roundRect',
    rectRadius: px(box.h / 2),
    x: px(box.x),
    y: px(box.y),
    w: px(box.w),
    h: px(box.h),
    fill: fill ? { color: fill } : undefined,
    line: fill ? { color: fill } : { color, width: 1.1 },
    fontFace: SANS,
    fontSize: pt(17),
    bold: true,
    color,
    align: 'center',
    valign: 'middle',
    margin: 0,
  });
}

function picture(ctx: Ctx, src: string, box: Box, contain = false): void {
  const data = ctx.image(src);
  if (!data) {
    ctx.slide.addShape('rect', { x: px(box.x), y: px(box.y), w: px(box.w), h: px(box.h), fill: { color: C.mat }, line: { color: C.mat } });
    return;
  }
  ctx.slide.addImage({
    data,
    x: px(box.x),
    y: px(box.y),
    w: px(box.w),
    h: px(box.h),
    ...(contain ? { sizing: { type: 'contain', w: px(box.w), h: px(box.h) } } : {}),
    altText: ctx.art ? `${ctx.art.title}, ${ctx.art.artist}` : undefined,
  });
}

function runningHead(ctx: Ctx, left = 80, swatch = true): void {
  const art = ctx.art;
  if (swatch && art) picture(ctx, art.crops.swatch, { x: left, y: 41, w: 26, h: 26 });
  const textLeft = swatch && art ? left + 40 : left;
  block(ctx, [[caps(galleryRunningHead(ctx.deck), 13, ctx.tone.muted)]], { x: textLeft, y: 38, w: 1280 - 80 - textLeft, h: 32 }, { fit: 'none' });
  line(ctx, left, 84, 1280 - 80 - left);
}

const modeRun = (ctx: Ctx, size = 36): Run[] =>
  ctx.plan.mode ? [serif(ctx.plan.mode, size, ctx.tone.accent, { italic: true })] : [];

// Templates -------------------------------------------------------------

function drawSlide(ctx: Ctx): void {
  const { plan, tone } = ctx;
  const spec = plan.slide;
  const art = ctx.art;
  switch (plan.template) {
    case 'title': {
      const right = art ? 560 : 80;
      block(
        ctx,
        [
          ctx.deck.unit ? [caps(ctx.deck.unit, 15, tone.muted)] : [],
          [serif(spec.title, spec.title.length > 24 ? 84 : 112, tone.ink)],
          spec.subtitle ? [serif(spec.subtitle, 42, tone.accent, { italic: true })] : [],
        ],
        { x: 80, y: 150, w: 1280 - 80 - right, h: 330 },
        { valign: 'bottom', lineSpacingMultiple: 0.92 }
      );
      line(ctx, 80, 500, 72, tone.color, 2.25);
      if (spec.course) block(ctx, [[sans(spec.course, 20, tone.muted)]], { x: 80, y: 518, w: 1280 - 80 - right, h: 40 }, { valign: 'top' });
      if (art) {
        ctx.slide.addShape('rect', { x: px(712), y: px(132), w: px(492), h: px(382), fill: { color: C.mat }, line: { color: C.mat } });
        picture(ctx, art.src, { x: 726, y: 146, w: 464, h: 354 }, true);
        block(
          ctx,
          [
            [sans(art.artist, 16, tone.ink, { bold: true })],
            [serif(`${art.title}, ${art.year}`, 20, tone.ink, { italic: true })],
            [sans(`${art.medium} · ${art.collection}`, 14, tone.muted)],
          ],
          { x: 712, y: 536, w: 492, h: 90 },
          { valign: 'top', lineSpacingMultiple: 1.0 }
        );
      }
      return;
    }

    case 'agenda': {
      runningHead(ctx);
      block(ctx, [[serif(plan.mode ?? 'Today’s program', 54, tone.accent, { italic: true })], spec.body ? [sans(spec.body, 20, tone.muted)] : []], { x: 80, y: 140, w: 380, h: 470 });
      const items = spec.agenda ?? (spec.bullets ?? []).map((title) => ({ title, minutes: undefined as number | undefined }));
      const rowH = Math.min(72, 460 / Math.max(items.length, 1));
      const top = 140 + (470 - rowH * items.length) / 2;
      items.forEach((item, i) => {
        const y = top + i * rowH;
        line(ctx, 500, y, 700);
        block(ctx, [[serif(`${ROMAN[i] ?? i + 1}.`, 30, tone.color, { italic: true })]], { x: 500, y, w: 60, h: rowH });
        block(ctx, [[sans(item.title, 26, tone.ink)]], { x: 566, y, w: 520, h: rowH });
        if (item.minutes) block(ctx, [[sans(`${item.minutes} min`, 17, tone.muted, { bold: true })]], { x: 1090, y, w: 110, h: rowH }, { align: 'right' });
      });
      line(ctx, 500, top + rowH * items.length, 700);
      return;
    }

    case 'steps': {
      runningHead(ctx);
      block(ctx, [[...modeRun(ctx), ...(plan.mode ? [serif('  ', 54, tone.ink)] : []), serif(spec.title, 54, tone.ink)]], { x: 80, y: 130, w: spec.minutes ? 960 : 1120, h: 80 });
      if (spec.minutes) pill(ctx, `${spec.minutes} min`, { x: 1100, y: 152, w: 100, h: 38 }, null, tone.ink);
      const steps = (spec.bullets ?? []).slice(0, 4);
      const colW = 1120 / Math.max(steps.length, 1);
      steps.forEach((text, i) => {
        const x = 80 + i * colW;
        if (i) ctx.slide.addShape('line', { x: px(x - 12), y: px(262), w: 0, h: px(420), line: { color: tone.rule, width: 0.75 } });
        block(ctx, [[serif(String(i + 1), 82, tone.color)], marked(ctx, text, (t, c, e) => sans(t, 26, c, e), tone.ink)], { x: i ? x + 34 : x, y: 270, w: colW - 70, h: 380 }, { valign: 'top', lineSpacingMultiple: 1.3 });
      });
      return;
    }

    case 'discuss': {
      runningHead(ctx);
      const question = spec.question ?? spec.body ?? spec.title;
      const chip = [spec.grouping, spec.minutes && !spec.grouping?.includes('min') ? `${spec.minutes} min` : null].filter(Boolean).join(' · ');
      let y = 150;
      if (plan.mode || chip) {
        if (plan.mode) block(ctx, [modeRun(ctx)], { x: 80, y, w: 220, h: 50 });
        if (chip) pill(ctx, chip, { x: plan.mode ? 80 + plan.mode.length * 18 + 24 : 80, y: y + 6, w: Math.max(140, chip.length * 11 + 40), h: 38 }, null, tone.ink);
        y += 70;
      }
      const size = promptTypeSize(question);
      const qH = spec.choices?.length ? 150 : 220;
      block(ctx, [marked(ctx, question, (t, c, e) => serif(t, size, c, e), tone.ink)], { x: 80, y, w: 1050, h: qH }, { valign: 'top' });
      y += qH + 10;
      if (spec.choices?.length) {
        const rowH = 62;
        spec.choices.forEach((choice, i) => {
          const rowY = y + i * rowH;
          if (spec.answer === i + 1) ctx.slide.addShape('rect', { x: px(80), y: px(rowY), w: px(1050), h: px(rowH), fill: { color: band(hex(plan.color)) }, line: { color: band(hex(plan.color)) } });
          line(ctx, 80, rowY, 1050);
          block(ctx, [[serif(`${'abcde'[i]}.`, 30, tone.color, { italic: true })]], { x: 96, y: rowY, w: 50, h: rowH });
          block(ctx, [marked(ctx, choice, (t, c, e) => sans(t, 26, c, e), tone.ink)], { x: 160, y: rowY, w: 950, h: rowH });
        });
        line(ctx, 80, y + spec.choices.length * rowH, 1050);
        y += spec.choices.length * rowH + 20;
      }
      if (spec.stem) {
        line(ctx, 80, y, 1050);
        block(ctx, [[caps('Try', 15, tone.muted)]], { x: 80, y: y + 16, w: 80, h: 50 });
        block(ctx, [[serif(spec.stem, 30, tone.ink, { italic: true })]], { x: 170, y: y + 16, w: 960, h: 50 });
        y += 80;
      }
      if (spec.followUp) block(ctx, [[sans(spec.followUp, 20, tone.muted)]], { x: 80, y, w: 1050, h: 50 }, { valign: 'top' });
      return;
    }

    case 'big_idea': {
      const withArt = plan.showArt && art;
      const left = withArt ? 410 : 80;
      if (withArt) picture(ctx, art.crops.strip, { x: 0, y: 0, w: 330, h: 720 });
      runningHead(ctx, left, !withArt);
      const statement = spec.body ?? spec.title;
      block(
        ctx,
        [modeRun(ctx), marked(ctx, statement, (t, c, e) => serif(t, promptTypeSize(statement), c, e), tone.ink, spec.accentWord), spec.followUp ? [sans(spec.followUp, 20, tone.muted)] : []],
        { x: left, y: 120, w: 1280 - 60 - left, h: 510 }
      );
      if (withArt) block(ctx, [[sans(`${art.artist}, `, 14, tone.muted), sans(art.title, 14, tone.muted, { italic: true }), sans(`, ${art.year} · ${art.collection}`, 14, tone.muted)]], { x: left, y: 664, w: 800, h: 30 });
      return;
    }

    case 'write': {
      runningHead(ctx);
      const prompt = spec.body ?? spec.question ?? spec.title;
      block(ctx, [modeRun(ctx), marked(ctx, prompt, (t, c, e) => serif(t, promptTypeSize(prompt), c, e), tone.ink, spec.accentWord)], { x: 80, y: 120, w: 1050, h: 470 });
      line(ctx, 80, 616, 1120);
      const footer = [spec.routine, spec.stem ?? spec.followUp].filter(Boolean).join(' · ');
      if (footer) block(ctx, [[sans(footer, 19, tone.muted)]], { x: 80, y: 640, w: 820, h: 44 });
      const minutes = spec.seconds ? Math.max(1, Math.round(spec.seconds / 60)) : spec.minutes;
      if (minutes) block(ctx, [[serif(String(minutes), 56, tone.ink), sans('  ', 17, tone.muted), caps(minutes === 1 ? 'minute' : 'minutes', 17, tone.muted)]], { x: 900, y: 632, w: 300, h: 60 }, { align: 'right' });
      return;
    }

    case 'notes': {
      runningHead(ctx);
      block(ctx, [[...modeRun(ctx), ...(plan.mode ? [serif('  ', 54, tone.ink)] : []), serif(spec.title, 54, tone.ink)]], { x: 80, y: 130, w: 1120, h: 80 });
      const timeline = (spec.timeline ?? []).slice(0, 5);
      if (timeline.length) {
        const width = 1150 / timeline.length;
        line(ctx, 89, 253, 1111, tone.ink, 1.5);
        timeline.forEach((entry, i) => {
          const x = 80 + i * width;
          const accent = entry.mark === 'accent';
          const fill = entry.mark === 'ink' ? tone.ink : accent ? tone.color : C.paper;
          ctx.slide.addShape('ellipse', { x: px(x), y: px(244), w: px(18), h: px(18), fill: { color: fill }, line: { color: accent ? tone.color : tone.ink, width: 1.5 } });
          block(ctx, [[serif(entry.year, 37, accent ? tone.color : tone.ink)], [sans(entry.caption, 18, tone.muted)]], { x, y: 276, w: width - 20, h: 110 }, { valign: 'top', lineSpacingMultiple: 1.0 });
        });
      }
      const facts = (spec.facts ?? (timeline.length ? [] : spec.bullets ?? [])).slice(0, 3);
      if (facts.length) {
        const top = timeline.length ? 548 : 260;
        line(ctx, 80, top, 1120);
        const colW = 1120 / facts.length;
        facts.forEach((fact, i) => block(ctx, [marked(ctx, fact, (t, c, e) => sans(t, 22, c, e), tone.ink)], { x: 80 + i * colW, y: top + 24, w: colW - 40, h: 120 }, { valign: 'top', lineSpacingMultiple: 1.3 }));
      }
      return;
    }

    case 'divider': {
      const withArt = plan.ground === 'art' && art;
      const left = withArt ? 826 : 80;
      if (withArt) picture(ctx, art.crops.divider, { x: 0, y: 0, w: 768, h: 720 });
      block(ctx, [modeRun(ctx), [serif(spec.title, 78, tone.ink)]], { x: left, y: 160, w: 1280 - 70 - left, h: 260 }, { valign: 'bottom', lineSpacingMultiple: 0.95 });
      line(ctx, left, 446, 58, tone.color, 2.25);
      if (spec.subtitle) block(ctx, [[sans(spec.subtitle, 21, tone.ink)]], { x: left, y: 470, w: 1280 - 70 - left, h: 100 }, { valign: 'top' });
      if (withArt) block(ctx, [[sans(`${art.artist}, `, 14, tone.muted), sans(art.title, 14, tone.muted, { italic: true }), sans(` (detail), ${art.year}`, 14, tone.muted)]], { x: left, y: 650, w: 1280 - 70 - left, h: 30 });
      return;
    }

    case 'read': {
      runningHead(ctx);
      const lines = [spec.subtitle ?? spec.body, spec.work ? `${spec.work}${spec.page ? ` · ${spec.page}` : ''}` : null].filter((value): value is string => Boolean(value));
      block(ctx, [modeRun(ctx), [serif(spec.title, 54, tone.ink)], ...lines.map((text) => [sans(text, 20, tone.muted)])], { x: 80, y: 120, w: 400, h: 500 });
      const tasks = spec.tasks?.length ? spec.tasks.slice(0, 3) : (spec.bullets ?? []).slice(0, 3).map((text) => ({ verb: '', text }));
      const rowH = 92;
      const top = 120 + (500 - rowH * tasks.length) / 2;
      tasks.forEach((task, i) => {
        const y = top + i * rowH;
        line(ctx, 530, y, 670);
        if (task.verb) block(ctx, [[serif(task.verb, 32, tone.color, { italic: true })]], { x: 530, y, w: 170, h: rowH });
        block(ctx, [marked(ctx, task.text, (t, c, e) => sans(t, 26, c, e), tone.ink)], { x: task.verb ? 710 : 530, y, w: task.verb ? 490 : 670, h: rowH });
      });
      line(ctx, 530, top + rowH * tasks.length, 670);
      return;
    }

    case 'look': {
      const question = spec.question ?? spec.body ?? spec.title;
      const withArt = plan.showArt && art;
      if (withArt) {
        picture(ctx, art.src, { x: 64, y: 74, w: 720, h: 538 }, true);
        block(ctx, [[sans(`${art.artist}, `, 14, tone.muted), sans(art.title, 14, tone.muted, { italic: true }), sans(`, ${art.year} · ${art.collection}`, 14, tone.muted)]], { x: 64, y: 626, w: 720, h: 30 });
      }
      const timing = [spec.seconds ? `${spec.seconds} seconds` : null, spec.routine].filter(Boolean).join(' · ');
      const left = withArt ? 846 : 80;
      block(
        ctx,
        [modeRun(ctx), timing ? [caps(timing, 16, tone.muted)] : [], marked(ctx, question, (t, c, e) => serif(t, withArt ? 38 : promptTypeSize(question), c, e), tone.ink), spec.followUp ? [serif(spec.followUp, 30, tone.muted, { italic: true })] : []],
        { x: left, y: 100, w: 1280 - 70 - left, h: 520 }
      );
      return;
    }

    case 'excerpt': {
      runningHead(ctx);
      ctx.slide.addShape('rect', { x: px(80), y: px(206), w: px(726), h: px(338), fill: { color: C.sheet }, line: { color: C.sheet } });
      const who: Run[] = [];
      if (spec.author ?? spec.attribution) who.push(sans(spec.author ?? spec.attribution ?? '', 15, C.ink, { bold: true }));
      if (spec.work) who.push(sans(', ', 15, C.ink), serif(spec.work, 17, C.ink, { italic: true }));
      if (spec.page) who.push(sans(`   p. ${spec.page.replace(/^p+\.\s*/i, '')}`, 15, C.stone));
      block(ctx, [[serif(spec.body ?? '', 29, C.ink)], who], { x: 136, y: 236, w: 614, h: 278 }, { lineSpacingMultiple: 1.3 });
      const tasks = spec.tasks?.length ? spec.tasks.slice(0, 3) : (spec.bullets ?? []).slice(0, 3).map((text) => ({ verb: '', text }));
      if (plan.mode) block(ctx, [modeRun(ctx)], { x: 870, y: 190, w: 330, h: 60 });
      const rowH = 82;
      tasks.forEach((task, i) => {
        const y = 262 + i * rowH;
        line(ctx, 870, y, 330);
        block(ctx, [[...(task.verb ? [sans(`${task.verb} `, 22, tone.ink, { bold: true })] : []), ...marked(ctx, task.text, (t, c, e) => sans(t, 22, c, e), tone.ink)]], { x: 870, y, w: 330, h: rowH });
      });
      line(ctx, 870, 262 + rowH * tasks.length, 330);
      return;
    }

    case 'exit': {
      runningHead(ctx, 80, false);
      const prompt = spec.body ?? spec.title;
      block(ctx, [modeRun(ctx), marked(ctx, prompt, (t, c, e) => serif(t, promptTypeSize(prompt) - 8, c, e), tone.ink)], { x: 80, y: 150, w: art ? 780 : 1080, h: 330 }, { valign: 'bottom' });
      if (spec.button) {
        const label = `Open Yawp! → ${spec.button}`;
        pill(ctx, label, { x: 80, y: 510, w: label.length * 12 + 48, h: 48 }, 'F7F1EA', C.ink);
        block(ctx, [[sans('or finish it on paper', 18, tone.muted)]], { x: 80 + label.length * 12 + 70, y: 510, w: 320, h: 48 });
      }
      if (art) {
        ctx.slide.addShape('rect', { x: px(930), y: px(262), w: px(270), h: px(212), fill: { color: 'F7F1EA' }, line: { color: 'F7F1EA' } });
        picture(ctx, art.src, { x: 946, y: 278, w: 238, h: 180 }, true);
        if (spec.nextLesson) block(ctx, [[sans(`Next time: ${spec.nextLesson}`, 15, tone.muted)]], { x: 930, y: 488, w: 270, h: 30 });
      } else if (spec.nextLesson) {
        block(ctx, [[sans(`Next time: ${spec.nextLesson}`, 15, tone.muted)]], { x: 80, y: 620, w: 600, h: 30 });
      }
      return;
    }

    case 'compare': {
      runningHead(ctx);
      block(ctx, [[serif(spec.title, 54, tone.ink)]], { x: 80, y: 130, w: 1120, h: 80 });
      [spec.left, spec.right].forEach((column, i) => {
        if (!column) return;
        const x = 80 + i * 588;
        line(ctx, x, 260, 532);
        block(ctx, [[serif(column.label, 30, tone.color, { italic: true })], marked(ctx, column.text, (t, c, e) => sans(t, 24, c, e), tone.ink)], { x, y: 280, w: 532, h: 360 }, { valign: 'top', lineSpacingMultiple: 1.3 });
      });
      return;
    }
  }
}

export async function renderDeckPptxGallery(deck: SlideDeck): Promise<Uint8Array> {
  const pptx = new PptxGenJS();
  pptx.defineLayout(LAYOUT);
  pptx.layout = LAYOUT.name;
  pptx.theme = { headFontFace: SERIF, bodyFontFace: SANS };
  pptx.title = deck.title;
  if (deck.subtitle) pptx.subject = deck.subtitle;
  pptx.company = 'Yawp!';

  const colors = galleryColors(deck);
  const art = deckArt(deck.art);
  const cache = new Map<string, string | null>();
  const image = (src: string) => {
    if (!cache.has(src)) cache.set(src, imageData(src));
    return cache.get(src)!;
  };
  for (const plan of planGalleryDeck(deck)) {
    const slide = pptx.addSlide();
    slide.background = { color: groundColor(plan, colors[0]!) };
    drawSlide({ slide, plan, tone: toneFor(plan), deck, art, colors, image });
    slide.addNotes(notesWithMinutes(plan.slide.speakerNotes, plan.slide.minutes));
  }

  const written = await pptx.write({ outputType: 'nodebuffer' });
  return new Uint8Array(written as Buffer);
}
