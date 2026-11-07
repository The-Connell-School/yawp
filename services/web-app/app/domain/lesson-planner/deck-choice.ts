/**
 * The question a teacher answers about a deck they uploaded (Brian, Nov 3):
 * rework it into a new Yawp! deck, or keep it as is. Asked in the
 * conversation under the planner's reply, with buttons; answered by a button
 * or in their own words, which the server reads here before the planner does.
 */
import type { DeckMode } from './lesson-uploads';

export const DECK_ASK = {
  question: 'Do you want me to rework this slide deck for this lesson (your original won’t be lost), or keep it as is?',
  // Rework first: it is the one Yawp! wants to encourage.
  options: [
    { mode: 'refresh', label: 'Rework it' },
    { mode: 'teach', label: 'Keep it as is' },
  ] as Array<{ mode: DeckMode; label: string }>,
} as const;

/** What a button sends, in the teacher's voice. */
export function deckChoiceMessage(mode: DeckMode, name: string): string {
  return mode === 'refresh'
    ? `Rework my slide deck “${name}” for this lesson.`
    : `Keep my slide deck “${name}” as is.`;
}

const NOT_REWORK = /\b(?:don'?t|do not|no need to|without)\s+(?:rework|redo|rebuild|remake|change|refresh)\w*/i;
const KEEP =
  /\b(?:keep|kept)\b|\bas[- ]is\b|\bas they are\b|\bthe same\b|\bunchanged\b|\bleave (?:it|them)\b|\bno changes\b|\buse (?:it|mine|my (?:own )?(?:deck|slides))\b|\bjust use\b/i;
const REWORK =
  /\b(?:rework|re-work|redo|re-do|rebuild|remake|refresh|revamp)\w*|\bnew (?:yawp!? )?(?:slide )?deck\b|\bmake (?:me )?a new\b|\bturn (?:it|them) into\b|\bupdate (?:it|them|the (?:deck|slides))\b/i;

/** The teacher's choice in their own words, or null when it is not one. */
export function readDeckChoice(message: string): DeckMode | null {
  if (NOT_REWORK.test(message)) return 'teach';
  const keep = KEEP.test(message);
  const rework = REWORK.test(message);
  if (keep === rework) return null;
  return keep ? 'teach' : 'refresh';
}
