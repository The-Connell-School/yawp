/**
 * How a full lesson opens (Brian's run 3, item 3).
 *
 * "I have everything I need. Here's the plan." told the teacher nothing. The
 * app says what to do with a full lesson, in its own words, every time, and
 * drops the model's throat-clearing above the plan.
 */
export const FULL_LESSON_FRAMING =
  "Here's a full lesson. You don't have to use all of it. Give it a quick read first, then add the pieces you want to your stack, or take the whole thing.";

const PREAMBLE =
  /^\s*(?:i (?:have|['’]ve got) everything i need|here['’]?s (?:the|your) (?:plan|lesson)|got it|perfect|great|okay|ok|alright|sounds good)\b[^\n]*$/i;

/** The reply without the lines of preamble before its first heading. */
export function stripPlanPreamble(text: string): string {
  const lines = text.split('\n');
  let index = 0;
  while (index < lines.length) {
    const line = lines[index]!;
    if (!line.trim()) {
      index += 1;
      continue;
    }
    if (/^\s{0,3}#/.test(line) || !PREAMBLE.test(line)) break;
    index += 1;
  }
  return index ? lines.slice(index).join('\n').replace(/^\n+/, '') : text;
}
