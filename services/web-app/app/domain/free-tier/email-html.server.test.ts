import { expect, test } from 'bun:test';
import { plainTextEmailToHtml } from './email-html.server';

test('plainTextEmailToHtml wraps URL lines in anchor tags', () => {
  const html = plainTextEmailToHtml('Hello\nhttps://yawp.school/free/admin/approve?t=abc\nThanks');
  expect(html).toContain('<a href="https://yawp.school/free/admin/approve?t=abc">');
  expect(html).toContain('<p>Hello</p>');
});
