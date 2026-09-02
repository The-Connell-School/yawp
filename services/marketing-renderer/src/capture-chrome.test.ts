import { describe, expect, test } from 'bun:test';
import { HIDE_CAPTURE_CHROME_SCRIPT } from './capture-chrome';

describe('HIDE_CAPTURE_CHROME_SCRIPT', () => {
  // The badge must stay hidden across a React re-render of the document. A
  // <style> appended to <head> did not: a dev-mode hydration mismatch rebuilt
  // <head> and the badge came back in every capture. Adopted stylesheets are
  // not part of the DOM tree, so nothing React does can remove them.
  test('hides the environment badge with an adopted stylesheet', () => {
    expect(HIDE_CAPTURE_CHROME_SCRIPT).toContain('adoptedStyleSheets');
    expect(HIDE_CAPTURE_CHROME_SCRIPT).toContain(
      '[data-environment-bar]{display:none !important}'
    );
  });
});
