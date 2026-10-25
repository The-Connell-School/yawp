/**
 * The line Ask the planner shows for a reply on the stack page. The card
 * under it carries the piece; this is the one sentence above it.
 */
import { hasSlideDeck } from './slide-deck';

/**
 * After Build or Rebuild the slide deck (Brian's round 4, item 6). The
 * model's own line talked about where decks live ("…rather than the
 * Lounge"), which a teacher on the stack has no reason to hear.
 */
export const STACK_DECK_REPLY = "Here you go: new slides based on your revised stack. Everything's updated and ready to go!";

export function stackReplyLine(content: string): string {
  if (hasSlideDeck(content)) return STACK_DECK_REPLY;
  // The first line of prose, outside any fenced block.
  const prose = content.replace(/```[\s\S]*?(?:```|$)/g, '');
  return prose.split('\n').find((line) => line.trim())?.trim() ?? '';
}
