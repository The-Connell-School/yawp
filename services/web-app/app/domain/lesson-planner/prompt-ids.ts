/**
 * Library prompt ids are the app's, never the teacher's (Brian's run 2,
 * items 17, 21, 26).
 *
 * The planner cites a prompt by id (FW-021 from the freewrite library,
 * sf-ev-03 from the short-form library) so the app can send it to the right
 * assignment sheet. Teachers saw those codes on stack cards, in swap options
 * and in plan prose. The id stays in the `id:` header of a yawp-daily-pages
 * fence, which no card renders; everywhere a teacher reads, it comes out.
 */

const ID = String.raw`(?:FW-\d+|sf-[a-z0-9]+(?:-[a-z0-9]+)*)`;

/** "_Class Starter prompt FW-021_", the footer filed starters used to carry. */
const FOOTER = new RegExp(
  String.raw`\n*^_?(?:Class Starter|Daily Pages)\s+prompt\s+${ID}_?\s*$`,
  'gim'
);
/** "Daily Pages prompt FW-001: " — the label and id in front of a quote. */
const LABELLED = new RegExp(
  String.raw`\b(?:Class Starter|Daily Pages)\s+prompt\s+${ID}\s*[:—–-]?\s*`,
  'gi'
);
/** "prompt FW-093" on its own: the prompt stays, the code goes. */
const PROMPT_ID = new RegExp(String.raw`\bprompt\s+${ID}\b`, 'gi');
/** "(FW-024)". */
const PARENTHESIZED = new RegExp(String.raw`\s*\(\s*${ID}\s*\)`, 'gi');
/** "- FW-024: " or "- **FW-093** — " leading a bullet or a line. */
const LEADING = new RegExp(
  String.raw`^(\s*(?:[-*+]|\d+[.)])?\s*)(?:\*\*)?${ID}(?:\*\*)?\s*[:—–-]\s*`,
  'gim'
);

/** Whatever is left: a bare code anywhere in a sentence. */
const BARE = new RegExp(String.raw`\s*\b${ID}\b\s*[:—–]?`, 'gi');

const FENCE = /```[\s\S]*?```/g;

function scrub(text: string): string {
  return text
    .replace(FOOTER, '')
    .replace(LABELLED, '')
    .replace(PROMPT_ID, 'this prompt')
    .replace(PARENTHESIZED, '')
    .replace(LEADING, '$1')
    .replace(BARE, ' ')
    .replace(/(\S)[ \t]{2,}/g, '$1 ')
    .replace(/^([ \t]*(?:[-*+]|\d+[.)])?)[ \t]+/gm, (_, lead: string) => (lead ? `${lead} ` : ''))
    .replace(/[ \t]+([.,;:!?])/g, '$1')
    .replace(/[ \t]+$/gm, '')
    // A line that was nothing but the code is gone, not left as a lone ".".
    .replace(/^[ \t]*[.,;:—–-]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
}

/** Teacher-facing text with every library prompt id taken out. */
export function hidePromptIds(text: string): string {
  if (!/(?:FW-\d|sf-[a-z0-9])/i.test(text)) return text;
  // Fences are the app's own data (the `id:` header is how a starter finds
  // its assignment sheet); only the prose around them is scrubbed.
  let out = '';
  let last = 0;
  for (const match of text.matchAll(FENCE)) {
    const prose = text.slice(last, match.index);
    // Keep the spacing the prose had before the fence.
    out += scrub(prose) + (prose.match(/\s*$/)?.[0] ?? '') + match[0];
    last = match.index! + match[0].length;
  }
  if (last === 0) return scrub(text);
  return out + scrub(text.slice(last));
}
