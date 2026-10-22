/**
 * A deck's colors (Yawp! Lesson Deck Kit, spec v3): two or three, sampled
 * from the lesson's painting and darkened until each reads at 4.5:1 or
 * better on paper, so it holds from the back of the room. The first is the
 * primary: the theme accent and the accent wall. Mode words and accented
 * words rotate through them, and a slide can color the parts of something
 * (the three parts of a thesis) with `~~1|…~~` marks.
 */

export const PAPER = '#F3F0E8';
/** The 2026-10 accent names, before decks took their colors from the art. */
const LEGACY_ACCENTS: Record<string, string> = {
  ember: '#B75F44',
  indigo: '#2F5873',
  olive: '#56602F',
  plum: '#7A4560',
};
const HEX = /^#?([0-9a-f]{6})$/i;
const MIN_CONTRAST = 4.5;
const MAX_COLORS = 3;

function rgb(hex: string): [number, number, number] {
  const value = HEX.exec(hex)![1]!;
  return [0, 2, 4].map((at) => parseInt(value.slice(at, at + 2), 16)) as [number, number, number];
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

/** The color, darkened step by step until it reads at 4.5:1 on paper. */
export function readableOnPaper(hex: string): string {
  let color = rgb(hex);
  let out = toHex(color);
  for (let step = 0; step < 40 && contrastRatio(out, PAPER) < MIN_CONTRAST; step += 1) {
    color = color.map((channel) => channel * 0.94) as [number, number, number];
    out = toHex(color);
  }
  return out;
}

/** "9c4a22" or "#9C4A22" → "#9C4A22"; null when it is not a hex color. */
export function normalizedHex(hex: string): string | null {
  const match = HEX.exec(hex.trim());
  return match ? `#${match[1]!.toUpperCase()}` : null;
}

/**
 * The deck's colors: its own, else its painting's, else the legacy accent,
 * else ember. Never more than three, each readable on paper.
 */
export function deckColors(
  deck: { colors?: string[] | null; accent?: string | null },
  art: { colors?: string[] } | null
): string[] {
  const own = (deck.colors ?? []).map(normalizedHex).filter((hex): hex is string => Boolean(hex));
  const chosen = own.length
    ? own
    : art?.colors?.length
      ? art.colors
      : [LEGACY_ACCENTS[deck.accent ?? 'ember'] ?? LEGACY_ACCENTS.ember!];
  return chosen.slice(0, MAX_COLORS).map(readableOnPaper);
}

/** A slide's color: its own pick (1-based), else the next in rotation. */
export function slideColor(colors: string[], slideIndex: number, pick?: number | null): string {
  if (pick && colors[pick - 1]) return colors[pick - 1]!;
  return colors[slideIndex % colors.length]!;
}

export type ColorRun = { text: string; color?: string };

const MARK = /~~(#[0-9a-f]{6}|\d)\|([^~]+)~~/gi;

/** Text with its color marks resolved: `~~2|reason~~`, `~~#2E6B3A|evidence~~`. */
export function splitColorMarks(text: string, colors: string[]): ColorRun[] {
  const runs: ColorRun[] = [];
  let cursor = 0;
  for (const match of text.matchAll(MARK)) {
    if (match.index! > cursor) runs.push({ text: text.slice(cursor, match.index) });
    const key = match[1]!;
    const color = key.startsWith('#')
      ? readableOnPaper(key)
      : (colors[Number(key) - 1] ?? colors[0]!);
    runs.push({ text: match[2]!, color });
    cursor = match.index! + match[0].length;
  }
  if (cursor < text.length || !runs.length) runs.push({ text: text.slice(cursor) });
  return runs;
}

/** The same text with its marks taken out, for search, notes and fallbacks. */
export function withoutColorMarks(text: string): string {
  return text.replace(MARK, '$2');
}

function hsl([r, g, b]: [number, number, number]): { h: number; s: number; l: number } {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === rn ? ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60 : max === gn ? ((bn - rn) / d + 2) * 60 : ((rn - gn) / d + 4) * 60;
  return { h, s, l };
}

/** Colors this gray are the sky or the shadows, never a deck color. */
const MIN_SATURATION = 0.15;
/** A deck color has to cover at least this much of the painting. */
const MIN_SHARE = 0.003;
/** How far a second, contrasting color sits from the first. */
const CONTRAST_APART = 90;
/** Hue bins, in degrees. */
const HUE_BIN = 15;
/** Two deck colors this close in hue read as one. */
const MIN_HUE_APART = 20;

/**
 * A painting's two or three deck colors (spec v3, "Deck colors"): its
 * strongest distinct colors by area, grays left out, each darkened until it
 * reads on paper. For new paintings in the art library
 * (scripts/add-deck-art.ts); a person should still look at the result.
 */
export function paletteFromPixels(pixels: Array<[number, number, number]>): string[] {
  // Bin by hue, weighting each pixel by how colorful it is: a painter's
  // accents carry a deck better than its broad, dull areas.
  const bins = new Map<number, Array<{ rgb: [number, number, number]; s: number }>>();
  for (const pixel of pixels) {
    const { h, s, l } = hsl(pixel);
    if (s < MIN_SATURATION || l < 0.15 || l > 0.9) continue;
    const bin = Math.floor(h / HUE_BIN) % (360 / HUE_BIN);
    bins.set(bin, [...(bins.get(bin) ?? []), { rgb: pixel, s }]);
  }
  const ranked = [...bins.entries()]
    .map(([bin, members]) => {
      // The bin's color: the average of its more colorful half.
      const vivid = [...members].sort((a, b) => b.s - a.s).slice(0, Math.max(1, Math.ceil(members.length / 2)));
      const rgb = [0, 1, 2].map((channel) => vivid.reduce((total, member) => total + member.rgb[channel]!, 0) / vivid.length) as [
        number,
        number,
        number,
      ];
      return {
        h: hsl(rgb).h,
        rgb,
        score: members.reduce((total, member) => total + member.s ** 2, 0),
        share: members.length / pixels.length,
      };
    })
    .sort((a, b) => b.score - a.score);
  if (!ranked.length) {
    // Nearly gray: its strongest tint, whatever it is.
    const strongest = [...pixels].sort((a, b) => hsl(b).s - hsl(a).s)[0];
    return strongest ? [readableOnPaper(toHex(strongest))] : [];
  }
  const hueApart = (a: number, b: number) => {
    const distance = Math.abs(a - b);
    return Math.min(distance, 360 - distance);
  };
  const usable = ranked.filter((entry) => entry.share >= MIN_SHARE);
  const chosen = [usable[0] ?? ranked[0]!];
  // Then a color that stands apart from it, as a painter's sky does from its
  // sunset, even when there is less of it; else the next distinct hue.
  const contrast = usable.find((entry) => hueApart(entry.h, chosen[0]!.h) >= CONTRAST_APART);
  if (contrast) chosen.push(contrast);
  for (const entry of usable) {
    if (chosen.length === MAX_COLORS) break;
    if (chosen.every((other) => hueApart(other.h, entry.h) >= MIN_HUE_APART)) chosen.push(entry);
  }
  return chosen.map(({ rgb }) => readableOnPaper(toHex(rgb)));
}
