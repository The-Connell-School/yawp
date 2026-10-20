/**
 * The gallery deck as PowerPoint (Yawp! Lesson Deck Kit). The same templates,
 * grounds and rhythm as Present (`planGalleryDeck`), laid out on the kit's
 * 1280×720 canvas. PowerPoint cannot embed the web fonts, so the kit's
 * fallbacks stand in: Georgia for Cormorant Garamond, set 8% smaller, and
 * Franklin Gothic Book for Libre Franklin. Every slide is ordinary text
 * boxes, so a teacher can still edit it, and nothing carries a slide number.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import PptxGenJS from 'pptxgenjs';
import { deckArt, type DeckArt } from './deck-art';
import {
  GALLERY_COLORS,
  galleryAccent,
  galleryRunningHead,
  planGalleryDeck,
  promptTypeSize,
  type GallerySlidePlan,
} from './deck-gallery';
import type { SlideDeck } from './slide-deck';
import { notesWithMinutes } from './tile-theme';

const LAYOUT = { name: 'YAWP_GALLERY_16x9', width: 13.333, height: 7.5 };
const SERIF = 'Georgia';
const SANS = 'Franklin Gothic Book';
const hex = (color: string) => color.replace('#', '').toUpperCase();
const C = Object.fromEntries(Object.entries(GALLERY_COLORS).map(([key, value]) => [key, hex(value)])) as {
  [K in keyof typeof GALLERY_COLORS]: string;
};

/** A kit pixel in inches. */
const px = (value: number) => (value * LAYOUT.width) / 1280;
/** A kit pixel size in points; Georgia 8% smaller, as the kit says. */
const serifPt = (value: number) => Math.round(value * 0.75 * 0.92);
const sansPt = (value: number) => Math.round(value * 0.75);

type PptxSlide = ReturnType<PptxGenJS['addSlide']>;
type Tone = { ink: string; muted: string; accent: string; rule: string };

/** The art's bytes, from the built client or the source public folder. */
function artData(art: DeckArt): string | null {
  for (const root of ['build/client', 'public']) {
    const path = join(process.cwd(), root, art.src);
    if (existsSync(path)) return `image/jpeg;base64,${readFileSync(path).toString('base64')}`;
  }
  return null;
}

function toneFor(plan: GallerySlidePlan, accent: string): Tone {
  if (plan.dark) return { ink: C.white, muted: 'C9CCC8', accent: C.accentOnDark, rule: '4A5A57' };
  if (plan.ground === 'accent') return { ink: C.white, muted: 'F1E4DE', accent: C.white, rule: 'FFFFFF' };
  return { ink: C.ink, muted: C.stone, accent, rule: C.rule };
}

function groundColor(plan: GallerySlidePlan, accent: string): string {
  if (plan.ground === 'pine') return C.pine;
  if (plan.ground === 'ink') return C.ink;
  if (plan.ground === 'accent') return accent;
  return C.paper;
}

type Ctx = { slide: PptxSlide; plan: GallerySlidePlan; tone: Tone; deck: SlideDeck; art: DeckArt | null; image: string | null };

function runningHead({ slide, tone, deck, art }: Ctx, left = 80, right = 80): void {
  slide.addShape('rect', {
    x: px(left),
    y: px(43),
    w: px(14),
    h: px(14),
    fill: { color: art ? C.mat : tone.accent },
    line: { color: art ? C.mat : tone.accent },
  });
  slide.addText(galleryRunningHead(deck).toUpperCase(), {
    x: px(left + 24),
    y: px(36),
    w: px(1280 - left - right - 24),
    h: px(28),
    fontFace: SANS,
    fontSize: sansPt(13),
    color: tone.muted,
    charSpacing: 2,
    bold: true,
    valign: 'middle',
    margin: 0,
  });
  slide.addShape('line', {
    x: px(left),
    y: px(70),
    w: px(1280 - left - right),
    h: 0,
    line: { color: tone.rule, width: 0.75 },
  });
}

function mode({ slide, plan, tone }: Ctx, y: number, left = 80, size = 42): void {
  if (!plan.mode) return;
  slide.addText(plan.mode, {
    x: px(left),
    y: px(y),
    w: px(700),
    h: px(size * 1.4),
    fontFace: SERIF,
    italic: true,
    fontSize: serifPt(size),
    color: tone.accent,
    margin: 0,
    valign: 'top',
  });
}

