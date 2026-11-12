/**
 * The planner tags each step heading with `{type: …}` or `[type: …]` so the app
 * can read step kinds. Teachers never see those tags in the chat or in Print.
 * Tags stay in stored message.content for parsing (same idea as hidePromptIds).
 */
import { hidePromptIds } from './prompt-ids';

const TYPE_TAG = /\{\s*type\s*:\s*[a-z _-]{2,24}\s*\}/gi;
const BRACKET_TYPE_TAG = /\[\s*type\s*:\s*[a-z _-]{2,24}\s*\]/gi;
const FENCE = /```[\s\S]*?```/g;

function hasTag(text: string): boolean {
  return /\{\s*type\s*:/i.test(text) || /\[\s*type\s*:/i.test(text);
}

function stripTagsFromLine(line: string): string | null {
  let next = line.replace(TYPE_TAG, ' ').replace(BRACKET_TYPE_TAG, ' ');
  next = next.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+$/g, '').replace(/[ \t]+(\*\*\s*)$/g, '$1');
  const bare = next.replace(/\*\*/g, '').trim();
  if (!bare) return null;
  if (/^\s{0,3}#{2,6}\s*$/.test(bare)) return null;
  if (/^\s{0,3}\*\*\s*\*\*\s*$/.test(next)) return null;
  return next;
}

function scrub(text: string): string {
  return text
    .split('\n')
    .flatMap((line) => {
      if (!hasTag(line)) return [line];
      const stripped = stripTagsFromLine(line);
      return stripped === null ? [] : [stripped];
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
}

/** Chat and print copy of a planner reply — prompt ids and step tags hidden. */
export function teacherFacingMarkdown(text: string): string {
  return hideStepTypeTags(hidePromptIds(text));
}

/** Teacher-facing text with planner step-type tags removed; minutes stay visible. */
export function hideStepTypeTags(text: string): string {
  if (!hasTag(text)) return text;
  let out = '';
  let last = 0;
  for (const match of text.matchAll(FENCE)) {
    const prose = text.slice(last, match.index);
    out += scrub(prose) + (prose.match(/\s*$/)?.[0] ?? '') + match[0];
    last = match.index! + match[0].length;
  }
  if (last === 0) return scrub(text);
  return out + scrub(text.slice(last));
}
