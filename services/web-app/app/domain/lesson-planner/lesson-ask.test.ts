import { describe, expect, test } from 'bun:test';
import {
  ASK_FENCE,
  composeAskReply,
  LESSON_ACTIVITIES,
  LESSON_MINUTES_MAX,
  LESSON_MINUTES_MIN,
  LESSON_MINUTES_STEP,
  PLANNER_PICKS_ACTIVITIES,
  readLessonAsks,
} from './lesson-ask';

function fenced(body: string): string {
  return `\`\`\`${ASK_FENCE}\n${body}\n\`\`\``;
}

describe('readLessonAsks', () => {
  test('reads a request for the two controls out of a reply', () => {
    const reply = `Which class is this for?\n\n${fenced('minutes\nactivities')}`;
    const { asks, body } = readLessonAsks(reply);

    expect(asks.map((ask) => ask.kind)).toEqual(['minutes', 'activities']);
    expect(body).toBe('Which class is this for?');
    // The block is machinery; it never reaches the teacher as text.
    expect(body).not.toContain(ASK_FENCE);
    expect(body).not.toContain('activities');
  });

  test('starts the slider where the planner suggests', () => {
    const { asks } = readLessonAsks(fenced('minutes: 80'));
    expect(asks[0]).toMatchObject({ kind: 'minutes', defaultMinutes: 80 });
  });

  test('starts at a common period length when no guess is given', () => {
    const { asks } = readLessonAsks(fenced('minutes'));
    expect(asks[0]).toMatchObject({ kind: 'minutes', defaultMinutes: 50 });
  });

  test('pulls an out-of-range guess back onto the spectrum', () => {
    expect(readLessonAsks(fenced('minutes: 240')).asks[0]).toMatchObject({
      defaultMinutes: LESSON_MINUTES_MAX,
    });
    expect(readLessonAsks(fenced('minutes: 1')).asks[0]).toMatchObject({
      defaultMinutes: LESSON_MINUTES_MIN,
    });
  });

  test('snaps a guess to a step a teacher would actually say', () => {
    expect(readLessonAsks(fenced('minutes: 47')).asks[0]).toMatchObject({
      defaultMinutes: 45,
    });
  });

  test('ignores a control it does not know rather than breaking the turn', () => {
    const { asks } = readLessonAsks(fenced('minutes\nastrology'));
    expect(asks.map((ask) => ask.kind)).toEqual(['minutes']);
  });

  test('never shows the same control twice', () => {
    const { asks } = readLessonAsks(fenced('minutes\nminutes: 30'));
    expect(asks).toHaveLength(1);
  });

  test('leaves a reply with no block alone', () => {
    const reply = 'Just a question.\n\n```\ncode\n```';
    const { asks, body } = readLessonAsks(reply);
    expect(asks).toEqual([]);
    expect(body).toBe(reply);
  });
});

describe('LESSON_ACTIVITIES', () => {
  test('covers the shapes a lesson actually takes', () => {
    const ids = LESSON_ACTIVITIES.map((activity) => activity.id);
    for (const expected of [
      'worksheet',
      'group-work',
      'gallery-walk',
      'jigsaw',
    ]) {
      expect(ids).toContain(expected);
    }
  });

  test('gives every activity a stable id and a name a teacher would use', () => {
    const ids = new Set<string>();
    for (const activity of LESSON_ACTIVITIES) {
      expect(activity.id).toMatch(/^[a-z0-9-]+$/);
      expect(activity.label.length).toBeGreaterThan(0);
      ids.add(activity.id);
    }
    expect(ids.size).toBe(LESSON_ACTIVITIES.length);
  });

  test('does not put the hand-it-back option in the list itself', () => {
    // It is always offered, and it is not an activity — it is the absence of a
    // choice, so it lives apart and renders apart.
    expect(LESSON_ACTIVITIES.map((activity) => activity.id)).not.toContain(
      PLANNER_PICKS_ACTIVITIES
    );
  });
});

describe('composeAskReply', () => {
  test('reads as something the teacher typed', () => {
    expect(
      composeAskReply({ minutes: 50, activityIds: ['jigsaw', 'gallery-walk'] })
    ).toBe('50 minutes. I want to use: Jigsaw, Gallery walk.');
  });

  test('sends just the length when that is all that was asked', () => {
    expect(composeAskReply({ minutes: 25, activityIds: [] })).toBe(
      '25 minutes.'
    );
  });

  test('hands the choice back when the teacher would rather not pick', () => {
    expect(
      composeAskReply({
        minutes: 50,
        activityIds: [PLANNER_PICKS_ACTIVITIES],
      })
    ).toBe('50 minutes. You pick the activities that fit this lesson best.');
  });

  test('lets the hand-back win when it is checked alongside others', () => {
    // Checking both is contradictory; deferring is the clearer reading.
    expect(
      composeAskReply({
        minutes: null,
        activityIds: ['jigsaw', PLANNER_PICKS_ACTIVITIES],
      })
    ).toBe('You pick the activities that fit this lesson best.');
  });

  test('sends just the activities when no length was asked for', () => {
    expect(composeAskReply({ minutes: null, activityIds: ['worksheet'] })).toBe(
      'I want to use: Worksheet or practice set.'
    );
  });

  test('is empty when there is nothing to say', () => {
    expect(composeAskReply({ minutes: null, activityIds: [] })).toBe('');
  });

  test('ignores an activity id that is not real', () => {
    expect(composeAskReply({ minutes: null, activityIds: ['astrology'] })).toBe(
      ''
    );
  });
});

describe('the spectrum itself', () => {
  test('runs from a bell-ringer to a double block', () => {
    expect(LESSON_MINUTES_MIN).toBe(5);
    expect(LESSON_MINUTES_MAX).toBe(90);
    // Teachers say 45 and 50, never 47.
    expect(LESSON_MINUTES_STEP).toBe(5);
  });
});
