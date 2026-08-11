import { describe, expect, test } from 'bun:test';
import {
  PLANNING_PROGRESS_START,
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
    expect(
      planningProgressForTool('search_daily_pages_prompts', {}, 1).label
    ).toBe('Searching Daily Pages prompts');
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

    expect(progress.label).toBe('Looking things up in Yawp');
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
