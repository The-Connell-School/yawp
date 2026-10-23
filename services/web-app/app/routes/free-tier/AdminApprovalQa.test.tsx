import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'bun:test';
import { AdminApprovalQa } from './AdminApprovalQa';

test('Q&A rows start collapsed with aria-expanded false on triggers', () => {
  const html = renderToStaticMarkup(
    <AdminApprovalQa teacherName="Jordan Rivera" />
  );
  expect(html).toContain('What Yawp! is');
  expect(html).toContain('Questions about student privacy?');
  const triggers = html.match(/aria-expanded="(true|false)"/g) ?? [];
  expect(triggers.length).toBeGreaterThan(0);
  expect(triggers.every((value) => value === 'aria-expanded="false"')).toBe(true);
});

test('Q&A copy omits AI and uses Yawp! verbatim phrasing', () => {
  const html = renderToStaticMarkup(
    <AdminApprovalQa teacherName="Jordan Rivera" />
  );
  expect(html).not.toMatch(/\bAI\b/i);
  expect(html).not.toMatch(/\bartificial intelligence\b/i);
  expect(html).toContain('Jordan Rivera has a free Yawp! license');
});
