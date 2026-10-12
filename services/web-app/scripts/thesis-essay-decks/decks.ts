/** Every deck in the course, in lesson order, with its output file name. */
import type { HybridDeck } from './deck-types';
import { PREWRITING_DECK } from './prewriting-deck';
import { BODY_DECK } from './body-deck';
import { CONCLUSION_DECK } from './conclusion-deck';
import { INTRODUCTION_DECK } from './introduction-deck';
import { THESIS_DECK } from './thesis-deck';
import { TITLES_DECK } from './titles-deck';

export const DECKS: { file: string; deck: HybridDeck }[] = [
  { file: 'lesson-2-pre-writing', deck: PREWRITING_DECK },
  { file: 'lesson-3-thesis-statement', deck: THESIS_DECK },
  { file: 'lesson-4-introduction', deck: INTRODUCTION_DECK },
  { file: 'lesson-5-body-paragraphs', deck: BODY_DECK },
  { file: 'lesson-6-conclusion', deck: CONCLUSION_DECK },
  { file: 'lesson-7-titles', deck: TITLES_DECK },
];
