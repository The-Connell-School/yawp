import { expect, test } from 'bun:test';
import {
  CONGRATULATIONS_V2_SUBJECT,
  FREE_TIER_MODEL_TRAINING_LINE,
  RELEASE_EMAIL_V2_COPY_VERSION,
  TEACHER_REMINDER_V2_SUBJECT,
  isFreeTierNdpaCompleted,
  renderAdminApprovalEmailV2Body,
  renderAdminApprovalEmailV2Subject,
  renderCongratulationsEmailV2Body,
  renderReleaseEmailBody,
  renderReleaseEmailSubject,
  renderTeacherReminderV2Body,
} from './email-copy';
import { plainTextEmailToHtml } from './email-html.server';

const application = { name: '<Ada> Lovelace', joinUrl: 'https://example.test/free/join?t=local-only' };
const SUBJECT = "You're in — start your Yawp! classroom!";

test('explicit v2 email copy renders Brian\'s release copy and subject without delivery', () => {
  const args = { ...application, copyVersion: RELEASE_EMAIL_V2_COPY_VERSION };
  const text = renderReleaseEmailBody(args);
  expect(renderReleaseEmailSubject(args)).toBe(SUBJECT);
  expect(text).toContain('Good news: your spot is ready.');
  expect(text).toContain('one class of up to 35 students');
  expect(text).toContain(application.joinUrl);
  expect(text).toContain('expires in 30 days');
  expect(text).toContain('Founder, Yawp! Writing Program');
  const html = plainTextEmailToHtml(text);
  expect(html).toContain('&lt;Ada&gt;');
  expect(html).not.toContain('<Ada>');
});

test('legacy and unknown copy versions keep legacy body wording with the new subject', () => {
  for (const copyVersion of [undefined, '2026-10-14-v5', 'unknown']) {
    const args = { ...application, copyVersion };
    expect(renderReleaseEmailSubject(args)).toBe(SUBJECT);
    expect(renderReleaseEmailBody(args)).toContain("You're in — we'd love to have you try Yawp! with your students.");
  }
});

test('v2 approval, reminder and approved emails follow the copy rules', () => {
  const approval = renderAdminApprovalEmailV2Body({
    teacherName: 'Jordan Smith',
    schoolName: 'Lincoln High',
    className: 'English 9',
    adminRecipientName: 'Dr. Lee',
    approveUrl: 'https://example.test/approve',
    notRightPersonUrl: 'https://example.test/not-right',
  });
  const reminder = renderAdminApprovalEmailV2Body({
    teacherName: 'Jordan Smith',
    schoolName: 'Lincoln High',
    approveUrl: 'https://example.test/approve',
    notRightPersonUrl: 'https://example.test/not-right',
    reminder: true,
  });
  const teacher = renderTeacherReminderV2Body({ teacherName: 'Jordan Smith', adminName: 'Dr. Lee', pendingUrl: 'https://example.test/pending' });
  const approved = renderCongratulationsEmailV2Body({ teacherName: 'Jordan Smith', adminName: 'Dr. Lee', signInUrl: 'https://example.test/login' });
  expect(renderAdminApprovalEmailV2Subject({ teacherName: 'Jordan Smith' })).toBe('Jordan Smith would like to use Yawp! with their students');
  expect(renderAdminApprovalEmailV2Subject({ teacherName: 'Jordan Smith', reminder: true })).toBe('Reminder: Jordan Smith is waiting on your approval for Yawp!');
  expect(TEACHER_REMINDER_V2_SUBJECT).toBe('Your Yawp! classroom is still waiting on approval');
  expect(CONGRATULATIONS_V2_SUBJECT).toBe("You're approved! Your Yawp! classroom is ready");
  expect(approval).toContain('Jordan Smith, who teaches English 9 at Lincoln High,');
  expect(approval).toContain('https://example.test/not-right');
  expect(reminder.indexOf("We're checking in")).toBeLessThan(reminder.indexOf('What Yawp! is.'));
  expect(teacher).toContain('Request approval from a different administrator');
  expect(approved).toContain('Hi Jordan,');
  for (const text of [approval, reminder, teacher, approved]) {
    expect(text).not.toMatch(/\bAI\b/);
    expect(text).not.toMatch(/Yawp(?!!)/);
  }
  expect(approval).not.toContain('National Student Data Privacy Agreement');
});

test('admin approval email includes NDPA only when FREE_TIER_NDPA_COMPLETED is true', () => {
  const prior = process.env.FREE_TIER_NDPA_COMPLETED;
  delete process.env.FREE_TIER_NDPA_COMPLETED;
  const without = renderAdminApprovalEmailV2Body({
    teacherName: 'Jordan Smith',
    schoolName: 'Lincoln High',
    approveUrl: 'https://example.test/approve',
    notRightPersonUrl: 'https://example.test/not-right',
  });
  expect(without).not.toContain('National Student Data Privacy Agreement');
  expect(isFreeTierNdpaCompleted()).toBe(false);

  process.env.FREE_TIER_NDPA_COMPLETED = 'true';
  const withNdpa = renderAdminApprovalEmailV2Body({
    teacherName: 'Jordan Smith',
    schoolName: 'Lincoln High',
    approveUrl: 'https://example.test/approve',
    notRightPersonUrl: 'https://example.test/not-right',
  });
  expect(withNdpa).toContain('National Student Data Privacy Agreement (NDPA)');
  if (prior === undefined) delete process.env.FREE_TIER_NDPA_COMPLETED;
  else process.env.FREE_TIER_NDPA_COMPLETED = prior;
});
