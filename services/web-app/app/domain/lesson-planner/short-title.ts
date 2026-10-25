/**
 * A short, real title for a prompt-based step (Brian's run 3, item 11).
 *
 * "Daily Pages: O'Brien lists what every soldier carries — down to the ounc…"
 * was the prompt cut mid-word. A title is the prompt's first clause, ended at
 * a word, never an ellipsis.
 */
export const SHORT_TITLE_CHARS = 48;

export function shortTitle(text: string, max: number = SHORT_TITLE_CHARS): string {
  const firstLine = (text.split('\n').find((line) => line.trim()) ?? '')
    .replace(/^\s{0,3}>\s?/, '')
    .replace(/\*\*|__|`/g, '')
    .replace(/^["“]|["”]$/g, '')
    .trim();
  // The first clause, when it is long enough to say something.
  const clause = /^(.{12,}?)(?:\s+[—–-]\s+|[.;:!?](?:\s|$)|,\s)/.exec(firstLine)?.[1] ?? firstLine;
  if (clause.length <= max) return clause.replace(/[,;:]$/, '').trim();
  const words = clause.slice(0, max + 1).split(/\s+/);
  words.pop();
  return words.join(' ').replace(/[,;:—–-]$/, '').trim() || clause.slice(0, max);
}
