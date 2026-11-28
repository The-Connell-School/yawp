/**
 * The true lines, kept as verse (plan item 2, Nov 22). In round 3 every verse
 * lesson's slides were wrong in the same ways: "Dulce et Decorum Est" dropped
 * lines 15–16 and 23–24 without a mark, verse ran together as prose with
 * slashes, and the Odyssey spliced two passages that are not together.
 *
 * When the work's text is in hand, each excerpt slide's passage is found in it
 * by its first and last words, and the slide is given the source's own lines
 * between them, one to a line. A passage too long for the slide keeps the
 * lines the planner chose, each as the source has it, with "[…]" on its own
 * line wherever lines were left out. A passage that cannot be found surely is
 * left exactly as it was.
 */
import { closest, normalWord, wordsOf, type PreparedSource } from './quotation-check.server';
import { fenceSlideDeck, readSlideDeck, validateSlideDeck, type Slide } from './slide-deck';

const MAX_EXCERPT_CHARS = 700;
const MAX_SPAN_LINES = 40;
const ENDS = 8;
const GAP = '[…]';

/** A passage's lines as the planner wrote them: on new lines, or run together with slashes. */
export function passageLines(body: string): string[] {
  return body
    .split(/\n|\s+\/\s+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

const wordList = (text: string) => wordsOf(text).map((w) => w.word);

/** The source line each character position falls on. */
function lineAt(source: PreparedSource, pos: number): number {
  let lo = 0;
  let hi = source.lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (source.lineStarts[mid]! <= pos) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

const sourceLine = (source: PreparedSource, i: number) => {
  const start = source.lineStarts[i]!;
  const end = i + 1 < source.lineStarts.length ? source.lineStarts[i + 1]! - 1 : source.text.length;
  return source.text.slice(start, end).replace(/\s+$/, '');
};

/** The share of a line's words that the other has, in any order. */
function overlap(line: string[], other: string[]): number {
  if (!line.length) return 0;
  const pool = new Map<string, number>();
  for (const word of other) pool.set(word, (pool.get(word) ?? 0) + 1);
  let hits = 0;
  for (const word of line) {
    const left = pool.get(word) ?? 0;
    if (left > 0) {
      hits += 1;
      pool.set(word, left - 1);
    }
  }
  return hits / line.length;
}

/** Gutenberg's plain-text habits as a page prints them: "--" is a dash, _italics_ lose their marks. */
function printable(line: string): string {
  return line.replace(/\s*--\s*/g, '—').replace(/_([^_]+)_/g, '$1').replace(/_/g, '');
}

/**
 * Where the passage starts and ends in the source, by lines. The ends are
 * found by the first and last words; when a garbled line keeps an end from
 * being found ("Of gas-shells dropping softly behind" for Owen's "Of tired,
 * outstripped Five-Nines that dropped behind"), the nearest line inward that
 * is found stands for it, counted on by the lines between.
 */
function anchorsOf(lines: string[], source: PreparedSource): { from: number; to: number } | null {
  const find = (text: string) => {
    const words = wordList(text);
    if (words.length < 4) return null;
    const near = closest(source, words.slice(0, Math.min(words.length, 12)));
    return near && near.score >= 0.75 ? lineAt(source, source.starts[near.start]!) : null;
  };
  const all = wordList(lines.join(' '));
  const firstNear = closest(source, all.slice(0, ENDS));
  const lastNear = closest(source, all.slice(-ENDS));
  let from = firstNear && firstNear.score >= 0.75 ? lineAt(source, source.starts[firstNear.start]!) : null;
  let to = lastNear && lastNear.score >= 0.75 ? lineAt(source, source.starts[Math.max(0, lastNear.end - 1)]!) : null;
  for (let i = 1; from === null && i < Math.min(lines.length, 4); i += 1) {
    const at = find(lines[i]!);
    if (at !== null) from = at - i;
  }
  for (let i = lines.length - 2; to === null && i >= Math.max(0, lines.length - 4); i -= 1) {
    const at = find(lines[i]!);
    if (at !== null) to = at + (lines.length - 1 - i);
  }
  return from === null || to === null || from < 0 ? null : { from, to };
}

/** The passage as the source has it, or null when it cannot be found surely. */
export function passageFromSource(body: string, source: PreparedSource): string | null {
  const lines = passageLines(body);
  const words = wordList(lines.join(' '));
  if (lines.length < 2 || words.length < ENDS * 2) return null;
  const anchors = anchorsOf(lines, source);
  if (!anchors) return null;
  const { from, to } = anchors;
  if (to < from || to - from > MAX_SPAN_LINES) return null;

  // The span's lines, a blank line between stanzas kept as one.
  const span: Array<{ text: string; words: string[]; index: number }> = [];
  for (let i = from; i <= to; i += 1) {
    const text = printable(sourceLine(source, i).trim());
    if (!text && (!span.length || !span[span.length - 1]!.text)) continue;
    span.push({ text, words: wordList(text), index: i });
  }
  while (span.length && !span[span.length - 1]!.text) span.pop();
  const spanWords = span.flatMap((line) => line.words);
  // The passage must be this span: most of its words are in it.
  if (overlap(words, spanWords) < 0.8) return null;

  const whole = span.map((line) => line.text).join('\n');
  if (whole.length <= MAX_EXCERPT_CHARS) return whole === body ? null : whole;

  // Too long for the slide: the planner's lines, each as the source has it,
  // and a mark wherever lines were left out.
  const out: string[] = [];
  let at = 0;
  let previous = -1;
  for (const line of lines) {
    const mine = wordList(line);
    if (!mine.length) continue;
    let found = -1;
    for (let j = at; j < span.length; j += 1) {
      if (span[j]!.text && overlap(mine, span[j]!.words) >= 0.8) {
        found = j;
        break;
      }
    }
    if (found < 0) return null;
    const skipped = span.slice(previous + 1, found).some((between) => between.text);
    if (previous >= 0 && skipped) out.push(GAP);
    out.push(span[found]!.text);
    previous = found;
    at = found + 1;
  }
  const chosen = out.join('\n');
  return chosen.length <= MAX_EXCERPT_CHARS && chosen !== body ? chosen : null;
}

/** The reply with each excerpt slide's passage as the source has it; anything uncertain is left as it was. */
export function withExcerptsFromSource(reply: string, source: PreparedSource | null): { reply: string; rewritten: number } {
  if (!source) return { reply, rewritten: 0 };
  const outcome = readSlideDeck(reply);
  if (outcome.kind !== 'deck') return { reply, rewritten: 0 };
  let rewritten = 0;
  const slides = outcome.deck.slides.map((slide): Slide => {
    if (slide.layout !== 'excerpt' || !slide.body) return slide;
    const text = passageFromSource(slide.body, source);
    if (!text) return slide;
    rewritten += 1;
    return { ...slide, body: text };
  });
  if (!rewritten) return { reply, rewritten: 0 };
  const deck = { ...outcome.deck, slides };
  if (!validateSlideDeck(JSON.stringify(deck)).ok) return { reply, rewritten: 0 };
  return { reply: `${outcome.body.trim()}\n\n${fenceSlideDeck(deck)}`, rewritten };
}

/** For tests: a word as the check compares it. */
export const comparable = normalWord;
