/**
 * "Check before class" (Kevin's R11): what the accuracy checks found and
 * could not fix safely goes to the teacher as one short note in the reply,
 * just before its closing question, never in front of students.
 */
const FENCE = /^\s*(```|~~~)/;

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
