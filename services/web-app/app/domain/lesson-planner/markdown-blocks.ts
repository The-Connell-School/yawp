/**
 * Markdown, flattened into the blocks a page is actually laid out from.
 *
 * The packet's content is Markdown, and the browser already knows how to lay
 * that out. A PDF built on the server does not: something has to decide that a
 * `##` is 14pt semibold with space above it, that a list item is an indent and
 * a marker, and that a run of bold text inside a paragraph keeps its weight.
 *
 * That decision is made here, in plain data, so it can be tested without
 * producing a single byte of PDF. The drawing half — fonts, pagination, the
 * actual document — reads this and does as it is told.
 */
import { marked } from 'marked';

/** A stretch of text that shares one style. */
export type TextRun = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  /** Fixed-width, for the odd inline code span in a handout. */
  mono?: boolean;
  /** Present when the run was a link; the drawing half makes it clickable. */
  href?: string;
};

export type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; runs: TextRun[] }
  | { kind: 'paragraph'; runs: TextRun[] }
  | { kind: 'quote'; runs: TextRun[] }
  /** `marker` is "•" or "3." — already resolved, so drawing stays dumb. */
  | { kind: 'listItem'; depth: number; marker: string; runs: TextRun[] }
  | { kind: 'rule' }
  | { kind: 'tableRow'; header: boolean; cells: TextRun[][] }
  /** A poem or speech, a line to a line, numbered from `start` (plan item 2, Nov 22). */
  | { kind: 'verse'; lines: TextRun[][]; start: number; quoted?: boolean };

type InlineToken = {
  type: string;
  text?: string;
  raw?: string;
  href?: string;
  tokens?: InlineToken[];
};

const BULLETS = ['•', '–', '·'];

/**
 * Undo the HTML escaping marked does on its way to being HTML.
 *
 * The lexer hands back text ready to be dropped into a page, so a teacher's
 * `"so what?"` arrives as `&quot;so what?&quot;`. On a web page that is
 * invisible; typeset into a PDF it is exactly what it looks like — machinery
 * printed on a lesson plan.
 */
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  // A plain space: the kit's fonts cannot measure a no-break space, and a
  // handout of "&nbsp;" answer lines failed to print (Nov 22).
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
};

export function decodeEntities(text: string): string {
  return text.replace(
    /&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g,
    (whole, body: string) => {
      if (body[0] === '#') {
        const code =
          body[1] === 'x' || body[1] === 'X'
            ? Number.parseInt(body.slice(2), 16)
            : Number.parseInt(body.slice(1), 10);
        // A code point out of range would throw; leaving the text alone is the
        // safer failure.
        if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return whole;
        try {
          return String.fromCodePoint(code);
        } catch {
          return whole;
        }
      }
      return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
    }
  );
}

/**
 * Flatten marked's inline tokens into styled runs.
 *
 * Emphasis nests — `**bold with *italic* inside**` — so the style travels down
 * rather than being read off a single token.
 */
export function inlineRuns(
  tokens: InlineToken[] | undefined,
  inherited: Omit<TextRun, 'text'> = {}
): TextRun[] {
  const runs: TextRun[] = [];

  for (const token of tokens ?? []) {
    switch (token.type) {
      case 'strong':
        runs.push(...inlineRuns(token.tokens, { ...inherited, bold: true }));
        break;
      case 'em':
        runs.push(...inlineRuns(token.tokens, { ...inherited, italic: true }));
        break;
      case 'codespan':
        runs.push({
          ...inherited,
          mono: true,
          text: decodeEntities(token.text ?? ''),
        });
        break;
      case 'link':
        runs.push(
          ...inlineRuns(token.tokens, { ...inherited, href: token.href })
        );
        break;
      case 'br':
        runs.push({ ...inherited, text: '\n' });
        break;
      case 'escape':
      case 'text':
        // A `text` token can itself carry children (a list item's content
        // arrives that way); the leaf is the one with none.
        if (token.tokens?.length) {
          runs.push(...inlineRuns(token.tokens, inherited));
        } else {
          runs.push({ ...inherited, text: decodeEntities(token.text ?? '') });
        }
        break;
      default:
        // Anything with children still has text worth keeping; anything else
        // contributes its raw form rather than vanishing from the page.
        if (token.tokens?.length) {
          runs.push(...inlineRuns(token.tokens, inherited));
        } else if (token.text ?? token.raw) {
          runs.push({
            ...inherited,
            text: decodeEntities(token.text ?? token.raw ?? ''),
          });
        }
    }
  }

  return merge(runs);
}

