import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('./app.css', import.meta.url), 'utf8');

describe('free-tier page styles', () => {
  test('Q&A section labels render authored casing (no uppercase transform)', () => {
    const block = css.match(/\.free-tier-qa-group-label\s*\{[^}]+\}/s)?.[0] ?? '';
    expect(block).not.toContain('text-transform: uppercase');
    expect(block).toContain('letter-spacing: 0.06em');
  });

  test('narrow free-tier chrome shell clears the fixed back link above the logo', () => {
    expect(css).toMatch(
      /@media \(max-width: 639px\)\s*\{[^}]*\.free-tier-page \.auth-page-shell--chrome\s*\{[^}]*padding-top:\s*72px;/s
    );
  });
});
