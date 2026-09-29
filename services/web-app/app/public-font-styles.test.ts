import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('./app.css', import.meta.url), 'utf8');

describe('public font styles', () => {
  test('never references Adobe Garamond Pro, which no stylesheet or kit loads', () => {
    expect(css.toLowerCase()).not.toContain('adobe-garamond');
  });

  test('loads Cormorant Garamond from Google Fonts', () => {
    expect(css).toMatch(
      /@import url\('https:\/\/fonts\.googleapis\.com\/css2\?family=Cormorant\+Garamond[^']*'\);/
    );
  });

  test('every serif stack using Cormorant Garamond leads with it', () => {
    const stacks = [
      ...css.matchAll(/font-family:\s*([^;]*Cormorant Garamond[^;]*);/g),
    ].map((m) => m[1].replace(/\s+/g, ' ').trim());
    expect(stacks.length).toBeGreaterThan(0);
    for (const stack of stacks) {
      expect(stack.startsWith("'Cormorant Garamond'")).toBe(true);
    }
  });
});