/** Adjacent runs in the same style are one run, so drawing does less work. */
function merge(runs: TextRun[]): TextRun[] {
  const merged: TextRun[] = [];
  for (const run of runs) {
    if (!run.text) continue;
    const previous = merged[merged.length - 1];
    if (
      previous &&
      previous.bold === run.bold &&
      previous.italic === run.italic &&
      previous.mono === run.mono &&
      previous.href === run.href
    ) {
      previous.text += run.text;
      continue;
    }
    merged.push({ ...run });
  }
  return merged;
}

function headingLevel(depth: number): 1 | 2 | 3 {
  if (depth <= 1) return 1;
  return depth === 2 ? 2 : 3;
}

function listBlocks(
  token: any,
  depth: number,
  into: Block[],
  startAt: number
): void {
  let index = startAt;
  for (const item of token.items ?? []) {
    const marker = token.ordered
      ? `${index}.`
      : (BULLETS[Math.min(depth, BULLETS.length - 1)] ?? '•');

    // A list item holds its own blocks: the first is its text, and a nested
    // list is one of the rest.
    const own: InlineToken[] = [];
    const nested: any[] = [];
    for (const child of item.tokens ?? []) {
      if (child.type === 'list') nested.push(child);
      else if (child.type === 'text' || child.type === 'paragraph') {
        own.push(...(child.tokens ?? [{ type: 'text', text: child.text }]));
      } else if (child.type !== 'space') {
        nested.push(child);
      }
    }

    into.push({
      kind: 'listItem',
      depth,
      marker,
      runs: inlineRuns(own),
    });

    for (const child of nested) {
      if (child.type === 'list') {
        listBlocks(child, depth + 1, into, child.start || 1);
      } else {
        into.push(...blocksFromTokens([child]));
      }
    }
    index += 1;
  }
}

function blocksFromTokens(tokens: any[]): Block[] {
  const blocks: Block[] = [];

  for (const token of tokens) {
    switch (token.type) {
      case 'heading':
        blocks.push({
          kind: 'heading',
          level: headingLevel(token.depth),
          runs: inlineRuns(token.tokens),
        });
        break;
      case 'paragraph':
        blocks.push({ kind: 'paragraph', runs: inlineRuns(token.tokens) });
        break;
      case 'blockquote':
        // Every paragraph inside the quote is its own quoted line, so a
        // multi-paragraph prompt keeps its shape.
        for (const inner of blocksFromTokens(token.tokens ?? [])) {
          blocks.push(
            inner.kind === 'paragraph' || inner.kind === 'heading'
              ? { kind: 'quote', runs: inner.runs }
              : inner
          );
        }
        break;
      case 'list':
        listBlocks(token, 0, blocks, token.start || 1);
        break;
      case 'hr':
        blocks.push({ kind: 'rule' });
        break;
      case 'table':
        blocks.push({
          kind: 'tableRow',
          header: true,
          cells: (token.header ?? []).map((cell: any) =>
            inlineRuns(cell.tokens)
          ),
        });
        for (const row of token.rows ?? []) {
          blocks.push({
            kind: 'tableRow',
            header: false,
            cells: row.map((cell: any) => inlineRuns(cell.tokens)),
          });
        }
        break;
      case 'code':
        // Rare in a lesson, but printing it as a paragraph beats dropping it.
        blocks.push({
          kind: 'paragraph',
          runs: [{ text: decodeEntities(token.text ?? ''), mono: true }],
        });
        break;
      case 'space':
        break;
      default:
        if (token.tokens?.length)
          blocks.push(...blocksFromTokens(token.tokens));
        else if (token.text) {
          blocks.push({
            kind: 'paragraph',
            runs: [{ text: decodeEntities(token.text) }],
          });
        }
    }
  }

  return blocks;
}

/** The whole document, as blocks to lay out in order. */
export function markdownBlocks(markdown: string): Block[] {
  return withVerseBlocks(blocksFromTokens(marked.lexer(withVerseLineBreaks(markdown ?? ''))));
}

const CITED_LINES = /\blines?\s+(\d{1,4})\s*(?:[–—-]\s*(\d{1,4}))?/i;

