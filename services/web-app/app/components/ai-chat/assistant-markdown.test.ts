import { describe, expect, test } from 'bun:test';
import { MARKDOWN_CLASS } from './assistant-markdown';

/**
 * These guard a layout bug that only shows up on screen, so they pin the cause
 * rather than the appearance: a table drew its border across the full bubble
 * while its columns stopped less than halfway, which reads as a table chopped
 * off partway through.
 */
describe('MARKDOWN_CLASS — tables fill their frame', () => {
  test('never makes a table a block box', () => {
    // `display: block` on <table> turns its rows into an anonymous table box
    // that shrinks to fit, so the frame and the columns disagree about width.
    expect(MARKDOWN_CLASS).not.toContain('[&_table]:block');
  });

  test('gives the table its full width', () => {
    expect(MARKDOWN_CLASS).toContain('[&_table]:w-full');
  });

  test('scrolls a wide table on the wrapper instead', () => {
    // Overflow does nothing on `display: table`, which is why the block hack
    // existed; the wrapper is what makes a wide table scrollable.
    expect(MARKDOWN_CLASS).toContain('[&_.md-table]:overflow-x-auto');
    expect(MARKDOWN_CLASS).toContain('[&_.md-table]:border');
  });
});
