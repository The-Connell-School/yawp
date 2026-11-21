import { describe, expect, test } from 'bun:test';
import {
  PLANNING_PROGRESS_START,
  planningProgressClock,
  planningProgressForTool,
  planningProgressWriting,
  type PlanningProgress,
} from './planning-progress';

describe('planningProgressForTool', () => {
  test('says what it is doing in the teacher’s words', () => {
    expect(planningProgressForTool('list_classes', {}, 1).label).toBe(
      'Looking at your classes'
    );
    expect(
      planningProgressForTool('get_class_grade_report', {}, 1).label
    ).toBe('Reading how the class scored');
    // The two corpora are named for the exercise each one feeds, because a
    // teacher watching the bar should be able to tell which they are getting.
    expect(
      planningProgressForTool('search_daily_pages_prompts', {}, 1).label
    ).toBe('Searching Class Starter prompts');
    expect(
      planningProgressForTool('search_short_form_prompts', {}, 1).label
    ).toBe('Searching Short Response prompts');
    expect(
      planningProgressForTool('list_lounge_materials', {}, 1).label
    ).toBe("Looking through the Teacher's Lounge");
  });

  /**
   * A tool the allowlist gains later must not surface its function name to a
   * teacher. Something honest and general is the right failure.
   */
  test('falls back to something a teacher can read', () => {
    const progress = planningProgressForTool('some_new_tool', {}, 1);

    expect(progress.label).toBe('Looking things up in Yawp!');
    expect(progress.fraction).toBeGreaterThan(0);
  });

  test('never leaks the arguments it was called with', () => {
    const progress = planningProgressForTool(
      'get_class_grade_report',
      { classId: 'cls_secret', teacherNote: 'third period is a nightmare' },
      1
    );

    expect(progress.label).not.toContain('cls_secret');
    expect(progress.label).not.toContain('nightmare');
  });
});

describe('the fraction the bar is drawn from', () => {
  const fractionOf = (progress: PlanningProgress) => progress.fraction;

  test('starts above nothing, so the bar is visibly alive', () => {
    expect(fractionOf(PLANNING_PROGRESS_START)).toBeGreaterThan(0);
    expect(fractionOf(PLANNING_PROGRESS_START)).toBeLessThan(0.2);
  });

  test('advances with each round of looking things up', () => {
    const first = fractionOf(planningProgressForTool('list_classes', {}, 1));
    const third = fractionOf(planningProgressForTool('list_classes', {}, 3));
    const sixth = fractionOf(planningProgressForTool('list_classes', {}, 6));

    expect(third).toBeGreaterThan(first);
    expect(sixth).toBeGreaterThan(third);
  });

  test('only ever moves forward', () => {
    let last = fractionOf(PLANNING_PROGRESS_START);
    for (let round = 1; round <= 12; round += 1) {
      const next = fractionOf(planningProgressForTool('list_classes', {}, round));
      expect(next).toBeGreaterThanOrEqual(last);
      last = next;
    }
    expect(fractionOf(planningProgressWriting())).toBeGreaterThanOrEqual(last);
  });

  /**
   * The honesty rule. The bar is drawn from real milestones, and the work is
   * not done until the reply is in hand — so nothing before the end is allowed
   * to look finished, however many tool rounds the model burns.
   */
  test('never reaches the end before the lesson does', () => {
    for (let round = 1; round <= 40; round += 1) {
      expect(
        fractionOf(planningProgressForTool('list_classes', {}, round))
      ).toBeLessThan(1);
    }
    expect(fractionOf(planningProgressWriting())).toBeLessThan(1);
  });

  test('writing the lesson is the last thing it says', () => {
    const writing = planningProgressWriting();

    expect(writing.label).toBe('Writing the lesson');
    expect(writing.fraction).toBeGreaterThan(
      fractionOf(planningProgressForTool('list_classes',
      {}, 1))
    );
  });
});

describe('planningProgressClock: what is said when, through a turn (bot test, Nov 19)', () => {
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const record = () => {
    const said: PlanningProgress[] = [];
    return { said, labels: () => said.map((progress) => progress.label), report: (progress: PlanningProgress) => said.push(progress) };
  };

  test('"Writing the lesson" is said soon after the last lookup, while the model is still writing', async () => {
    const { labels, report } = record();
    const clock = planningProgressClock(report, { afterMs: 20 });
    clock.lookup('list_lounge_materials', {}, 1);
    clock.lookedUp();
    expect(labels()).toEqual(["Looking through the Teacher's Lounge"]);
    await wait(60);
    // Nothing has finished: the reply is not in hand yet.
    expect(labels()).toEqual(["Looking through the Teacher's Lounge", 'Writing the lesson']);
    clock.writing();
    // The same line is not said twice.
    expect(labels()).toHaveLength(2);
    clock.stop();
  });

  test('with no lookup at all, it is said a moment after the turn starts', async () => {
    const { labels, report } = record();
    const clock = planningProgressClock(report, { afterMs: 20 });
    expect(labels()).toEqual([]);
    await wait(60);
    expect(labels()).toEqual(['Writing the lesson']);
    clock.stop();
  });

  test('lookups close together keep the line on the lookups, and a late one takes it back', async () => {
    const { labels, report } = record();
    const clock = planningProgressClock(report, { afterMs: 40 });
    clock.lookup('search_daily_pages_prompts', {}, 1);
    clock.lookedUp();
    await wait(10);
    clock.lookup('list_lounge_materials', {}, 2);
    clock.lookedUp();
    expect(labels()).toEqual(['Searching Class Starter prompts', "Looking through the Teacher's Lounge"]);
    await wait(80);
    clock.lookup('read_lounge_material', {}, 3);
    expect(labels().slice(-2)).toEqual(['Writing the lesson', 'Reading a Lounge deck']);
    clock.stop();
  });

  test('the bar never moves backwards, and a second pass on the deck has its own line', async () => {
    const { said, labels, report } = record();
    const clock = planningProgressClock(report, { afterMs: 10 });
    await wait(40);
    clock.lookup('list_classes', {}, 1);
    clock.writing();
    clock.checkingDeck();
    expect(labels()).toEqual(['Writing the lesson', 'Looking at your classes', 'Writing the lesson', 'Checking the slides']);
    for (let i = 1; i < said.length; i += 1) expect(said[i]!.fraction).toBeGreaterThanOrEqual(said[i - 1]!.fraction);
    expect(said.at(-1)!.fraction).toBeLessThan(1);
  });

  test('stopped, it says nothing more', async () => {
    const { labels, report } = record();
    const clock = planningProgressClock(report, { afterMs: 10 });
    clock.stop();
    await wait(40);
    expect(labels()).toEqual([]);
  });
});