/**
 * A paragraph of four or more broken lines is verse: drawn a line to a line
 * and numbered, so students find the line the teacher names (round 3, Nov 22:
 * Hamlet's and Romeo and Juliet's handouts had none). The numbers count from
 * the lines the passage's citation gives just before or after it ("lines
 * 56–88"), when they agree with its length within two; otherwise from 1.
 */
function withVerseBlocks(blocks: Block[]): Block[] {
  const out: Block[] = [];
  blocks.forEach((block, index) => out.push(asVerse(block, index, out[out.length - 1])));
  return out;

  function asVerse(block: Block, index: number, before: Block | undefined): Block {
    if (block.kind !== 'paragraph' && block.kind !== 'quote') return block;
    const lines: TextRun[][] = [[]];
    for (const run of block.runs) {
      const parts = run.text.split('\n');
      parts.forEach((part, i) => {
        if (i > 0) lines.push([]);
        if (part) lines[lines.length - 1]!.push({ ...run, text: part });
      });
    }
    if (lines.length < 4) return block;
    // Verse only: short lines. A quoted prompt of several sentences on lines of their own is not a poem.
    if (lines.some((line) => line.map((run) => run.text).join('').trim().length > 90)) return block;
    let start = 1;
    for (const near of [blocks[index + 1], blocks[index - 1]]) {
      if (!near || near.kind === 'verse' || near.kind === 'rule' || near.kind === 'tableRow') continue;
      const cited = near.runs.map((run) => run.text).join('').match(CITED_LINES);
      if (!cited) continue;
      const first = Number(cited[1]);
      const last = cited[2] ? Number(cited[2]) : null;
      // A citation a line or two out (a half line counted, or not) still says where the passage starts.
      if (last === null || Math.abs(last - first + 1 - lines.length) <= 2) {
        start = first;
        break;
      }
    }
    // The next stanza of the same poem goes on counting (round 4, Nov 22:
    // Dulce's handout began again at 1 in each stanza, and the tasks said
    // "lines 9–16").
    if (start === 1 && before?.kind === 'verse' && !citedNear(blocks, index)) start = before.start + before.lines.length;
    return { kind: 'verse', lines, start, ...(block.kind === 'quote' ? { quoted: true } : {}) };
  }
}

/** Whether a block beside this one cites lines of its own. */
function citedNear(blocks: Block[], index: number): boolean {
  return [blocks[index + 1], blocks[index - 1]].some(
    (near) => near && near.kind !== 'verse' && near.kind !== 'rule' && near.kind !== 'tableRow' && CITED_LINES.test(near.runs.map((run) => run.text).join(''))
  );
}

const NOT_VERSE_LINE = /^\s*(?:[-*+]\s|\d+[.)]\s|#|>|\||```|~~~|---|___|\*\*\*\s*$)/;

/**
 * A poem or a speech keeps its lines (re-test, Nov 22: Hamlet's soliloquy
 * printed for students as one paragraph, so no one could find line 15).
 * Markdown joins the lines of a paragraph; a paragraph of four or more short
 * lines that mostly begin with a capital, as verse does, gets a hard break at
 * the end of each line. Prose, written a paragraph to a line, is untouched.
 */
export function withVerseLineBreaks(markdown: string): string {
  const lines = markdown.split('\n');
  const out: string[] = [];
  let run: string[] = [];
  let inFence = false;
  const flush = () => {
    const visible = run.map((line) => line.replace(/[*_]/g, '').trim());
    const verse =
      run.length >= 4 &&
      visible.every((line) => line.length > 0 && line.length <= 90) &&
      visible.filter((line) => /^[\p{Lu}"“‘'(]/u.test(line)).length >= run.length * 0.75;
    run.forEach((line, i) => out.push(verse && i < run.length - 1 && !/(\\|\s{2})$/.test(line) ? `${line}\\` : line));
    run = [];
  };
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (inFence || !line.trim() || NOT_VERSE_LINE.test(line)) {
      flush();
      out.push(line);
    } else run.push(line);
  }
  flush();
  return out.join('\n');
}

/** Every word in a block, for tests and for measuring. */
export function blockText(block: Block): string {
  if (block.kind === 'rule') return '';
  if (block.kind === 'verse') return block.lines.map((line) => line.map((run) => run.text).join('')).join('\n');
  if (block.kind === 'tableRow') {
    return block.cells
      .map((cell) => cell.map((run) => run.text).join(''))
      .join(' | ');
  }
  return block.runs.map((run) => run.text).join('');
}
