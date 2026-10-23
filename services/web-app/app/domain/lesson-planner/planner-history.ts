/**
 * What of the conversation the planner sees on each turn (Brian's run 5,
 * item 2).
 *
 * Each turn used to send the last 20 messages, cut at a character budget
 * from the newest back. A week's plan is long, so after two or three replies
 * the teacher's first message, where they laid out their structure, was no
 * longer there, and the planner went looking in saved lessons for what the
 * teacher had said in this very conversation.
 *
 * The teacher's words are the brief and they are short, so every one of them
 * is sent. The planner's own replies fill what budget is left from the
 * newest back; an older reply that does not fit is sent as its outline (its
 * title and step headings) instead of being dropped, so the planner still
 * knows what it planned. Nothing is removed, so turns still alternate.
 */

export type HistoryMessage = { role: string; content: string };

/** A teacher message this long is a pasted document; its start is the brief. */
const TEACHER_MESSAGE_CAP = 6_000;
const OUTLINE_CAP = 1_200;
const FENCE = /```[\s\S]*?```/g;

export function replyOutline(content: string): string {
  const lines = content
    .replace(FENCE, '')
    .split('\n')
    .filter((line) => /^\s{0,3}#{1,4}\s+\S/.test(line))
    .map((line) => line.trim());
  const outline = lines.join('\n').slice(0, OUTLINE_CAP);
  return `(An earlier reply of yours, shortened to its outline.)\n${outline || content.replace(FENCE, '').trim().slice(0, 300)}`;
}

export function plannerHistory(messages: HistoryMessage[], maxChars: number): HistoryMessage[] {
  const capped = messages.map((message) =>
    message.role === 'user' && message.content.length > TEACHER_MESSAGE_CAP
      ? { ...message, content: `${message.content.slice(0, TEACHER_MESSAGE_CAP)}…` }
      : message
  );
  const teacherChars = capped
    .filter((message) => message.role === 'user')
    .reduce((sum, message) => sum + message.content.length, 0);
  let budget = Math.max(0, maxChars - teacherChars);
  const keepWhole = new Set<number>();
  for (let index = capped.length - 1; index >= 0; index -= 1) {
    const message = capped[index]!;
    if (message.role === 'user') continue;
    if (message.content.length > budget) {
      // Everything older is shortened too: the newest replies matter most.
      budget = 0;
      continue;
    }
    keepWhole.add(index);
    budget -= message.content.length;
  }
  return capped.map((message, index) =>
    message.role === 'user' || keepWhole.has(index) ? message : { ...message, content: replyOutline(message.content) }
  );
}
