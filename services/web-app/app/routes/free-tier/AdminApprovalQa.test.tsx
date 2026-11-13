import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'bun:test';
import { AdminApprovalQa } from './AdminApprovalQa';

test('FAQ shows design heading, badges, and default-open first item', () => {
  const html = renderToStaticMarkup(
    <AdminApprovalQa teacherName="Jordan Rivera" />
  );
  expect(html).toContain('Questions administrators ask');
  expect(html).toContain('FERPA compliant');
  expect(html).toContain('NDPA signed');
  expect(html).toContain('What Yawp! is');
  expect(html).toContain('Student privacy');
  expect(html).toContain('data-state="open"');
});

test('FAQ uses design copy for the free plan question', () => {
  const html = renderToStaticMarkup(
    <AdminApprovalQa teacherName="Jordan Rivera" />
  );
  expect(html).toContain('It’s free');
  expect(html).not.toContain('If approved, Jordan Rivera');
});

test('FAQ omits standalone AI product claims outside privacy answer', () => {
  const html = renderToStaticMarkup(
    <AdminApprovalQa teacherName="Jordan Rivera" />
  );
  expect(html).not.toMatch(/\bartificial intelligence\b/i);
});
