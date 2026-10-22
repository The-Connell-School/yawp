import { afterEach, beforeEach, expect, test } from 'bun:test';
import {
  CONGRATULATIONS_V2_SUBJECT,
  RELEASE_EMAIL_V2_COPY_VERSION,
  TEACHER_REMINDER_V2_SUBJECT,
  renderCongratulationsEmailV2Body,
  renderReleaseEmailBody,
  renderReleaseEmailSubject,
  renderTeacherReminderV2Body,
} from './email-copy';
import { plainTextEmailToHtml } from './email-html.server';

const application = { name: '<Ada> Lovelace', joinUrl: 'https://example.test/free/join?t=local-only' };
const SUBJECT = "You're in: start your Yawp! classroom";
const primary = process.env.PRIMARY_APP_URL;
beforeEach(() => {
  process.env.PRIMARY_APP_URL = 'https://yawp.test';
});
afterEach(() => {
  if (primary === undefined) delete process.env.PRIMARY_APP_URL;
  else process.env.PRIMARY_APP_URL = primary;
});

test('explicit v2 email copy renders Brian\'s release copy and subject without delivery', () => {
  const args = { ...application, copyVersion: RELEASE_EMAIL_V2_COPY_VERSION };
  const text = renderReleaseEmailBody(args);
  expect(renderReleaseEmailSubject(args)).toBe(SUBJECT);
  expect(text).toContain('Your spot is ready.');
  expect(text).toContain('one class of up to 35 students');
  expect(text).toContain(application.joinUrl);
  expect(text).toContain('expires in 30 days');
  expect(text).toContain('Founder, Yawp! Writing Program');
  const html = plainTextEmailToHtml(text);
  expect(html).toContain('&lt;Ada&gt;');
  expect(html).not.toContain('<Ada>');
});

test('legacy and unknown copy versions keep legacy body wording and subject', () => {
  for (const copyVersion of [undefined, '2026-10-14-v5', 'unknown']) {
    const args = { ...application, copyVersion };
    expect(renderReleaseEmailSubject(args)).toBe(
      "You're in — start your Yawp! classroom!"
    );
    expect(renderReleaseEmailBody(args)).toContain("You're in — we'd love to have you try Yawp! with your students.");
  }
});

test('v2 teacher reminder and approved emails follow the copy rules', () => {
  const teacher = renderTeacherReminderV2Body({
    teacherName: 'Jordan Smith',
    adminName: 'Dr. Lee',
    pendingUrl: 'https://example.test/pending',
  });
  const approved = renderCongratulationsEmailV2Body({
    teacherName: 'Jordan Smith',
    adminName: 'Dr. Lee',
    signInUrl: 'https://example.test/login',
  });
  expect(TEACHER_REMINDER_V2_SUBJECT).toBe(
    'Your Yawp! classroom is still waiting on approval'
  );
  expect(CONGRATULATIONS_V2_SUBJECT).toBe(
    "You're approved! Your Yawp! classroom is ready"
  );
  expect(teacher).toContain('Request approval from a different administrator');
  expect(approved).toContain('Hi Jordan,');
  for (const text of [teacher, approved]) {
    expect(text).not.toMatch(/\bAI\b/);
    expect(text).not.toMatch(/Yawp(?!!)/);
  }
});
