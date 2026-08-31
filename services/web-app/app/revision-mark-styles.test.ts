import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('./app.css', import.meta.url), 'utf8');

describe('revision mark styles', () => {
  test('never uses unsupported wavy border syntax', () => {
    expect(css).not.toMatch(/border-bottom\s*:[^;]*\bwavy\b/);
  });

  test('keeps assistant marks visibly keyed with a purple dotted underline', () => {
    expect(css).toMatch(
      /\.grammar-issue-mark\s*\{[^}]*border-bottom:\s*2px dotted #a855f7;/s
    );
    expect(css).not.toContain('.mark-swatch-teacher');
    expect(css).not.toContain('.mark-swatch-assistant');
  });
});
