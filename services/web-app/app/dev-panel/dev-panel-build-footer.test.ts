import { describe, expect, test } from 'bun:test';
import { formatDevPanelBuildFooter } from './dev-panel-build-footer';

describe('formatDevPanelBuildFooter', () => {
  test('formats short sha and month day', () => {
    expect(
      formatDevPanelBuildFooter({
        commit: 'ac2dab7c9f00',
        builtAt: '2026-10-22T12:00:00.000Z',
      })
    ).toBe('ac2dab7 · Oct 22');
  });
});
