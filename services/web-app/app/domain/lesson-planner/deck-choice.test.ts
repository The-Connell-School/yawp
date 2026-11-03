import { describe, expect, test } from 'bun:test';
import { DECK_ASK, deckChoiceMessage, readDeckChoice } from './deck-choice';

describe('readDeckChoice: what the teacher said about their deck', () => {
  test('keeping it', () => {
    for (const said of [
      'keep it the same',
      'Keep it as is',
      'Keep my slide deck “Pre-Writing.pptx” as is.',
      'leave it alone please',
      'use my slides as they are',
      'no changes to the deck',
      'just use mine',
    ]) {
      expect({ said, choice: readDeckChoice(said) }).toEqual({ said, choice: 'teach' });
    }
  });

  test('reworking it', () => {
    for (const said of [
      'Rework it',
      'Rework my slide deck “Pre-Writing.pptx” for this lesson.',
      'make me a new deck from it',
      'redo the slides',
      'turn it into a Yawp! deck',
      'refresh it',
    ]) {
      expect({ said, choice: readDeckChoice(said) }).toEqual({ said, choice: 'refresh' });
    }
  });

  test('nothing said about the deck, or both at once, is no answer', () => {
    expect(readDeckChoice('Ninth grade, 48 minutes.')).toBeNull();
    expect(readDeckChoice('Keep the timing but rework the deck')).toBeNull();
    expect(readDeckChoice("Don't rework it")).toBe('teach');
  });
});

describe('the question and its answers', () => {
  test('the question as Brian wrote it, rework first', () => {
    expect(DECK_ASK.question).toBe(
      'Do you want me to rework this slide deck for this lesson (your original won’t be lost), or keep it as is?'
    );
    expect(DECK_ASK.options.map((option) => option.label)).toEqual(['Rework it', 'Keep it as is']);
    expect(DECK_ASK.options.map((option) => option.mode)).toEqual(['refresh', 'teach']);
  });

  test('a button sends a sentence the server reads back as the same choice', () => {
    for (const option of DECK_ASK.options) {
      const message = deckChoiceMessage(option.mode, 'Pre-Writing.pptx');
      expect(readDeckChoice(message)).toBe(option.mode);
    }
  });
});
