import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('./app.css', import.meta.url), 'utf8');

describe('free-tier page styles', () => {
  test('Q&A section labels render authored casing (no uppercase transform)', () => {
    const block = css.match(/\.free-tier-qa-group-label\s*\{[^}]+\}/s)?.[0] ?? '';
    expect(block).not.toContain('text-transform: uppercase');
    expect(block).toContain('letter-spacing: 0.06em');
  });

  test('narrow free-tier chrome adds top padding only when the back link is present', () => {
    expect(css).toMatch(
      /@media \(max-width: 639px\)\s*\{[^}]*\.free-tier-page \.auth-page-shell--chrome:has\(> \.card-page-back-link\)\s*\{[^}]*padding-top:\s*72px;/s
    );
    expect(css).not.toMatch(
      /@media \(max-width: 639px\)\s*\{[^}]*\.free-tier-page \.auth-page-shell--chrome\s*\{[^}]*padding-top:\s*72px;/s
    );
  });
});
