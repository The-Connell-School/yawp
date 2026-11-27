import { expect, test } from 'bun:test';
import {
  isAdminEmailUndeliverableStop,
  suppressionMatchesSend,
  teacherAdminEmailUndeliverableBody,
  teacherPendingUndeliverableBody,
  teamAdminEmailUndeliverableBody,
} from './admin-approval-undeliverable-copy';

test('teacher and team copy name the next step without a signed link', () => {
  const teacher = teacherAdminEmailUndeliverableBody({
    teacherName: 'Danielle Cabibbo',
    adminName: 'Patel',
    adminEmail: 'patel@lincoln.edu',
    schoolName: 'Lincoln High School',
    pendingUrl: 'https://yawp.school/app/free-tier/pending?ask=1',
  });
  expect(teacher).toContain('Hi Danielle,');
  expect(teacher).toContain('patel@lincoln.edu');
  expect(teacher).toContain('Re-enter their email or pick another administrator');
  expect(teacher).toContain('/app/free-tier/pending?ask=1');
  expect(teacher).not.toContain('/free/admin/approve');
  expect(teacherPendingUndeliverableBody('Patel')).toContain('pick another administrator');
  const team = teamAdminEmailUndeliverableBody({
    teacherName: 'Danielle Cabibbo',
    teacherEmail: 'danielle@lincoln.edu',
    schoolName: 'Lincoln High School',
    adminName: 'Patel',
    adminEmail: 'patel@lincoln.edu',
    applicationId: 'app-1',
    reason: 'bounced',
    reviewUrl: null,
  });
  expect(team).toContain('marked for follow-up');
  expect(team).not.toContain('?t=');
});

test('only bounce and failure stops count as undeliverable', () => {
  expect(isAdminEmailUndeliverableStop('admin_email_bounced')).toBe(true);
  expect(isAdminEmailUndeliverableStop('admin_email_failed')).toBe(true);
  expect(isAdminEmailUndeliverableStop('manual')).toBe(false);
  expect(isAdminEmailUndeliverableStop(null)).toBe(false);
});

test('suppression matches a bounce that landed after the send', () => {
  const sentAt = new Date('2026-11-26T15:00:00Z');
  expect(
    suppressionMatchesSend({
      reason: 'BOUNCE',
      lastUpdateTime: new Date('2026-11-26T15:05:00Z'),
      sentAt,
    })
  ).toBe(true);
  expect(
    suppressionMatchesSend({
      reason: 'BOUNCE',
      lastUpdateTime: new Date('2026-11-01T15:00:00Z'),
      sentAt,
    })
  ).toBe(false);
  expect(
    suppressionMatchesSend({
      reason: 'COMPLAINT',
      lastUpdateTime: new Date('2026-11-26T16:00:00Z'),
      sentAt,
    })
  ).toBe(true);
  expect(
    suppressionMatchesSend({
      reason: 'OTHER',
      lastUpdateTime: new Date('2026-11-26T16:00:00Z'),
      sentAt,
    })
  ).toBe(false);
});
