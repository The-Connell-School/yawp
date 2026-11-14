import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'bun:test';
import { ADMIN_APPROVE_FAQ, AdminApprovalQa } from './AdminApprovalQa';

test('FAQ shows design heading, badges, and default-open first item', () => {
  const html = renderToStaticMarkup(
    <AdminApprovalQa teacherName="Jordan Rivera" />
  );
  expect(html).toContain('Questions administrators ask');
  expect(html).toContain('SDPC NDPA');
  expect(html).toContain('will sign');
  expect(html).not.toContain('NDPA signed');
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

test('FAQ copy uses the Oxford comma in serial lists', () => {
  const doesnt = ADMIN_APPROVE_FAQ.find((item) => item.id === 'doesnt');
  const what = ADMIN_APPROVE_FAQ.find((item) => item.id === 'what');
  expect(what?.answer).toContain(
    'a full curriculum, ready-to-teach lessons, and grading tools'
  );
  expect(what?.answer).toContain('teachers, students, and parents');
  // The doesn't-do answer has no serial list; it leads with the no-writing rule.
  expect(doesnt?.answer).toContain('it will not write for students');
});

test('FAQ omits standalone AI product claims outside privacy answer', () => {
  const html = renderToStaticMarkup(
    <AdminApprovalQa teacherName="Jordan Rivera" />
  );
  expect(html).not.toMatch(/\bartificial intelligence\b/i);
});
