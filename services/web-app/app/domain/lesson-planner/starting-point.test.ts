import { describe, expect, test } from 'bun:test';
import {
  LEGACY_STARTER_PROMPTS,
  pinsDataOpening,
  singlePieceOf,
  startingPointOf,
} from './starting-point';

const prompts = [
  { id: 'plan-a-lesson', prompt: 'Help me plan a lesson.' },
  { id: 'exit-ticket', prompt: 'Make me an exit ticket. Ask what it teaches.' },
  { id: 'handout', prompt: 'Make me a handout.' },
];

describe('startingPointOf', () => {
  test('names the tile the conversation was opened from', () => {
    expect(
      startingPointOf('Make me an exit ticket. Ask what it teaches.', prompts)
    ).toBe('exit-ticket');
  });

  test('tolerates whitespace around the tile text', () => {
    expect(startingPointOf('  Make me a handout.\n', prompts)).toBe('handout');
  });

  test('a message the teacher typed themselves is no tile at all', () => {
    // Typing "make me an exit ticket on commas" is a teacher who already said
    // what the lesson is. Treating it as the bare tile would ask them again.
    expect(
      startingPointOf('Make me an exit ticket on comma splices', prompts)
    ).toBeNull();
    expect(startingPointOf('', prompts)).toBeNull();
    expect(startingPointOf(null, prompts)).toBeNull();
  });

  test('still recognises conversations opened from an older wording', () => {
    // The exit ticket tile used to ask what the lesson "taught". Lessons
    // started from that wording are still in teachers' histories.
    for (const [id, text] of Object.entries(LEGACY_STARTER_PROMPTS)) {
      expect(startingPointOf(text, prompts)).toBe(id);
    }
  });
});

describe('pinsDataOpening', () => {
  test('keeps the data-driven option where the subject is still open', () => {
    expect(pinsDataOpening(null)).toBe(true);
    expect(pinsDataOpening('plan-a-lesson')).toBe(true);
    expect(pinsDataOpening('plan-a-skill')).toBe(true);
  });

  test('drops it where the teacher came for something else', () => {
    // A teacher who tapped "Make me an exit ticket" did not ask what their
    // class needs work on, and the first option should not pretend they did.
    for (const id of [
      'exit-ticket',
      'handout',
      'extra-practice',
      'slide-deck',
      'plan-a-standard',
      'unit-plan',
      'ground-in-class-data',
    ]) {
      expect(pinsDataOpening(id)).toBe(false);
    }
  });
});

describe('singlePieceOf', () => {
  test('names the one piece a single-piece tile asks for', () => {
    expect(singlePieceOf('exit-ticket')).toBe('exit-ticket');
    expect(singlePieceOf('handout')).toBe('handout');
    expect(singlePieceOf('extra-practice')).toBe('extra-practice');
    expect(singlePieceOf('slide-deck')).toBe('slide-deck');
  });

  test('a lesson is not a single piece', () => {
    expect(singlePieceOf('plan-a-lesson')).toBeNull();
    expect(singlePieceOf(null)).toBeNull();
  });
});
