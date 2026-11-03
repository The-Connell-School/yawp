/**
 * Where the planner chat lands (Kevin, Oct 22). While a teacher waits, the
 * bottom: their question and the progress bar. Once a reply is in, or a
 * saved lesson opens, the top of the last reply, so a long lesson plan reads
 * down from its first line instead of opening at its last.
 */

/** Room above the reply, so its first line is not flush against the edge. */
const REPLY_MARGIN = 16;

export function transcriptScrollTarget(
  messages: Array<{ role: string }>,
  sending: boolean
): 'bottom' | 'reply-top' | null {
  if (!messages.length) return null;
  if (sending || messages[messages.length - 1]!.role !== 'assistant') return 'bottom';
  return 'reply-top';
}

/** The scroll position that puts a reply's top just below the transcript's. */
export function replyTopScroll({
  containerTop,
  scrollTop,
  replyTop,
}: {
  /** The transcript's top on screen. */
  containerTop: number;
  scrollTop: number;
  /** The reply's top on screen. */
  replyTop: number;
}): number {
  return Math.max(0, replyTop - containerTop + scrollTop - REPLY_MARGIN);
}
