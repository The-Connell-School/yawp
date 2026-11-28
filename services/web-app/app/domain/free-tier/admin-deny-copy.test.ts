import { expect, test } from 'bun:test';
import {
  renderTeacherDenyEmailText,
  teacherDenyEmailClose,
  teacherDenyEmailGreeting,
  teacherDenyEmailIntro,
  teacherDenyEmailPreheader,
  teacherDenyEmailSignOff,
  teacherDenyEmailSubject,
  teacherDenyEmailWays,
} from './admin-deny-copy';

test("teacher deny email subject is Brian's 28 Nov 2026 line, typo corrected", () => {
  expect(teacherDenyEmailSubject).toBe('An update on your Yawp! request');
  expect(teacherDenyEmailSubject.startsWith('And ')).toBe(false);
});

test("teacher deny email greeting uses the teacher's full name", () => {
  expect(teacherDenyEmailGreeting('Jordan Rivera')).toBe('Dear Jordan Rivera,');
});

test("teacher deny email copy matches Brian's body", () => {
  expect(teacherDenyEmailIntro).toBe(
    "Your administrator did not approve Yawp! for use in your classroom at this time. We know that's disappointing, and we'd still love to get you writing with us. Here are a few ways forward:"
  );
  expect(teacherDenyEmailWays.map((way) => `${way.title} ${way.body}`)).toEqual(
    [
      'Ask a different administrator. If someone else at your school or district can approve classroom tools, you can send them a new request from your Yawp! account.',
      'Talk with your administrator. Sometimes a "no" is really a "not yet" or "I have questions." A quick conversation about how you\'d use Yawp! with your students can go a long way.',
      "Bring us in. We're happy to talk with your administrator directly, answer questions about student privacy and how the Tutor works, or give a short demo. Just reply to this email and we'll set it up.",
    ]
  );
  expect(teacherDenyEmailClose).toBe(
    'We built Yawp! for teachers like you, and we think you and your students would love it. We hope to see you on the platform soon.'
  );
  expect([...teacherDenyEmailSignOff]).toEqual([
    'Best always,',
    'Brian Connell',
    'The Yawp! Team',
  ]);
  expect(teacherDenyEmailPreheader).toBe(
    'Your administrator did not approve Yawp! for use in your classroom at this time.'
  );
});

test("teacher deny plain text includes Brian's copy, sign-off, and the account link", () => {
  const text = renderTeacherDenyEmailText({
    teacherName: 'Jordan Rivera',
    statusUrl: 'https://yawp.test/app/free-tier/pending?ask=1',
    chainCapReached: false,
  });
  expect(text).toContain('Dear Jordan Rivera,');
  expect(text).toContain(teacherDenyEmailIntro);
  expect(text).toContain(
    '- Ask a different administrator. If someone else at your school or district can approve classroom tools, you can send them a new request from your Yawp! account.'
  );
  expect(text).toContain('Best always,');
  expect(text).toContain('Brian Connell');
  expect(text).toContain('The Yawp! Team');
  expect(text).toContain(
    'Ask another administrator: https://yawp.test/app/free-tier/pending?ask=1'
  );
  expect(text).not.toContain(
    "wasn't able to approve your Yawp! classroom right now"
  );
});

test('teacher deny plain text points to support when the request cap is reached', () => {
  const text = renderTeacherDenyEmailText({
    teacherName: 'Jordan Rivera',
    statusUrl: 'https://yawp.test/app/free-tier/pending',
    chainCapReached: true,
  });
  expect(text).toContain('Email support: support@yawp.school');
  expect(text).not.toContain('https://yawp.test/app/free-tier/pending');
});
