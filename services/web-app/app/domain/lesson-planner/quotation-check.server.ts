/**
 * The quotation check (Nov 22; lesson review, pattern 2, and the plan's
 * item 2(b)). Every quotation of six words or more in a planner reply is
 * matched against the work's own text, ignoring case, punctuation, spacing
 * and word breaks ("to-morrow", "any one"):
 *
 * - a printed passage (two lines or more) whose first and last lines are in
 *   the source but whose middle is not ("Dulce et Decorum Est" went to
 *   students with two lines invented and two missing) is rewritten as the
 *   source has it between those lines, the lines that were right left as
 *   the reply wrote them;
 * - a single line or sentence that is not in the source but nearly is (85%
 *   of its words, in order) takes the source's wording;
 * - anything else that is presented as the text and is not in it is left
 *   alone and reported as unverified;
 * - a quotation found in another chapter, act or book than the reply says
 *   (Gatsby's "one of the few honest people" ends chapter 3, not chapter 1)
 *   is reported as misplaced.
 *
 * Nothing outside a quotation is changed. Pure string work, no model: a
 * long novel and a long reply take tens of milliseconds. Never throws: any
 * failure gives the reply back unchanged.
 */
import {
  fetchWorkText,
  workForText,
  type RegisteredWork,
} from './source-texts.server';

// ───────────────────────────── words ─────────────────────────────

const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;

/** A word as it is compared: lower case, no accents, letters and digits only. */
function normalWord(word: string): string {
  return word
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

type Word = { word: string; start: number; end: number };

/** The words of a text with where each is, `[stage directions]` left out. */
function wordsOf(text: string, offset = 0): Word[] {
  const out: Word[] = [];
  const cleaned = text.replace(/\[[^\]\n]{0,200}\]/g, (m) =>
    ' '.repeat(m.length)
  );
  for (const match of cleaned.matchAll(WORD)) {
    const word = normalWord(match[0]);
    if (!word) continue;
    const start = offset + (match.index ?? 0);
    out.push({ word, start, end: start + match[0].length });
  }
  return out;
}

const STOP = new Set(
  'a an and are as at be but by for from had has have he her his i in is it its me my of on or our she so that the their them then there they this to was we were what when which who will with would you your not no do did all one'.split(
    ' '
  )
);

// ───────────────────────────── the source ─────────────────────────────

export type Section = {
  act?: number;
  scene?: number;
  chapter?: number;
  book?: number;
};

export type PreparedSource = {
  text: string;
  structure: RegisteredWork['structure'];
  words: string[];
  starts: Int32Array;
  ends: Int32Array;
  /** The words run together, for matching that ignores word breaks. */
  letters: string;
  /** Where each word begins in `letters`; one more entry for the end. */
  letterStarts: Int32Array;
  index: Map<string, number[]>;
  sections: Array<{ pos: number } & Section>;
  lineStarts: number[];
};

const ROMAN: Record<string, number> = {
  i: 1,
  v: 5,
  x: 10,
  l: 50,
  c: 100,
};
const NUMBER_WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
  'twenty',
  'twenty-one',
  'twenty-two',
  'twenty-three',
  'twenty-four',
];

/** "III", "3" or "three" as a number, or null. */
export function readNumber(raw: string): number | null {
  const text = raw.trim().toLowerCase().replace(/\.$/, '');
  if (/^\d{1,3}$/.test(text)) return Number(text);
  const word = NUMBER_WORDS.indexOf(text);
  if (word > 0) return word;
  if (!/^[ivxlc]{1,8}$/.test(text)) return null;
  let total = 0;
  for (let i = 0; i < text.length; i += 1) {
    const value = ROMAN[text[i]];
    const next = ROMAN[text[i + 1]] ?? 0;
    total += value < next ? -value : value;
  }
  return total > 0 ? total : null;
}

const NUM = String.raw`([IVXLC]{1,8}|\d{1,3})`;
const ACT_LINE = new RegExp(String.raw`^ACT\s+${NUM}\b`, 'i');
const SCENE_LINE = new RegExp(String.raw`^SCENE\s+${NUM}\b`, 'i');
const CHAPTER_LINE = new RegExp(
  String.raw`^(?:CHAPTER|STAVE|LETTER)\s+${NUM}\b`,
  'i'
);
const BOOK_LINE = new RegExp(String.raw`^BOOK\s+${NUM}\b`, 'i');
const BARE_ROMAN = /^([IVXLC]{1,7})\.?$/;
const SPEAKER = /^[A-Z][A-Z0-9 '’.,&-]{0,40}[.:]$/;
const DIRECTION =
  /^(?:Enter|Exit|Exeunt|Re-enter|Manet|Flourish|Alarum|Thunder|Sennet)\b/;

/**
 * The source made ready to search: its words (headings, speakers' names and
 * stage directions left out, so a speech quoted across two speakers is still
 * found), an index of where each word is, and where each chapter, act and
 * scene begins.
 */
export function prepareSource(
  text: string,
  structure: RegisteredWork['structure'] = 'chapters'
): PreparedSource {
  const words: Word[] = [];
  const sections: PreparedSource['sections'] = [];
  const lineStarts: number[] = [];
  const state: Section = {};
  const lines = text.split('\n');
  let pos = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    lineStarts.push(pos);
    const trimmed = line.trim();
    let heading = false;
    if (trimmed && structure !== 'poems') {
      const blankAround =
        !(lines[i - 1] ?? '').trim() && !(lines[i + 1] ?? '').trim();
      let match: RegExpMatchArray | null;
      if (structure === 'acts' && (match = trimmed.match(ACT_LINE))) {
        state.act = readNumber(match[1]) ?? state.act;
        delete state.scene;
        heading = true;
      } else if (structure === 'acts' && (match = trimmed.match(SCENE_LINE))) {
        state.scene = readNumber(match[1]) ?? state.scene;
        heading = true;
      } else if ((match = trimmed.match(BOOK_LINE))) {
        state.book = readNumber(match[1]) ?? state.book;
        delete state.chapter;
        heading = true;
      } else if ((match = trimmed.match(CHAPTER_LINE))) {
        state.chapter = readNumber(match[1]) ?? state.chapter;
        heading = true;
      } else if (
        structure === 'chapters' &&
        blankAround &&
        (match = trimmed.match(BARE_ROMAN))
      ) {
        state.chapter = readNumber(match[1]) ?? state.chapter;
        heading = true;
      }
      if (heading) sections.push({ pos, ...state });
    }
    const skip =
      heading ||
      (trimmed.length < 44 &&
        SPEAKER.test(trimmed) &&
        !/[a-z]/.test(trimmed)) ||
      (structure === 'acts' && DIRECTION.test(trimmed));
    if (!skip) words.push(...wordsOf(line, pos));
    pos += line.length + 1;
  }
  const n = words.length;
  const starts = new Int32Array(n);
  const ends = new Int32Array(n);
  const letterStarts = new Int32Array(n + 1);
  const index = new Map<string, number[]>();
  const parts: string[] = [];
  let letterPos = 0;
  for (let i = 0; i < n; i += 1) {
    const { word, start, end } = words[i];
    starts[i] = start;
    ends[i] = end;
    letterStarts[i] = letterPos;
    letterPos += word.length;
    parts.push(word);
    const list = index.get(word);
    if (list) list.push(i);
    else index.set(word, [i]);
  }
  letterStarts[n] = letterPos;
  return {
    text,
    structure,
    words: parts,
    starts,
    ends,
    letters: parts.join(''),
    letterStarts,
    index,
    sections,
    lineStarts,
  };
}

