/**
 * A runaway blank (new-lesson batch, Nov 22): the planner wrote a blank to
 * fill in as an endless run of underscores ("\_\_\_…", thousands of them),
 * which printed as three pages of lines, and once ran the reply out of room
 * before its deck. Any run of more than thirty underscores, escaped or not,
 * becomes a blank of ten.
 */
const RUNAWAY = /(?:\\?_[ \t]*){31,}/g;
/**
 * The same with "&nbsp;" (rules test, Nov 23: "Heroic reason: &nbsp;&nbsp;…",
 * 6,911 of them, ran the Odyssey reply out of room before its deck). The
 * planner's line of room is one "&nbsp;" alone on its line; three or more in
 * a row are a blank to fill in, and more than eight empty lines in a row are
 * eight.
 */
const NBSP_RUN = /(?:(?:&nbsp;|\u00a0)[ \t]*){3,}/g;
const ROOM_LINES = /(?:^[ \t]*(?:&nbsp;|\u00a0)[ \t]*\n){9,}/gm;

export function withoutRunawayBlanks(reply: string): string {
  return reply
    .replace(RUNAWAY, '__________')
    .replace(NBSP_RUN, (run, offset: number, whole: string) => {
      // A line that is only room to write stays one "&nbsp;"; inside a sentence it is a blank.
      const lineStart = whole.lastIndexOf('\n', offset - 1) + 1;
      const lineEnd = whole.indexOf('\n', offset + run.length);
      const rest = whole.slice(lineStart, lineEnd < 0 ? whole.length : lineEnd).replace(run, '').trim();
      return rest ? '__________ ' : '&nbsp;';
    })
    .replace(ROOM_LINES, '&nbsp;\n'.repeat(8));
}
