/**
 * The passage above its questions (Nov 22 review). Pure and dependency-free,
 * so the packet page can use it in the browser as well as the PDFs.
 */
/** A run of `>` lines: a passage students read, when it is two lines or a long one. */
function isPassage(block: string): boolean {
  const lines = block.split('\n');
  return lines.every((line) => /^\s{0,3}>/.test(line)) && (lines.length >= 2 || block.length >= 120);
}

/** "— William Shakespeare, *Macbeth*": the line naming where a passage is from. */
function isSourceLine(block: string | undefined): boolean {
  return Boolean(block && !block.includes('\n') && /^\s*(?:[—–]|-{1,2}\s)/.test(block));
}

/**
 * A block of questions: numbered or bulleted items. A lone question before a
 * passage ("Before you read: what do you expect?") is a lead-in and stays.
 */
function isQuestion(block: string): boolean {
  return block.split('\n').some((line) => /^\s{0,3}(?:\d{1,2}[.)]|[-*+]|\*\*\d{1,2}[.)]\*\*|\*\*\d{1,2}[.)])\s/.test(line));
}

/**
 * The passage above its questions (Nov 22 review): a handout that asks about
 * a passage before printing it has the passage moved up, with the line that
 * names its source, to just before the first question (and the heading over
 * it). A handout already in that order, or with no passage, is untouched.
 */
export function passageFirst(markdown: string): string {
  const blocks = markdown.split(/\n[ \t]*\n/);
  const passage = blocks.findIndex(isPassage);
  if (passage < 0) return markdown;
  let question = blocks.slice(0, passage).findIndex(isQuestion);
  if (question < 0) return markdown;
  // A heading over the questions stays over them; the page's own title, the
  // first block, stays first.
  while (question > 1 && /^\s{0,3}#{1,6}\s/.test(blocks[question - 1]!)) question -= 1;
  const moving = isSourceLine(blocks[passage + 1]) ? blocks.slice(passage, passage + 2) : [blocks[passage]!];
  const rest = blocks.filter((_, index) => index < passage || index >= passage + moving.length);
  return [...rest.slice(0, question), ...moving, ...rest.slice(question)].join('\n\n');
}
