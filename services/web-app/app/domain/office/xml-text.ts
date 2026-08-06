/**
 * The small amount of XML handling the office readers need.
 *
 * Deliberately not a parser. Both formats keep their visible text in one
 * well-known element — `<a:t>` in a deck, `<w:t>` in a document — and the job
 * is to pull those out in order and put the paragraph breaks back. A real DOM
 * parse of a fifty-slide deck would cost far more and answer the same question.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

export function decodeXmlEntities(text: string): string {
  return text.replace(
    /&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g,
    (whole, body: string) => {
      if (body.startsWith('#x') || body.startsWith('#X')) {
        const code = Number.parseInt(body.slice(2), 16);
        return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
      }
      if (body.startsWith('#')) {
        const code = Number.parseInt(body.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
      }
      return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
    }
  );
}

/**
 * Every occurrence of one element's text content, in document order.
 *
 * `<a:t>` and `<w:t>` both hold plain text with no child elements, so the
 * closing tag is unambiguous. `xml:space="preserve"` and other attributes are
 * matched over and ignored.
 */
export function textOf(xml: string, tag: string): string[] {
  const pattern = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'g');
  const found: string[] = [];
  for (const match of xml.matchAll(pattern)) {
    found.push(decodeXmlEntities(match[1] ?? ''));
  }
  return found;
}

/**
 * Text pulled out block by block, so paragraphs survive.
 *
 * `blockTag` is the paragraph element; `runTag` is the text element inside it;
 * `breakTags` are self-closing elements that mean a line break or a tab. A
 * block with no text at all comes back as an empty string rather than being
 * dropped, because a blank line on a handout is where a student writes.
 */
export function blocksOf(
  xml: string,
  {
    blockTag,
    runTag,
    breaks = {},
  }: {
    blockTag: string;
    runTag: string;
    breaks?: Record<string, string>;
  }
): string[] {
  const blockPattern = new RegExp(
    `<${blockTag}(?:\\s[^>]*)?(?:/>|>([\\s\\S]*?)</${blockTag}>)`,
    'g'
  );
  const inner = new RegExp(
    `<${runTag}(?:\\s[^>]*)?>([\\s\\S]*?)</${runTag}>|<(${Object.keys(breaks).join('|') || '\\0'})(?:\\s[^>]*)?/>`,
    'g'
  );

  const blocks: string[] = [];
  for (const block of xml.matchAll(blockPattern)) {
    const body = block[1];
    if (body === undefined) {
      // A self-closing paragraph — `<w:p/>` — is a blank line, and a blank
      // line on a worksheet is deliberate.
      blocks.push('');
      continue;
    }
    let text = '';
    for (const piece of body.matchAll(inner)) {
      if (piece[1] !== undefined) text += decodeXmlEntities(piece[1]);
      else if (piece[2] !== undefined) text += breaks[piece[2]] ?? '';
    }
    blocks.push(text.trimEnd());
  }
  return blocks;
}
