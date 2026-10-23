import { describe, expect, test } from 'bun:test';
import { readLessonLength } from './lesson-length';

describe("readLessonLength (Brian's run 2, B1)", () => {
  test('the intake v2 answer: class and length', () => {
    expect(readLessonLength('For English 11 · Period 5, 50 minutes. Plan the whole period.')).toEqual({
      minutes: 50,
      classLabel: 'English 11 · Period 5',
    });
  });

  test('several classes: the first one sets the lesson', () => {
    expect(
      readLessonLength('For English 11 · Period 3, 90 minutes. For English 10 · Period 5, 50 minutes.')
    ).toEqual({ minutes: 90, classLabel: 'English 11 · Period 3' });
  });

  test('the original slider answer', () => {
    expect(readLessonLength('Introduce the book. 50 minutes. I want to use: Read aloud.')).toEqual({
      minutes: 50,
      classLabel: null,
    });
  });

  test('a teacher who types it', () => {
    expect(readLessonLength('It is a 45-minute period with my juniors')).toEqual({
      minutes: 45,
      classLabel: null,
    });
    expect(readLessonLength('we have 80 minute blocks')).toEqual({ minutes: 80, classLabel: null });
  });

  test('nothing when the message is not about the period', () => {
    expect(readLessonLength('Write for 4 minutes about what you carry.')).toBeNull();
    expect(readLessonLength('Plan Day 1 of The Things They Carried.')).toBeNull();
    expect(readLessonLength('For English 11, 2 minutes.')).toBeNull();
  });
});
