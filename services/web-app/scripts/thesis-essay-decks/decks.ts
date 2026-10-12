/** Every deck in the course, in lesson order, with its output file name. */
import type { HybridDeck } from './deck-types';
import { PREWRITING_DECK } from './prewriting-deck';
import { THESIS_DECK } from './thesis-deck';

export const DECKS: { file: string; deck: HybridDeck }[] = [
  { file: 'lesson-2-pre-writing', deck: PREWRITING_DECK },
  { file: 'lesson-3-thesis-statement', deck: THESIS_DECK },
];