/** The word that begins at this point of `letters`, or -1. */
function wordAtLetter(source: PreparedSource, letter: number): number {
  const starts = source.letterStarts;
  let lo = 0;
  let hi = starts.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (starts[mid] === letter) return mid;
    if (starts[mid] < letter) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

type Span = { start: number; end: number };

/**
 * Where the words are in the source, as a run of its words (end exclusive),
 * word breaks ignored but starting and ending on a word. Up to `limit` places,
 * from word `from` to word `to`.
 */
function findAll(
  source: PreparedSource,
  quote: string[],
  { from = 0, to = source.words.length, limit = 1 } = {}
): Span[] {
  const needle = quote.join('');
  if (!needle) return [];
  const out: Span[] = [];
  const startLetter = source.letterStarts[Math.max(0, from)];
  const endLetter = source.letterStarts[Math.min(source.words.length, to)];
  let at = source.letters.indexOf(needle, startLetter);
  while (at >= 0 && at + needle.length <= endLetter && out.length < limit) {
    const start = wordAtLetter(source, at);
    const end = start >= 0 ? wordAtLetter(source, at + needle.length) : -1;
    if (start >= 0 && end > start) out.push({ start, end });
    at = source.letters.indexOf(needle, at + 1);
  }
  return out;
}

/** Longest common subsequence of two word lists. */
function lcs(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  let prev = new Uint16Array(b.length + 1);
  let row = new Uint16Array(b.length + 1);
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      row[j] =
        a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], row[j - 1]);
    }
    [prev, row] = [row, prev];
  }
  return prev[b.length];
}

const similarity = (a: string[], b: string[]) =>
  (2 * lcs(a, b)) / (a.length + b.length || 1);

const MAX_CLOSE_WORDS = 80;

/** The source's nearest run of words to the quotation, and how near (0 to 1). */
/**
 * A place in the source near a quotation: `score` is the share of words in
 * common, in order; `close` is the larger of that and the share of letters
 * ("I'm" and "I am" differ by a word, not by much).
 */
type Near = Span & { score: number; close: number };

