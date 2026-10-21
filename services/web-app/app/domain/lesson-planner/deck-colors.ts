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

function normalized(hex: string): string | null {
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
  const own = (deck.colors ?? []).map(normalized).filter((hex): hex is string => Boolean(hex));
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
