import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'bun:test';
import AccessibilityRoute from './route';

function visibleText(html: string) {
  return html
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

test('accessibility page uses public legal layout and reporting contact', () => {
  const html = visibleText(renderToStaticMarkup(<AccessibilityRoute />));
  expect(html).toContain('aria-label="Public legal navigation"');
  expect(html).toContain('href="/accessibility"');
  expect(html).toContain('Accessibility at Yawp!');
  expect(html).toContain('WCAG 2.1 Level AA support');
  expect(html).toContain('yawp@theconnellschool.com');
  expect(html).toContain('Last updated June 29, 2026.');
  expect(html).toContain('id="report"');
  expect(html).not.toMatch(/Yawp(?!!)/);
});