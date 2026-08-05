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
  | { kind: 'tableRow'; header: boolean; cells: TextRun[][] };

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
  nbsp: ' ',
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
  return blocksFromTokens(marked.lexer(markdown ?? ''));
}

/** Every word in a block, for tests and for measuring. */
export function blockText(block: Block): string {
  if (block.kind === 'rule') return '';
  if (block.kind === 'tableRow') {
    return block.cells
      .map((cell) => cell.map((run) => run.text).join(''))
      .join(' | ');
  }
  return block.runs.map((run) => run.text).join('');
}