function serifText(ctx: Ctx, text: string, box: { x: number; y: number; w: number; h: number }, size: number, color?: string): void {
  ctx.slide.addText(text, {
    x: px(box.x),
    y: px(box.y),
    w: px(box.w),
    h: px(box.h),
    fontFace: SERIF,
    fontSize: serifPt(size),
    color: color ?? ctx.tone.ink,
    valign: 'top',
    margin: 0,
    fit: 'shrink',
  });
}

function sansText(ctx: Ctx, text: string, box: { x: number; y: number; w: number; h: number }, size = 25, color?: string): void {
  ctx.slide.addText(text, {
    x: px(box.x),
    y: px(box.y),
    w: px(box.w),
    h: px(box.h),
    fontFace: SANS,
    fontSize: sansPt(size),
    color: color ?? ctx.tone.muted,
    valign: 'top',
    margin: 0,
    fit: 'shrink',
  });
}

function rows(ctx: Ctx, items: { lead?: string; text: string; trail?: string }[], top: number): void {
  const height = Math.min(64, (720 - 72 - top) / Math.max(items.length, 1));
  items.forEach((item, i) => {
    const y = top + i * height;
    ctx.slide.addShape('line', { x: px(80), y: px(y), w: px(1120), h: 0, line: { color: ctx.tone.rule, width: 0.75 } });
    // A numeral takes a narrow column; a verb ("Underline") a wide one.
    const leadWidth = item.lead ? (item.lead.length > 3 ? 200 : 70) : 0;
    if (item.lead) {
      ctx.slide.addText(item.lead, {
        x: px(80),
        y: px(y + 10),
        w: px(leadWidth - 10),
        h: px(height - 14),
        fontFace: SERIF,
        italic: true,
        fontSize: serifPt(30),
        color: ctx.tone.accent,
        margin: 0,
        valign: 'top',
      });
    }
    sansText(ctx, item.text, { x: 80 + leadWidth, y: y + 14, w: 1120 - leadWidth - (item.trail ? 140 : 0), h: height - 14 }, 25, ctx.tone.ink);
    if (item.trail) sansText(ctx, item.trail, { x: 1060, y: y + 18, w: 140, h: height - 18 }, 18);
  });
}

function credit(ctx: Ctx, box: { x: number; y: number; w: number }): void {
  if (!ctx.art) return;
  sansText(ctx, ctx.art.credit, { ...box, h: 30 }, 11);
}

function hang(ctx: Ctx, box: { x: number; y: number; w: number; h: number }): void {
  if (!ctx.image) {
    ctx.slide.addShape('rect', { x: px(box.x), y: px(box.y), w: px(box.w), h: px(box.h), fill: { color: C.mat }, line: { color: C.mat } });
    return;
  }
  ctx.slide.addImage({
    data: ctx.image,
    x: px(box.x),
    y: px(box.y),
    w: px(box.w),
    h: px(box.h),
    sizing: { type: 'cover', w: px(box.w), h: px(box.h) },
    altText: ctx.art ? `${ctx.art.title}, ${ctx.art.artist}` : undefined,
  });
}

function promptBlock(ctx: Ctx, text: string, y: number, left = 80, right = 160): void {
  serifText(ctx, text, { x: left, y, w: 1280 - left - right, h: 360 }, promptTypeSize(text));
}

