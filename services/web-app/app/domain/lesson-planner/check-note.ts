/**
 * "Check before class" (Kevin's R11): what the accuracy checks found and
 * could not fix safely goes to the teacher as one short note in the reply,
 * just before its closing question, never in front of students.
 */
const FENCE = /^\s*(```|~~~)/;

/**
 * Words quoted from the lesson as a teacher reads them: a fact the checker
 * found inside a slide comes as the deck's JSON (`"date": "Sep 1692",
 * "title": "19 hanged"`), shown as its values ("Sep 1692 · 19 hanged").
 */
export function checkNoteWords(words: string): string {
  if (!/"\s*:\s*"/.test(words)) return words.replace(/\s+/g, ' ').trim();
  const values = [...words.matchAll(/"[\w-]+"\s*:\s*"((?:[^"\\]|\\.)*)"?/g)].map((m) => m[1]!.replace(/\\"/g, '"'));
  return values.length ? values.join(' · ') : words.replace(/[{}"[\],]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function withCheckNote(reply: string, items: string[]): string {
  const list = [
    ...new Set(items.map((item) => item.trim()).filter(Boolean)),
  ].slice(0, 5);
  if (!list.length || reply.includes('**Check before class:**')) return reply;
  const note = [
    '**Check before class:**',
    ...list.map((item) => `- ${item}`),
  ].join('\n');
  const lines = reply.split('\n');
  let inFence = false;
  let lastText = -1;
  lines.forEach((line, index) => {
    if (FENCE.test(line)) {
      inFence = !inFence;
      return;
    }
    if (!inFence && line.trim()) lastText = index;
  });
  // Before the closing question, when the reply ends on one; otherwise at the end.
  if (lastText >= 0 && lines[lastText]!.trim().endsWith('?')) {
    return [
      ...lines.slice(0, lastText),
      note,
      '',
      ...lines.slice(lastText),
    ].join('\n');
  }
  return `${reply.trimEnd()}\n\n${note}\n`;
}

const letters = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Whether a fact the second model flagged is about a quotation the quotation
 * check already settled against the work's own text (found, corrected, or
 * found in another chapter). The text is the authority there: on the preview
 * the model put Gatsby's "one of the few honest people" in chapter 1 right
 * beside the check's (true) "is in Chapter 3" (re-test, Nov 22).
 */
export function aboutSettledQuotation(fact: { wrong: string; why: string }, quotations: string[]): boolean {
  const said = letters(`${fact.wrong} ${fact.why}`);
  return quotations
    .map(letters)
    .filter((quote) => quote.length >= 16)
    .some((quote) => said.includes(quote.slice(0, 40)) || quote.includes(letters(fact.wrong).slice(0, 40)));
}
