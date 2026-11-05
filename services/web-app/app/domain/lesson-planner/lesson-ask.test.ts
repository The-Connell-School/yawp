import { describe, expect, test } from 'bun:test';
import {
  ASK_FENCE,
  asksWorthShowing,
  composeAskReply,
  LESSON_ACTIVITIES,
  LESSON_MINUTES_MAX,
  LESSON_MINUTES_MIN,
  LESSON_MINUTES_STEP,
  PLANNER_PICKS_ACTIVITIES,
  readLessonAsks,
  type LessonAsk,
  composeIntakeReply,
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

describe('composeAskReply — one send carries the whole answer', () => {
  test('leads with what the teacher chose, then the length', () => {
    // The reported bug: answering the length threw away the chance to say what
    // the lesson should be about. One message now carries both.
    expect(
      composeAskReply({
        note: 'Build it around Evidence/Support',
        minutes: 50,
        activityIds: [],
      })
    ).toBe('Build it around Evidence/Support. 50 minutes.');
  });

  test('carries the choice, the length and the activities together', () => {
    expect(
      composeAskReply({
        note: 'Focus on integrating quotes',
        minutes: 45,
        activityIds: ['jigsaw'],
      })
    ).toBe('Focus on integrating quotes. 45 minutes. I want to use: Jigsaw.');
  });

  test('does not double up punctuation the chip already has', () => {
    expect(
      composeAskReply({
        note: 'Which class? English 10.',
        minutes: null,
        activityIds: [],
      })
    ).toBe('Which class? English 10.');
  });

  test('sends the chip on its own when nothing else was set', () => {
    expect(
      composeAskReply({ note: 'Go ahead', minutes: null, activityIds: [] })
    ).toBe('Go ahead.');
  });

  test('still works with no chip at all', () => {
    expect(composeAskReply({ minutes: 50, activityIds: [] })).toBe(
      '50 minutes.'
    );
  });
});

describe('asksWorthShowing — the clock waits for the subject', () => {
  const both: LessonAsk[] = [
    { kind: 'minutes', defaultMinutes: 50 },
    { kind: 'activities' },
  ];

  test('holds the length back while the topic is still open', () => {
    // Straight from a real turn: the teacher tapped "Look at my classes and
    // tell me what they need work on" and sent "…what they need work on.
    // 50 minutes." — a period length bolted onto a request to read the data.
    expect(asksWorthShowing(both, { topicSettled: false })).toEqual([
      { kind: 'activities' },
    ]);
  });

  test('asks for the length once the subject is settled', () => {
    expect(asksWorthShowing(both, { topicSettled: true })).toEqual(both);
  });

  test('does not ask how long after it has already timed every step', () => {
    // The slider turned up under a finished plan, below "5. The writing
    // (remaining time)". The length was decided several paragraphs earlier.
    expect(
      asksWorthShowing(both, { topicSettled: true, planAlreadyWritten: true })
    ).toEqual([{ kind: 'activities' }]);
  });

  test('leaves a turn that only wanted activities alone', () => {
    const activities: LessonAsk[] = [{ kind: 'activities' }];
    expect(asksWorthShowing(activities, { topicSettled: false })).toEqual(
      activities
    );
  });

  test('can empty the card entirely rather than ask too early', () => {
    expect(
      asksWorthShowing([{ kind: 'minutes', defaultMinutes: 50 }], {
        topicSettled: false,
      })
    ).toEqual([]);
  });
});

describe("intake v2 controls (Brian's review, A1–A3)", () => {
  test('reads a classes control', () => {
    const { asks } = readLessonAsks('Which class?\n\n```yawp-ask\nclasses\n```');
    expect(asks).toEqual([{ kind: 'classes' }]);
  });

  test('collects every choose line into one single-choice question, in order', () => {
    const { asks, body } = readLessonAsks(
      'How do you want to fill the time?\n\n```yawp-ask\nclasses\nminutes\n' +
        'choose: Read the whole first story together\n' +
        'choose: Just the opening pages, enough to hook them\n' +
        'choose: As much as we can, assign the rest for homework\n```'
    );
    expect(asks).toEqual([
      { kind: 'classes' },
      { kind: 'minutes', defaultMinutes: 50, hinted: false },
      {
        kind: 'choose',
        options: [
          'Read the whole first story together',
          'Just the opening pages, enough to hook them',
          'As much as we can, assign the rest for homework',
        ],
      },
    ]);
    expect(body).toBe('How do you want to fill the time?');
  });

  test('keeps colons inside a choose option', () => {
    const { asks } = readLessonAsks('```yawp-ask\nchoose: Two stops: one at Lavender, one at the end\n```');
    expect(asks).toEqual([
      { kind: 'choose', options: ['Two stops: one at Lavender, one at the end'] },
    ]);
  });

  test('says whether the model actually gave a length', () => {
    const { asks } = readLessonAsks('```yawp-ask\nminutes: 80\n```');
    expect(asks).toEqual([{ kind: 'minutes', defaultMinutes: 80, hinted: true }]);
  });

  test('holds the length and the reading plan back until the topic is settled, and after a plan', () => {
    const asks = [
      { kind: 'classes' as const },
      { kind: 'minutes' as const, defaultMinutes: 50, hinted: false },
      { kind: 'choose' as const, options: ['A', 'B'] },
    ];
    expect(asksWorthShowing(asks, { topicSettled: false }).map((a) => a.kind)).toEqual(['classes']);
    expect(
      asksWorthShowing(asks, { topicSettled: true, planAlreadyWritten: true }).map((a) => a.kind)
    ).toEqual([]);
    expect(asksWorthShowing(asks, { topicSettled: true }).map((a) => a.kind)).toEqual([
      'classes',
      'minutes',
      'choose',
    ]);
  });
});

describe('composeIntakeReply', () => {
  test('one class, its length, and how to fill the time', () => {
    expect(
      composeIntakeReply({
        classes: [{ title: 'English 11 · Period 3', minutes: 90 }],
        choice: 'Read the whole first story together',
        activityIds: [],
      })
    ).toBe('For English 11 · Period 3, 90 minutes. Read the whole first story together.');
  });

  test('several classes, each with its own length', () => {
    expect(
      composeIntakeReply({
        classes: [
          { title: 'English 11 · Period 3', minutes: 90 },
          { title: 'English 10 · Period 5', minutes: 50 },
        ],
        choice: null,
        activityIds: [],
      })
    ).toBe('For English 11 · Period 3, 90 minutes. For English 10 · Period 5, 50 minutes. The same lesson for both classes.');
  });

  test('a class typed by hand, with no length asked', () => {
    expect(
      composeIntakeReply({
        classes: [{ title: 'my 11th grade section', minutes: null }],
        choice: null,
        activityIds: ['planner-picks'],
      })
    ).toBe('For my 11th grade section. You pick the activities that fit this lesson best.');
  });

  test('nothing chosen is an empty message, so Send stays off', () => {
    expect(composeIntakeReply({ classes: [], choice: null, activityIds: [] })).toBe('');
  });
});

describe("two classes: the same lesson, said once (Brian's run 4)", () => {
  const classes = [
    { title: 'English 10 · Period 3', minutes: 50 },
    { title: 'English 11 · Period 5', minutes: 50 },
  ];
  test('the same lesson for both classes is the default', () => {
    expect(composeIntakeReply({ classes, choice: null, activityIds: [] })).toBe(
      'For English 10 · Period 3, 50 minutes. For English 11 · Period 5, 50 minutes. The same lesson for both classes.'
    );
  });
  test('or a version for each', () => {
    expect(composeIntakeReply({ classes, choice: null, activityIds: [], sameLesson: false })).toContain('A version of the lesson for each class.');
  });
  test('one class says nothing about it', () => {
    expect(composeIntakeReply({ classes: classes.slice(0, 1), choice: null, activityIds: [] })).toBe('For English 10 · Period 3, 50 minutes.');
  });
});

describe('a unit asks about each class period (Kevin, Oct 25, note 1)', () => {
  test('knows a unit or several days from the request', async () => {
    const { plansSeveralDays } = await import('./lesson-ask');
    for (const text of ['Create a unit on Julius Caesar', 'Plan my week for English 10', 'I need five days on Gatsby', '8 class periods on the essay', 'a multi-day lesson']) {
      expect(plansSeveralDays(text)).toBe(true);
    }
    for (const text of ['A lesson on memetic desire', 'Day 1 of the novel', 'one class on commas', null]) {
      expect(plansSeveralDays(text)).toBe(false);
    }
  });

  test('and says the minutes are each period', async () => {
    const { composeIntakeReply } = await import('./lesson-ask');
    expect(composeIntakeReply({ classes: [{ title: 'English 10', minutes: 60 }], choice: null, activityIds: [], severalDays: true })).toContain(
      'For English 10, 60 minutes each class period.'
    );
  });
});