function drawSlide(ctx: Ctx): void {
  const { plan } = ctx;
  const spec = plan.slide;
  switch (plan.template) {
    case 'title': {
      const right = ctx.art ? 560 : 80;
      if (ctx.deck.unit) sansText(ctx, ctx.deck.unit.toUpperCase(), { x: 80, y: 250, w: 1280 - 80 - right, h: 24 }, 13);
      serifText(ctx, spec.title, { x: 80, y: 290, w: 1280 - 80 - right, h: 240 }, spec.title.length > 28 ? 92 : 132);
      if (spec.subtitle) sansText(ctx, spec.subtitle, { x: 80, y: 560, w: 1280 - 80 - right, h: 70 }, 27);
      if (ctx.art) {
        hang(ctx, { x: 760, y: 80, w: 440, h: 540 });
        credit(ctx, { x: 760, y: 630, w: 440 });
      }
      return;
    }
    case 'agenda':
    case 'steps': {
      runningHead(ctx);
      mode(ctx, 120);
      serifText(ctx, spec.title, { x: 80, y: 180, w: 1120, h: 90 }, 60);
      const items =
        plan.template === 'agenda'
          ? (spec.agenda ?? (spec.bullets ?? []).map((title) => ({ title, minutes: undefined }))).map((item, i) => ({
              lead: String(i + 1),
              text: item.title,
              trail: item.minutes ? `${item.minutes} min` : undefined,
            }))
          : (spec.bullets ?? []).map((text, i) => ({ lead: String(i + 1), text }));
      rows(ctx, items, 290);
      return;
    }
    case 'discuss': {
      runningHead(ctx);
      mode(ctx, 140);
      if (spec.grouping) sansText(ctx, spec.grouping.toUpperCase(), { x: 400, y: 156, w: 400, h: 24 }, 13);
      promptBlock(ctx, spec.question ?? spec.body ?? spec.title, 210);
      const after = [spec.stem ? `Start with: ${spec.stem}` : null, spec.followUp ? `Then: ${spec.followUp}` : null].filter(Boolean).join('\n');
      if (after) sansText(ctx, after, { x: 80, y: 580, w: 1040, h: 80 });
      return;
    }
    case 'big_idea': {
      const left = ctx.art ? 260 : 80;
      if (ctx.art) hang(ctx, { x: 0, y: 0, w: 200, h: 720 });
      runningHead(ctx, left);
      mode(ctx, 140, left);
      promptBlock(ctx, spec.body ?? spec.title, 210, left, 140);
      if (spec.body) sansText(ctx, spec.title, { x: left, y: 590, w: 1280 - left - 140, h: 40 });
      if (ctx.art) credit(ctx, { x: left, y: 680, w: 1280 - left - 80 });
      return;
    }
    case 'write': {
      runningHead(ctx);
      mode(ctx, 140);
      promptBlock(ctx, spec.body ?? spec.question ?? spec.title, 210);
      const minutes = spec.seconds ? Math.round(spec.seconds / 60) : spec.minutes;
      const after = [spec.stem ? `Start with: ${spec.stem}` : null, minutes ? `${minutes} ${minutes === 1 ? 'MINUTE' : 'MINUTES'} · PENS MOVING` : null]
        .filter(Boolean)
        .join('\n');
      if (after) sansText(ctx, after, { x: 80, y: 580, w: 1040, h: 80 }, 18);
      return;
    }
    case 'notes': {
      runningHead(ctx);
      mode(ctx, 120);
      serifText(ctx, spec.title, { x: 80, y: 180, w: 1120, h: 90 }, 60);
      const timeline = spec.timeline ?? [];
      let top = 300;
      if (timeline.length) {
        const width = 1120 / timeline.length;
        ctx.slide.addShape('line', { x: px(80), y: px(top + 9), w: px(1120), h: 0, line: { color: ctx.tone.rule, width: 0.75 } });
        timeline.forEach((entry, i) => {
          const x = 80 + i * width;
          const color = entry.mark === 'ink' ? ctx.tone.ink : ctx.tone.accent;
          ctx.slide.addShape('ellipse', {
            x: px(x),
            y: px(top),
            w: px(18),
            h: px(18),
            fill: { color: entry.mark === 'open' ? C.paper : color },
            line: { color, width: 1.5 },
          });
          serifText(ctx, entry.year, { x, y: top + 30, w: width - 24, h: 46 }, 34);
          sansText(ctx, entry.caption, { x, y: top + 82, w: width - 24, h: 60 }, 19);
        });
        top += 170;
      }
      const facts = spec.facts ?? (timeline.length ? [] : spec.bullets ?? []);
      if (facts.length) rows(ctx, facts.map((text) => ({ text })), top);
      return;
    }
    case 'divider': {
      if (plan.ground === 'art' && ctx.art) {
        hang(ctx, { x: 0, y: 0, w: 768, h: 720 });
        mode(ctx, 250, 840, 44);
        serifText(ctx, spec.title, { x: 840, y: 320, w: 360, h: 220 }, 60);
        if (spec.subtitle) sansText(ctx, spec.subtitle, { x: 840, y: 560, w: 360, h: 80 });
        credit(ctx, { x: 840, y: 670, w: 360 });
      } else {
        mode(ctx, 230, 80, 44);
        serifText(ctx, spec.title, { x: 80, y: 300, w: 1120, h: 200 }, 88);
        if (spec.subtitle) sansText(ctx, spec.subtitle, { x: 80, y: 520, w: 1120, h: 80 });
      }
      return;
    }
    case 'read': {
      runningHead(ctx);
      mode(ctx, 120);
      serifText(ctx, spec.title, { x: 80, y: 180, w: 1120, h: 90 }, 60);
      const source = [spec.work, spec.page].filter(Boolean).join(' · ');
      if (source) sansText(ctx, source, { x: 80, y: 262, w: 1120, h: 30 }, 23);
      const items = spec.tasks?.length
        ? spec.tasks.map((task) => ({ lead: task.verb, text: task.text }))
        : (spec.bullets ?? []).map((text) => ({ text }));
      rows(ctx, items, 310);
      return;
    }
    case 'look': {
      const question = spec.question ?? spec.body ?? spec.title;
      if (ctx.art) {
        hang(ctx, { x: 80, y: 80, w: 720, h: 540 });
        credit(ctx, { x: 80, y: 632, w: 720 });
        mode(ctx, 220, 860);
        serifText(ctx, question, { x: 860, y: 290, w: 340, h: 260 }, 40);
        if (spec.routine) sansText(ctx, spec.routine.toUpperCase(), { x: 860, y: 570, w: 340, h: 40 }, 13);
      } else {
        runningHead(ctx);
        mode(ctx, 140);
        promptBlock(ctx, question, 210);
        if (spec.routine) sansText(ctx, spec.routine, { x: 80, y: 590, w: 1040, h: 40 });
      }
      return;
    }
    case 'excerpt': {
      runningHead(ctx);
      mode(ctx, 130);
      serifText(ctx, spec.title, { x: 80, y: 190, w: 500, h: 140 }, 52);
      if (spec.bullets?.length) sansText(ctx, spec.bullets.join('\n'), { x: 80, y: 350, w: 500, h: 290 }, 23, ctx.tone.ink);
      ctx.slide.addShape('rect', { x: px(640), y: px(110), w: px(560), h: px(538), fill: { color: C.sheet }, line: { color: C.sheet } });
      serifText(ctx, spec.body ?? '', { x: 688, y: 150, w: 464, h: 380 }, 30, C.ink);
      const who = [spec.author ?? spec.attribution, spec.work, spec.page].filter(Boolean).join(', ');
      if (who) sansText(ctx, `— ${who}`, { x: 688, y: 580, w: 464, h: 40 }, 15, C.stone);
      return;
    }
    case 'exit': {
      runningHead(ctx);
      mode(ctx, 140, 80, 44);
      promptBlock(ctx, spec.body ?? spec.title, 210);
      if (spec.nextLesson) sansText(ctx, `NEXT TIME · ${spec.nextLesson.toUpperCase()}`, { x: 80, y: 600, w: 1040, h: 30 }, 13);
      return;
    }
    case 'compare': {
      runningHead(ctx);
      mode(ctx, 120);
      serifText(ctx, spec.title, { x: 80, y: 180, w: 1120, h: 80 }, 52);
      [spec.left, spec.right].forEach((column, i) => {
        if (!column) return;
        const x = 80 + i * 588;
        ctx.slide.addShape('line', { x: px(x), y: px(290), w: px(532), h: 0, line: { color: ctx.tone.rule, width: 0.75 } });
        sansText(ctx, column.label.toUpperCase(), { x, y: 304, w: 532, h: 24 }, 13, ctx.tone.accent);
        sansText(ctx, column.text, { x, y: 340, w: 532, h: 300 }, 23, ctx.tone.ink);
      });
      return;
    }
  }
}

export async function renderDeckPptxGallery(deck: SlideDeck): Promise<Uint8Array> {
  const pptx = new PptxGenJS();
  pptx.defineLayout(LAYOUT);
  pptx.layout = LAYOUT.name;
  pptx.title = deck.title;
  if (deck.subtitle) pptx.subject = deck.subtitle;
  pptx.company = 'Yawp!';

  const accent = hex(galleryAccent(deck));
  const art = deckArt(deck.art);
  const image = art ? artData(art) : null;
  for (const plan of planGalleryDeck(deck)) {
    const slide = pptx.addSlide();
    slide.background = { color: groundColor(plan, accent) };
    drawSlide({ slide, plan, tone: toneFor(plan, accent), deck, art, image });
    slide.addNotes(notesWithMinutes(plan.slide.speakerNotes, plan.slide.minutes));
  }

  const written = await pptx.write({ outputType: 'nodebuffer' });
  return new Uint8Array(written as Buffer);
}
