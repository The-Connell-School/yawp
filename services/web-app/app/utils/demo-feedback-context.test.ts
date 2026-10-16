import { describe, expect, test } from 'bun:test';
import {
  createFeedbackContext,
  feedbackPath,
  captureSavedFeedback,
} from './demo-feedback-context';

describe('demo feedback action context', () => {
  test('keeps the latest five actions in order, copies snapshots and strips URL parameters', () => {
    const context = createFeedbackContext();
    for (let i = 0; i < 7; i++)
      context.route(`/app/classes/${i}?token=secret#password`);
    expect(context.snapshot()).toEqual(
      [2, 3, 4, 5, 6].map((i) => ({ type: 'route', path: `/app/classes/${i}` }))
    );
    context.snapshot().pop();
    expect(context.snapshot()).toHaveLength(5);
    context.click('button', '/app?password=secret');
    context.capture('teacher_private_custom_event_secret', '/app');
    expect(context.snapshot().slice(-2)).toEqual([
      { type: 'click', path: '/app', target: 'button' },
      { type: 'capture', path: '/app', event: 'custom_event' },
    ]);
  });
  test('never retains external, auth, malformed or protocol-relative locations', () => {
    for (const path of [
      '/auth/login?password=secret',
      'https://demo.yawp.school/app',
      '//evil/app',
      '/app\\secret',
      '/app/%zz',
    ]) {
      expect(feedbackPath(path)).toBeNull();
    }
    expect(
      feedbackPath('/app/assignments?search=private&code=secret#token')
    ).toBe('/app/assignments');
  });
  test('captures success without the note and isolates missing or failing analytics', () => {
    const sent: unknown[] = [];
    const actions = [{ type: 'route' as const, path: '/app' }];
    captureSavedFeedback(
      { capture: (...args) => sent.push(args) },
      '/app',
      actions
    );
    expect(sent).toEqual([
      ['feedback_submitted', { location: '/app', recent_actions: actions }],
    ]);
    expect(() =>
      captureSavedFeedback(undefined, '/app', actions)
    ).not.toThrow();
    expect(() =>
      captureSavedFeedback(
        {
          capture: () => {
            throw Error('offline');
          },
        },
        '/app',
        actions
      )
    ).not.toThrow();
  });
});
