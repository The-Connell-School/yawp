/**
 * A runaway blank (new-lesson batch, Nov 22): the planner wrote a blank to
 * fill in as an endless run of underscores ("\_\_\_…", thousands of them),
 * which printed as three pages of lines, and once ran the reply out of room
 * before its deck. Any run of more than thirty underscores, escaped or not,
 * becomes a blank of ten.
 */
const RUNAWAY = /(?:\\?_[ \t]*){31,}/g;

export function withoutRunawayBlanks(reply: string): string {
  return reply.replace(RUNAWAY, '__________');
}
