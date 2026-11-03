import { describe, expect, test } from 'bun:test';
import { closeHref, lessonPlaceHref, readLessonPlace, withLessonPlace } from './lesson-return';

describe("where Close goes (Brian's run 6, item 3)", () => {
  test('each place has its own page', () => {
    expect(lessonPlaceHref('plan-1', 'chat')).toBe('/app/lesson-planner?c=plan-1');
    expect(lessonPlaceHref('plan-1', 'stack')).toBe('/app/lesson-planner/plan-1/packet');
    expect(lessonPlaceHref('plan-1', 'show')).toBe('/show/plan-1');
  });

  test('a lesson id is kept safe in the link', () => {
    expect(lessonPlaceHref('a b', 'chat')).toBe('/app/lesson-planner?c=a%20b');
  });

  test('reads where it was opened from, with a fallback for old links', () => {
    expect(readLessonPlace('chat', 'stack')).toBe('chat');
    expect(readLessonPlace('stack', 'chat')).toBe('stack');
    expect(readLessonPlace('show', 'stack')).toBe('show');
    expect(readLessonPlace(null, 'stack')).toBe('stack');
    expect(readLessonPlace('elsewhere', 'chat')).toBe('chat');
  });

  test('an opener says where it is, keeping its own query', () => {
    expect(withLessonPlace('/present/plan-1/deck-1', 'chat')).toBe('/present/plan-1/deck-1?from=chat');
    expect(withLessonPlace('/app/lesson-planner/plan-1/deck/d?x=1', 'stack')).toBe(
      '/app/lesson-planner/plan-1/deck/d?x=1&from=stack'
    );
  });

  test('Close reads the page URL', () => {
    expect(closeHref('plan-1', 'https://yawp.school/present/plan-1/d?from=chat', 'stack')).toBe(
      '/app/lesson-planner?c=plan-1'
    );
    expect(closeHref('plan-1', '/present/plan-1/d', 'stack')).toBe('/app/lesson-planner/plan-1/packet');
    // The assignment page's older `back=stack` still counts.
    expect(closeHref('plan-1', '/app/assignment-types/t?back=stack', 'chat')).toBe(
      '/app/lesson-planner/plan-1/packet'
    );
  });
});