function closest(source: PreparedSource, quote: string[]): Near | null {
  const n = quote.length;
  if (n < 4 || n > MAX_CLOSE_WORDS) return null;
  const anchors = quote
    .map((word, i) => ({ i, list: source.index.get(word) }))
    .filter(
      (entry): entry is { i: number; list: number[] } =>
        Boolean(entry.list) &&
        !STOP.has(quote[entry.i]) &&
        (entry.list?.length ?? 0) <= 400
    )
    .sort((a, b) => a.list.length - b.list.length)
    .slice(0, 6);
  if (!anchors.length) return null;
  const votes = new Map<number, number>();
  for (const { i, list } of anchors)
    for (const at of list) {
      const start = at - i;
      votes.set(start, (votes.get(start) ?? 0) + 1);
    }
  const candidates = [...votes.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 24)
    .map(([start]) => start);
  const total = source.words.length;
  // A rough score for each place first, then the best three looked at closely.
  const rough = candidates
    .map((start) => ({
      start,
      score: lcs(
        quote,
        source.words.slice(
          Math.max(0, start - 3),
          Math.min(total, start + n + 3)
        )
      ),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((entry) => entry.start);
  const windows: Array<Span & { score: number }> = [];
  for (const candidate of rough)
    for (let shift = -2; shift <= 2; shift += 1)
      for (let len = Math.max(1, n - 3); len <= n + 3; len += 1) {
        const start = candidate + shift;
        const end = start + len;
        if (start < 0 || end > total) continue;
        windows.push({
          start,
          end,
          score: similarity(quote, source.words.slice(start, end)),
        });
      }
  if (!windows.length) return null;
  const top = Math.max(...windows.map((w) => w.score));
  // Near-ties are settled letter by letter: "I'm one of the few" is "I am one of the few", not "one of the few".
  const letters = quote.join('').split('');
  let best: Near | null = null;
  let bestLetters = -1;
  for (const window of windows
    .filter((w) => w.score >= top - 0.15)
    .sort((a, b) => b.score - a.score)
    .slice(0, 24)) {
    const theirs = source.words
      .slice(window.start, window.end)
      .join('')
      .split('');
    const score =
      letters.length + theirs.length > 600
        ? window.score
        : similarity(letters, theirs);
    if (score > bestLetters) {
      bestLetters = score;
      best = { ...window, close: Math.max(window.score, score) };
    }
  }
  return best;
}

/** The section a point of the source is in. */
function sectionAt(source: PreparedSource, pos: number): Section | null {
  let found: Section | null = null;
  for (const section of source.sections) {
    if (section.pos > pos) break;
    found = section;
  }
  if (!found) return null;
  const { act, scene, chapter, book } = found;
  return { act, scene, chapter, book };
}

export function sectionLabel(section: Section | null): string | null {
  if (!section) return null;
  if (section.act !== undefined)
    return section.scene !== undefined
      ? `Act ${section.act}, Scene ${section.scene}`
      : `Act ${section.act}`;
  const parts: string[] = [];
  if (section.book !== undefined) parts.push(`Book ${section.book}`);
  if (section.chapter !== undefined) parts.push(`Chapter ${section.chapter}`);
  return parts.length ? parts.join(', ') : null;
}

/** The source's own words for a run, line breaks as spaces (or " / " for verse given that way). */
function sourceWords(
  source: PreparedSource,
  span: Span,
  lineJoin = ' '
): string {
  const raw = source.text.slice(
    source.starts[span.start],
    source.ends[span.end - 1]
  );
  return cleanSource(raw)
    .replace(/\s*\n\s*/g, lineJoin)
    .replace(/[ \t]+/g, ' ');
}

/** Gutenberg's own marks taken out: `_italics_` underscores and `[stage directions]`. */
const cleanSource = (text: string) =>
  text
    .replace(/\[[^\]\n]{0,200}\]\s*/g, '')
    .replace(/_/g, '')
    .replace(/(?<!-)--(?!-)/g, '—');

// ───────────────────────────── the reply ─────────────────────────────

export type Correction = { before: string; after: string; why: string };
export type Unverified = {
  quote: string;
  why: string;
  /** The source's nearest words, when something is near. */
  closest?: string;
};
export type Misplaced = {
  quote: string;
  claimed: string;
  actual: string;
};
export type QuotationCheck = {
  reply: string;
  corrections: Correction[];
  unverified: Unverified[];
  misplaced: Misplaced[];
  /** Quotations found in the source as written (or as corrected): a later pass must not change them. */
  verified: string[];
};

type Edit = { start: number; end: number; text: string };

/** A piece of the reply's text: where it is, and how to put a change back. */
type Piece = {
  /** The piece's text as read (a JSON string decoded). */
  text: string;
  /** Where the piece's first character is in the reply. */
  offset: number;
  /** A JSON string: decoded index → reply index. */
  map?: number[];
};

const rawAt = (piece: Piece, i: number) =>
  piece.map ? piece.map[i] : piece.offset + i;

const encode = (piece: Piece, text: string) =>
  piece.map ? JSON.stringify(text).slice(1, -1) : text;

type Unit = {
  piece: Piece;
  /** Start and end of the unit's words in `piece.text`. */
  start: number;
  end: number;
  words: string[];
  /** For a line: where the line itself starts and ends in `piece.text`, wrappers included. */
  lineStart: number;
  lineEnd: number;
  blankBefore: boolean;
  /** The unit is the whole line, not one sentence of it. */
  whole: boolean;
};

type Passage = {
  piece: Piece;
  units: Unit[];
  /** Printed as the text: a blockquote, a slide's quote or excerpt. */
  explicit: boolean;
  kind: 'lines' | 'json';
  prefix: string;
  open: string;
  close: string;
  /** Where to look for "Chapter 1": the passage and a paragraph either side. */
  near: Span;
};

const ELLIPSIS_LINE =
  /^[\s*_]*(?:\.\s?\.\s?\.|…|\[\s*(?:\.\.\.|…)\s*\]|\(\s*(?:\.\.\.|…)\s*\))[\s*_]*$/;
const SPEAKER_LABEL =
  /^\*{0,2}[A-Z][A-Z .'’-]{1,30}\*{0,2}[:.]\*{0,2}\s+(?=\S)/;

/** The line's words, a leading speaker's name ("MACBETH:") left out. */
function lineWords(text: string, offset: number) {
  const label = text.match(SPEAKER_LABEL);
  const skip = label && !/[a-z]/.test(label[0]) ? label[0].length : 0;
  return wordsOf(text.slice(skip), offset + skip);
}

/** A line's content between its wrappers (`> `, `*…*`, `**…**`) and its trailing break. */
function lineContent(line: string): {
  start: number;
  end: number;
  open: string;
  close: string;
} {
  const lead = line.match(/^(\s*(?:>\s?)?)([*_]{0,3})/) ?? ['', '', ''];
  let start = lead[0].length;
  let end = line.replace(/(?:\s{2,}|\\)$/, '').trimEnd().length;
  const trail = line.slice(0, end).match(/[*_]{1,3}$/);
  let close = '';
  if (trail && end - trail[0].length > start) {
    close = trail[0];
    end -= trail[0].length;
  }
  while (start < end && /\s/.test(line[start])) start += 1;
  return { start, end, open: lead[2], close };
}

const SENTENCE_END = /(?<=[.!?…]["”’']?\*{0,2})\s+(?=["“‘'*_]*[A-Z])/g;

/** A long line's sentences as units; a short line is one unit. */
function unitsOfLine(
  piece: Piece,
  lineStart: number,
  line: string,
  blankBefore: boolean
): Unit[] {
  const content = lineContent(line);
  const text = line.slice(content.start, content.end);
  const base = lineStart + content.start;
  const all = lineWords(text, base);
  if (!all.length) return [];
  const one = (
    start: number,
    end: number,
    words: Word[],
    whole: boolean
  ): Unit => ({
    piece,
    start,
    end,
    words: words.map((w) => w.word),
    lineStart,
    lineEnd: lineStart + line.length,
    blankBefore,
    whole,
  });
  if (all.length <= 30) return [one(base, base + text.length, all, true)];
  const units: Unit[] = [];
  let from = 0;
  const cut = (to: number) => {
    const chunk = text.slice(from, to);
    const lead = chunk.length - chunk.trimStart().length;
    const s = base + from + lead;
    const e = base + from + chunk.trimEnd().length;
    const words = all.filter((w) => w.start >= s && w.end <= e);
    if (words.length) units.push(one(s, e, words, false));
  };
  for (const match of text.matchAll(SENTENCE_END)) {
    cut(match.index ?? 0);
    from = (match.index ?? 0) + match[0].length;
  }
  cut(text.length);
  return units;
}

/** Lines that are the handout's own furniture, never the text: headings, rules, lists, labels, attributions. */
const FURNITURE =
  /^\s*(?:#{1,6}\s|[-*_]{3,}\s*$|[-*+]\s|\d+[.)]\s|\*\*[^*]+\*\*|\||&nbsp;|[—–]\s|!\[|<|```)/;

type Fence = { lang: string; start: number; end: number; bodyStart: number };

/** The reply's code fences, by where their bodies are. */
function fencesOf(reply: string): Fence[] {
  const fences: Fence[] = [];
  const open = /^```([\w-]*)[^\n]*$/gm;
  let match: RegExpExecArray | null;
  while ((match = open.exec(reply))) {
    const bodyStart = match.index + match[0].length + 1;
    const close = reply.indexOf('\n```', bodyStart - 1);
    const end = close < 0 ? reply.length : close + 1;
    fences.push({
      lang: match[1],
      start: match.index,
      end,
      bodyStart: Math.min(bodyStart, end),
    });
    open.lastIndex = close < 0 ? reply.length : close + 4;
  }
  return fences;
}

type JsonString = {
  piece: Piece;
  key: string | null;
  object: number;
};

/** Every string in a JSON text, decoded, with its key and the object it is in. Never throws. */
function jsonStrings(reply: string, start: number, end: number) {
  const strings: JsonString[] = [];
  const layouts = new Map<number, string>();
  const verbs = new Set<number>();
  const stack: Array<{ id: number; kind: '{' | '['; key: string | null }> = [];
  let pendingKey: string | null = null;
  let nextId = 0;
  for (let i = start; i < end; i += 1) {
    const ch = reply[i];
    if (ch === '{' || ch === '[') {
      const key =
        stack.length && stack[stack.length - 1].kind === '{'
          ? pendingKey
          : (stack[stack.length - 1]?.key ?? null);
      stack.push({ id: nextId++, kind: ch, key });
      pendingKey = null;
    } else if (ch === '}' || ch === ']') {
      stack.pop();
      pendingKey = null;
    } else if (ch === '"') {
      let text = '';
      const map: number[] = [];
      let j = i + 1;
      for (; j < end && reply[j] !== '"'; j += 1) {
        if (reply[j] === '\n') break;
        if (reply[j] === '\\') {
          const esc = reply[j + 1];
          const simple: Record<string, string> = {
            n: '\n',
            t: '\t',
            r: '\r',
            b: '\b',
            f: '\f',
            '"': '"',
            '\\': '\\',
            '/': '/',
          };
          if (esc === 'u') {
            map.push(j);
            text += String.fromCharCode(
              parseInt(reply.slice(j + 2, j + 6), 16) || 32
            );
            j += 5;
          } else {
            map.push(j);
            text += simple[esc] ?? esc ?? '';
            j += 1;
          }
        } else {
          map.push(j);
          text += reply[j];
        }
      }
      map.push(j);
      let k = j + 1;
      while (k < end && /\s/.test(reply[k])) k += 1;
      const top = stack[stack.length - 1];
      if (reply[k] === ':' && top?.kind === '{') pendingKey = text;
      else {
        const key = top?.kind === '{' ? pendingKey : (top?.key ?? null);
        const object = top?.kind === '{' ? top.id : -1;
        if (key === 'layout') layouts.set(object, text);
        if (key === 'verb') verbs.add(object);
        strings.push({ piece: { text, offset: i + 1, map }, key, object });
        pendingKey = null;
      }
      i = j;
    }
  }
  return { strings, layouts, verbs };
}

/** Passages and plain text in a run of markdown lines. */
function linePassages(
  reply: string,
  start: number,
  end: number,
  inMaterial: boolean
): { passages: Passage[]; prose: Piece[] } {
  const passages: Passage[] = [];
  const prose: Piece[] = [];
  const piece: Piece = { text: reply, offset: 0 };
  let run: {
    quoted: boolean;
    lines: Array<{ start: number; text: string; blankBefore: boolean }>;
  } | null = null;
  let blank = false;
  const flush = () => {
    if (!run) return;
    const units = run.lines.flatMap((line) =>
      unitsOfLine(piece, line.start, line.text, line.blankBefore)
    );
    if (units.length) {
      const first = run.lines[0];
      const last = run.lines[run.lines.length - 1];
      const content = lineContent(first.text);
      const prefix = first.text.match(/^\s*>\s?/)?.[0] ?? '';
      passages.push({
        piece,
        units,
        explicit: run.quoted,
        kind: 'lines',
        prefix,
        open: content.open,
        close: content.close,
        near: { start: first.start, end: last.start + last.text.length },
      });
    }
    run = null;
  };
  let pos = start;
  for (const line of reply.slice(start, end).split('\n')) {
    const lineStart = pos;
    pos += line.length + 1;
    const quoted = /^\s*>/.test(line);
    const inner = quoted ? line.replace(/^\s*>\s?/, '') : line;
    if (!inner.trim() || /^[\s*_]*$/.test(inner)) {
      blank = true;
      if (run && run.quoted !== quoted) flush();
      continue;
    }
    if (ELLIPSIS_LINE.test(inner)) {
      flush();
      continue;
    }
    const candidate = quoted || (inMaterial && !FURNITURE.test(inner));
    if (!candidate) {
      flush();
      prose.push({ text: line, offset: lineStart });
      blank = false;
      continue;
    }
    if (run && run.quoted !== quoted) flush();
    if (!run) run = { quoted, lines: [] };
    run.lines.push({
      start: lineStart,
      text: line,
      blankBefore: blank && run.lines.length > 0,
    });
    // A line that is also read for inline quotations, when it is not the text.
    prose.push({ text: line, offset: lineStart });
    blank = false;
  }
  flush();
  return { passages, prose };
}

// ───────────────────────────── claims ─────────────────────────────

type Claim = { at: number; label: string } & Section;

const CLAIM_NUM = String.raw`(\d{1,3}|[IVXLC]{1,7}\b|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)`;

/** "Chapter 1", "Act 1, Scene 3", "Book 9" in a piece of the reply, by structure. */
function claimsIn(
  text: string,
  offset: number,
  structure: RegisteredWork['structure']
): Claim[] {
  const out: Claim[] = [];
  const push = (re: RegExp, make: (m: RegExpMatchArray) => Section | null) => {
    for (const m of text.matchAll(re)) {
      const section = make(m);
      if (section)
        out.push({
          at: offset + (m.index ?? 0),
          label: m[0].trim(),
          ...section,
        });
    }
  };
  if (structure === 'acts')
    push(
      new RegExp(
        String.raw`\bAct\s+${CLAIM_NUM}(?:\s*,?\s*(?:Scene|sc\.)\s+${CLAIM_NUM})?`,
        'gi'
      ),
      (m) => {
        const act = readNumber(m[1]);
        if (!act) return null;
        const scene = m[2] ? readNumber(m[2]) : null;
        return scene ? { act, scene } : { act };
      }
    );
  if (structure === 'chapters')
    push(
      new RegExp(String.raw`\b(?:Chapter|Ch\.)\s*${CLAIM_NUM}`, 'gi'),
      (m) => {
        const chapter = readNumber(m[1]);
        return chapter ? { chapter } : null;
      }
    );
  if (structure === 'books')
    push(new RegExp(String.raw`\bBook\s+${CLAIM_NUM}`, 'gi'), (m) => {
      const book = readNumber(m[1]);
      return book ? { book } : null;
    });
  return out.sort((a, b) => a.at - b.at);
}

/** Whether a quotation found in `actual` fits the claim. */
function fits(claim: Section, actual: Section): boolean {
  if (claim.act !== undefined) {
    if (actual.act !== claim.act) return false;
    return (
      claim.scene === undefined ||
      actual.scene === undefined ||
      claim.scene === actual.scene
    );
  }
  if (claim.chapter !== undefined) return actual.chapter === claim.chapter;
  if (claim.book !== undefined) return actual.book === claim.book;
  return true;
}

/** The part of the reply around a point: its own paragraph, and with `wide` one either side, capped. */
function around(reply: string, span: Span, wide: boolean): Span {
  const back = wide ? 320 : 260;
  const ahead = wide ? 220 : 140;
  let start = Math.max(0, span.start - back);
  let end = Math.min(reply.length, span.end + ahead);
  const before = reply.slice(start, span.start);
  const after = reply.slice(span.end, end);
  const breaksBefore = [...before.matchAll(/\n\s*>?\s*\n|[{}]/g)];
  const keepBefore = wide ? 2 : 1;
  if (breaksBefore.length >= keepBefore) {
    const cut = breaksBefore[breaksBefore.length - keepBefore];
    start += (cut.index ?? 0) + cut[0].length;
  }
  const breaksAfter = [...after.matchAll(/\n\s*>?\s*\n|[{}]/g)];
  if (breaksAfter.length >= keepBefore)
    end = span.end + (breaksAfter[keepBefore - 1].index ?? 0);
  return { start, end };
}

// ───────────────────────────── the check ─────────────────────────────

type Options = {
  work?: RegisteredWork | null;
  /** Report only; change nothing (a translation, or an edition the lesson may not use). */
  verifyOnly?: boolean;
};

const MIN_WORDS = 6;
const CLOSE_ENOUGH = 0.85;
const RESEMBLES = 0.5;

/** Near enough to be the same line misremembered: 85% alike, and most of its words the source's. */
const isClose = (near: Near) => near.close >= CLOSE_ENOUGH && near.score >= 0.7;

const short = (text: string, max = 90) => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

/**
 * Every quotation in the reply checked against the work's text. See the top
 * of this file. `source` is the text, or a prepared source to reuse.
 */
export function checkQuotations(
  reply: string,
  source: string | PreparedSource,
  options: Options = {}
): QuotationCheck {
  const unchanged: QuotationCheck = {
    reply,
    corrections: [],
    unverified: [],
    misplaced: [],
    verified: [],
  };
  try {
    return runCheck(reply, source, options);
  } catch {
    return unchanged;
  }
}

function runCheck(
  reply: string,
  sourceIn: string | PreparedSource,
  options: Options
): QuotationCheck {
  const work = options.work ?? null;
  const source =
    typeof sourceIn === 'string'
      ? prepareSource(sourceIn, work?.structure ?? 'chapters')
      : sourceIn;
  const edition = work?.edition ?? 'the source text';
  const correct = !(options.verifyOnly ?? work?.verifyOnly ?? false);
  const structure = source.structure;

  const edits: Edit[] = [];
  const handled: Span[] = [];
  const corrections: Correction[] = [];
  const unverified: Unverified[] = [];
  const verified: string[] = [];
  const found: Array<{
    quote: string;
    span: Span;
    at: Span;
    near: Span | null;
  }> = [];

  const overlaps = (a: Span, list: Span[]) =>
    list.some((b) => a.start < b.end && b.start < a.end);
  const addEdit = (edit: Edit) => {
    if (overlaps(edit, edits)) return false;
    edits.push(edit);
    handled.push(edit);
    return true;
  };
  const rawSpan = (piece: Piece, start: number, end: number): Span => ({
    start: rawAt(piece, start),
    end: rawAt(piece, end),
  });
  const noteFound = (
    quote: string,
    span: Span,
    at: Span,
    near: Span | null
  ) => {
    found.push({ quote, span, at, near });
    verified.push(quote);
  };

  // ── gather the reply's pieces
  const fences = fencesOf(reply);
  const passages: Passage[] = [];
  const prose: Piece[] = [];
  let cursor = 0;
  const outside = (start: number, end: number) => {
    const part = linePassages(reply, start, end, false);
    passages.push(...part.passages);
    prose.push(...part.prose);
  };
  for (const fence of fences) {
    outside(cursor, fence.start);
    cursor = Math.min(reply.length, fence.end + 3);
    if (fence.lang === 'yawp-slides') {
      const { strings, layouts, verbs } = jsonStrings(
        reply,
        fence.bodyStart,
        fence.end
      );
      for (const entry of strings) {
        const layout = layouts.get(entry.object);
        const isText =
          entry.key === 'quote' ||
          entry.key === 'passage' ||
          entry.key === 'excerpt' ||
          (entry.key === 'body' &&
            (layout === 'quote' || layout === 'excerpt'));
        const candidate =
          isText || (entry.key === 'text' && !verbs.has(entry.object));
        if (candidate) {
          const piece = entry.piece;
          const segments: Unit[] = [];
          const pattern = / \/ |\n/g;
          let from = 0;
          const pushSegment = (to: number) => {
            const raw = piece.text.slice(from, to);
            const lead = raw.length - raw.trimStart().length;
            const s = from + lead;
            const e = from + raw.trimEnd().length;
            const words = lineWords(piece.text.slice(s, e), s);
            if (words.length) {
              const content = { start: s, end: e };
              segments.push(
                ...unitsOfLine(
                  piece,
                  content.start,
                  piece.text.slice(s, e),
                  false
                ).map((u) => ({ ...u, lineStart: s, lineEnd: e }))
              );
            }
          };
          for (const m of piece.text.matchAll(pattern)) {
            pushSegment(m.index ?? 0);
            from = (m.index ?? 0) + m[0].length;
          }
          pushSegment(piece.text.length);
          if (segments.length)
            passages.push({
              piece,
              units: segments,
              explicit: isText,
              kind: 'json',
              prefix: '',
              open: '',
              close: '',
              near: {
                start: piece.offset,
                end: rawAt(piece, piece.text.length),
              },
            });
        }
        prose.push(entry.piece);
      }
    } else if (fence.lang === 'yawp-material') {
      const body = reply.slice(fence.bodyStart, fence.end);
      const rule = body.match(/^---\s*$/m);
      const front =
        rule?.index !== undefined &&
        /^[\w-]+:/m.test(body.slice(0, rule.index));
      const bodyStart =
        front && rule?.index !== undefined
          ? fence.bodyStart + rule.index + rule[0].length + 1
          : fence.bodyStart;
      const part = linePassages(
        reply,
        Math.min(bodyStart, fence.end),
        fence.end,
        true
      );
      passages.push(...part.passages);
      prose.push(...part.prose);
    } else {
      prose.push({
        text: reply.slice(fence.bodyStart, fence.end),
        offset: fence.bodyStart,
      });
    }
  }
  outside(cursor, reply.length);

  const unitText = (unit: Unit) => unit.piece.text.slice(unit.start, unit.end);

  // ── passages: the lines between the first and last found, as the source has them
  const covered = new Set<Unit>();
  for (const passage of passages) {
    const verse =
      passage.units.length >= 2 && passage.units.every((u) => u.whole);
    if (verse) checkVerse(passage);
  }

  function checkVerse(passage: Passage) {
    const units = passage.units;
    const total = units.reduce((sum, u) => sum + u.words.length, 0);
    let anchor: { f: number; l: number; first: Span; last: Span } | null = null;
    for (let f = 0; f < units.length - 1 && !anchor; f += 1) {
      if (units[f].words.length < 4) continue;
      for (const first of findAll(source, units[f].words, { limit: 5 })) {
        const windowEnd = first.end + 2 * total + 60;
        for (let l = units.length - 1; l > f; l -= 1) {
          if (units[l].words.length < 2) continue;
          const [last] = findAll(source, units[l].words, {
            from: first.end,
            to: windowEnd,
          });
          if (last) {
            anchor = { f, l, first, last };
            break;
          }
        }
        if (anchor) break;
      }
    }
    if (!anchor) return;
    let { f, l } = anchor;
    const span: Span = { start: anchor.first.start, end: anchor.last.end };
    // Short lines just before the first and after the last ("This supernatural soliciting") belong to it when the source has them there.
    const sameAt = (unit: Unit, at: number) =>
      at >= 0 &&
      at + unit.words.length <= source.words.length &&
      unit.words.every((word, i) => source.words[at + i] === word);
    while (
      f > 0 &&
      sameAt(units[f - 1], span.start - units[f - 1].words.length)
    ) {
      f -= 1;
      span.start -= units[f].words.length;
    }
    while (l < units.length - 1 && sameAt(units[l + 1], span.end)) {
      l += 1;
      span.end += units[l].words.length;
    }
    const inner = units.slice(f, l + 1);
    const replyLetters = inner.map((u) => u.words.join('')).join('');
    const sourceLetters = source.words.slice(span.start, span.end).join('');
    const near = widen(reply, passage.near);
    const piece = passage.piece;
    const startRaw = rawAt(
      piece,
      passage.kind === 'json' ? inner[0].start : inner[0].lineStart
    );
    const endRaw = rawAt(
      piece,
      passage.kind === 'json'
        ? inner[inner.length - 1].end
        : inner[inner.length - 1].lineEnd
    );
    if (replyLetters === sourceLetters) {
      for (const unit of inner) covered.add(unit);
      handled.push({ start: startRaw, end: endRaw });
      const text = inner.map(unitText).join(' / ');
      noteFound(text, span, { start: startRaw, end: endRaw }, near);
      return;
    }
    // The source's lines in that span, each with the words it holds.
    const lines = sourceLines(span);
    const keyed = new Map<string, Unit[]>();
    for (const unit of inner) {
      const key = unit.words.join('');
      keyed.set(key, [...(keyed.get(key) ?? []), unit]);
    }
    // A run whose lines that differ share nothing with the source is the teacher's own, not a misquotation.
    const unmatched = inner.filter(
      (u) => !lines.some((line) => line.key === u.words.join(''))
    );
    if (!passage.explicit) {
      const vocabulary = new Set(source.words.slice(span.start, span.end));
      const stems = new Set([...vocabulary].map((w) => w.slice(0, 5)));
      const content = unmatched.flatMap((u) =>
        u.words.filter((w) => !STOP.has(w))
      );
      const shared = content.filter(
        (w) => vocabulary.has(w) || stems.has(w.slice(0, 5))
      ).length;
      if (content.length && shared / content.length < 0.34) return;
    }
    if (!correct) {
      for (const unit of unmatched)
        if (unit.words.length >= MIN_WORDS)
          unverified.push({ quote: unitText(unit), why: `Not in ${edition}.` });
      return;
    }
    const hadBlanks = inner.slice(1).some((u) => u.blankBefore);
    const used = new Set<Unit>();
    const out: string[] = [];
    const restored: string[] = [];
    for (const line of lines) {
      if (
        line.blankBefore &&
        out.length &&
        hadBlanks &&
        passage.kind !== 'json'
      )
        out.push(passage.prefix.trimEnd());
      const match = keyed.get(line.key)?.find((u) => !used.has(u));
      if (match) {
        used.add(match);
        out.push(
          passage.kind === 'json'
            ? unitText(match)
            : piece.text.slice(match.lineStart, match.lineEnd)
        );
      } else {
        restored.push(line.text);
        out.push(
          passage.kind === 'json'
            ? line.text
            : `${passage.prefix}${passage.open}${line.text}${passage.close}`
        );
      }
    }
    const invented = inner.filter((u) => !used.has(u)).map(unitText);
    const text = passage.kind === 'json' ? out.join(' / ') : out.join('\n');
    const before = reply.slice(startRaw, endRaw);
    const after = encode(piece, text);
    if (!addEdit({ start: startRaw, end: endRaw, text: after })) return;
    for (const unit of inner) covered.add(unit);
    const where = sectionLabel(sectionAt(source, source.starts[span.start]));
    const parts: string[] = [];
    if (invented.length)
      parts.push(
        `${invented.length} line${invented.length === 1 ? '' : 's'} not in the source (${invented.map((t) => `“${short(t, 60)}”`).join('; ')})`
      );
    if (restored.length)
      parts.push(
        `${restored.length} line${restored.length === 1 ? '' : 's'} put back as the source has ${restored.length === 1 ? 'it' : 'them'} (${restored.map((t) => `“${short(t, 60)}”`).join('; ')})`
      );
    corrections.push({
      before:
        passage.kind === 'json' ? inner.map(unitText).join(' / ') : before,
      after: text,
      why: `The passage differs from ${edition}${where ? ` (${where})` : ''}: ${parts.join('; ')}.`,
    });
    noteFound(
      text,
      span,
      { start: startRaw, end: startRaw + after.length },
      near
    );
  }

  /** The source's lines over a span of its words, as text, with the words each holds. */
  function sourceLines(span: Span) {
    const out: Array<{ text: string; key: string; blankBefore: boolean }> = [];
    let i = span.start;
    let lastLineEnd = -1;
    while (i < span.end) {
      const lineStart = source.text.lastIndexOf('\n', source.starts[i] - 1) + 1;
      let lineEnd = source.text.indexOf('\n', source.starts[i]);
      if (lineEnd < 0) lineEnd = source.text.length;
      let j = i;
      while (j < span.end && source.starts[j] < lineEnd) j += 1;
      const from = i === span.start ? source.starts[i] : lineStart;
      let to = lineEnd;
      if (j === span.end && source.ends[j - 1] < lineEnd) {
        // The span ends inside the line: keep the punctuation that closes it, no more words.
        const rest = source.text.slice(source.ends[j - 1], lineEnd);
        to =
          source.ends[j - 1] +
          (rest.match(/^[^\p{L}\p{N}\s]*/u)?.[0].length ?? 0);
      }
      const between =
        lastLineEnd >= 0 ? source.text.slice(lastLineEnd, lineStart) : '';
      const text = cleanSource(source.text.slice(from, to))
        .replace(/\s+/g, ' ')
        .trim();
      out.push({
        text,
        key: source.words.slice(i, j).join(''),
        blankBefore: /\n\s*\n/.test(between),
      });
      lastLineEnd = lineEnd;
      i = j;
    }
    return out;
  }

  // ── units: each line or sentence of a passage not already settled
  for (const passage of passages) {
    const units = passage.units.filter(
      (u) => !covered.has(u) && u.words.length >= MIN_WORDS
    );
    const exacts = new Map(
      units.map((u) => [u, findAll(source, u.words)[0]] as const)
    );
    // The passage is the text (some of it checked against the source): what is not in it is reported.
    const anchored =
      passage.units.some((u) => covered.has(u)) ||
      [...exacts.values()].filter(Boolean).length >= 2;
    for (const unit of units) {
      const span = rawSpan(unit.piece, unit.start, unit.end);
      if (overlaps(span, handled)) continue;
      const text = unitText(unit);
      const exact = exacts.get(unit);
      if (exact) {
        handled.push(span);
        noteFound(text, exact, span, widen(reply, passage.near));
        continue;
      }
      const near = closest(source, unit.words);
      const score = near?.score ?? 0;
      if (near && isClose(near) && correct) {
        if (
          applyWording(
            unit.piece,
            unit.start,
            unit.end,
            near,
            widen(reply, passage.near)
          )
        )
          continue;
      }
      if (anchored || score >= RESEMBLES) {
        unverified.push({
          quote: text,
          why:
            near && score >= RESEMBLES
              ? `Not in ${edition} as written; the nearest words are there.`
              : `Not found in ${edition}.`,
          ...(near && score >= RESEMBLES
            ? { closest: sourceWords(source, near) }
            : {}),
        });
        handled.push(span);
      }
    }
  }

  /** Put the source's wording in place of a quotation's words, keeping its own marks around them. */
  function applyWording(
    piece: Piece,
    start: number,
    end: number,
    near: Near,
    nearSpan: Span | null
  ): boolean {
    const text = piece.text.slice(start, end);
    const words = wordsOf(text);
    if (!words.length) return false;
    const lead = text.slice(0, words[0].start);
    const trail = text.slice(words[words.length - 1].end);
    const joiner = /\s\/\s/.test(text) ? ' / ' : ' ';
    const wording = `${lead}${sourceWords(source, near, joiner)}${trail}`;
    if (wording === text) return false;
    const span = rawSpan(piece, start, end);
    if (
      !addEdit({
        start: span.start,
        end: span.end,
        text: encode(piece, wording),
      })
    )
      return false;
    const where = sectionLabel(sectionAt(source, source.starts[near.start]));
    corrections.push({
      before: text,
      after: wording,
      why: `Misquoted: ${edition}${where ? ` (${where})` : ''} reads “${short(sourceWords(source, near), 160)}”.`,
    });
    noteFound(
      wording,
      near,
      { start: span.start, end: span.start + wording.length },
      nearSpan
    );
    return true;
  }

  // ── inline quotations in the reply's own prose
  const QUOTES = [
    /"([^"\n]{12,700}?)"/g,
    /“([^”\n]{12,700}?)”/g,
    /(?<![\p{L}\p{N}])['‘]((?:[^'‘’\n]|(?<=\p{L})['’](?=\p{L})){12,700}?)['’](?![\p{L}\p{N}])/gu,
  ];
  // Not "says" or "asks": the teacher's own script is full of "if a student says '…'".
  const CUE =
    /\b(?:writes|wrote|cries|replies|declares|exclaims|calls (?:himself|herself|it)|the line|lines?|reads|begins|ends|opens|closes|famous(?:ly)?)\s*[:,—–-]?\s*[*_]*$/i;
  for (const piece of prose) {
    for (const pattern of QUOTES) {
      for (const match of piece.text.matchAll(pattern)) {
        const inner = match[1];
        const innerStart = (match.index ?? 0) + match[0].indexOf(inner);
        const parts = splitEllipsis(inner);
        for (const part of parts) {
          const start = innerStart + part.start;
          const end = innerStart + part.end;
          const words = wordsOf(piece.text.slice(start, end)).map(
            (w) => w.word
          );
          if (words.length < MIN_WORDS) continue;
          const span = rawSpan(piece, start, end);
          if (overlaps(span, handled)) continue;
          const text = piece.text.slice(start, end);
          const [exact] = findAll(source, words);
          const nearSpan = around(reply, span, false);
          if (exact) {
            handled.push(span);
            noteFound(text, exact, span, nearSpan);
            continue;
          }
          const near = closest(source, words);
          const score = near?.score ?? 0;
          if (
            near &&
            isClose(near) &&
            correct &&
            applyWording(piece, start, end, near, nearSpan)
          )
            continue;
          const cued = CUE.test(
            piece.text.slice(
              Math.max(0, (match.index ?? 0) - 40),
              match.index ?? 0
            )
          );
          if (score >= RESEMBLES || cued) {
            handled.push(span);
            unverified.push({
              quote: text,
              why:
                score >= RESEMBLES
                  ? `Not in ${edition} as written; the nearest words are there.`
                  : `Not found in ${edition}.`,
              ...(near && score >= RESEMBLES
                ? { closest: sourceWords(source, near) }
                : {}),
            });
          }
        }
      }
    }
  }

  // ── where each quotation is, against where the reply says it is
  const misplaced: Misplaced[] = [];
  if (structure !== 'poems') {
    const scope = lessonScope(reply, structure);
    const seen = new Set<string>();
    for (const entry of found) {
      const actual = sectionAt(source, source.starts[entry.span.start]);
      const actualLabel = sectionLabel(actual);
      if (!actual || !actualLabel) continue;
      const window = entry.near ?? around(reply, entry.at, false);
      const claims = claimsIn(
        reply.slice(window.start, window.end),
        window.start,
        structure
      );
      const before = claims.filter((c) => c.at < entry.at.start);
      const claim =
        before[before.length - 1] ??
        claims.find((c) => c.at >= entry.at.end) ??
        null;
      let claimed: string | null = null;
      if (claim && !fits(claim, actual)) claimed = claim.label;
      else if (!claim && scope.length && !scope.some((s) => fits(s, actual)))
        claimed = `${scope.map((s) => s.label).join(', ')} (the lesson's reading)`;
      if (!claimed) continue;
      // The same quotation again, whole or in part, is said once.
      const key = entry.quote.toLowerCase().replace(/[^a-z]/g, '');
      if (
        [...seen].some(
          (k) =>
            k.startsWith(`${actualLabel}|`) &&
            (k.includes(key) || key.includes(k.slice(actualLabel.length + 1)))
        )
      )
        continue;
      seen.add(`${actualLabel}|${key}`);
      misplaced.push({
        quote: short(entry.quote, 160),
        claimed,
        actual: actualLabel,
      });
    }
  }

  // ── the changes, last first
  let out = reply;
  for (const edit of [...edits].sort((a, b) => b.start - a.start))
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  return {
    reply: out,
    corrections,
    unverified: dedupe(unverified),
    misplaced,
    verified: [...new Set(verified)],
  };
}

/** A passage's window, one paragraph either side. */
function widen(reply: string, span: Span): Span {
  return around(reply, span, true);
}

function dedupe(list: Unverified[]): Unverified[] {
  const seen = new Set<string>();
  return list.filter((entry) => {
    const key = entry.quote.toLowerCase().replace(/[^a-z]/g, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The pieces of a quotation between its ellipses. */
function splitEllipsis(text: string): Span[] {
  const out: Span[] = [];
  let from = 0;
  for (const m of text.matchAll(
    /\s*(?:\.\s?\.\s?\.|…|\[\s*(?:\.\.\.|…)\s*\])\s*/g
  )) {
    out.push({ start: from, end: m.index ?? 0 });
    from = (m.index ?? 0) + m[0].length;
  }
  out.push({ start: from, end: text.length });
  return out.filter((s) => s.end > s.start);
}

/** What the lesson says it reads: "Chapter 1" in its first heading or its deck's subtitle. */
function lessonScope(
  reply: string,
  structure: RegisteredWork['structure']
): Claim[] {
  const places = [
    reply.match(/^#\s+(.+)$/m)?.[1],
    reply.match(/^title:\s*(.+)$/m)?.[1],
    reply.match(/"subtitle"\s*:\s*"([^"]{1,200})"/)?.[1],
    reply.match(/^#{2,3}\s+(.+)$/m)?.[1],
  ];
  for (const place of places) {
    const claims = place ? claimsIn(place, 0, structure) : [];
    if (claims.length) return claims;
  }
  return [];
}

// ───────────────────────────── with the work's text ─────────────────────────────

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

const prepared = new Map<string, PreparedSource>();
const PREPARED_SIZE = 6;

/** The work's text made ready to search, kept for the last six works. */
async function preparedWork(
  work: RegisteredWork,
  options: { fetch?: Fetch; timeoutMs?: number }
): Promise<PreparedSource | null> {
  const kept = prepared.get(work.id);
  if (kept) return kept;
  const text = await fetchWorkText(work, options);
  if (!text) return null;
  const source = prepareSource(text, work.structure);
  prepared.set(work.id, source);
  while (prepared.size > PREPARED_SIZE) {
    const oldest = prepared.keys().next().value;
    if (oldest === undefined) break;
    prepared.delete(oldest);
  }
  return source;
}

/** Forget every prepared text (tests). */
export function clearPreparedSources() {
  prepared.clear();
}

/**
 * The reply's quotations checked against the work it is about, the work
 * found from the reply's words (or given). When no registered work is named,
 * or its text cannot be had in time, the reply comes back as it was.
 */
export async function withQuotationCheck(
  reply: string,
  options: {
    work?: RegisteredWork | null;
    fetch?: Fetch;
    timeoutMs?: number;
  } = {}
): Promise<QuotationCheck & { work: RegisteredWork | null }> {
  const unchanged = {
    reply,
    corrections: [],
    unverified: [],
    misplaced: [],
    verified: [],
    work: null,
  };
  try {
    const work = options.work ?? workForText(reply);
    if (!work) return unchanged;
    const source = await preparedWork(work, options);
    if (!source) return { ...unchanged, work };
    return { ...checkQuotations(reply, source, { work }), work };
  } catch {
    return unchanged;
  }
}
