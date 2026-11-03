import { afterEach, beforeEach, expect, test } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { buildDesignedAdminApprovalEmail } from './admin-approval-email.server';
import { htmlForStoredAdminApprovalEmail } from './admin-approval-email.server';

const GOLDEN_DIR = path.join(
  import.meta.dir,
  '__goldens__/flag-off-main-7b203f73'
);

const FIX = {
  teacherName: 'Jordan Rivera',
  schoolName: 'Lincoln High School',
  teacherEmail: 'jrivera@example.test',
  forwarder: 'Sam Chen',
  approveUrl: 'https://yawp.test/free/admin/approve?t=GOLDEN',
  notRightPersonUrl: 'https://yawp.test/free/admin/not-right-person?t=GOLDEN',
} as const;

function readGolden(scenario: string, field: 'subject' | 'text' | 'html') {
  return readFileSync(path.join(GOLDEN_DIR, scenario, `${field}.txt`), 'utf8');
}

const primary = process.env.PRIMARY_APP_URL;
beforeEach(() => {
  process.env.PRIMARY_APP_URL = 'https://yawp.test';
});
afterEach(() => {
  if (primary === undefined) delete process.env.PRIMARY_APP_URL;
  else process.env.PRIMARY_APP_URL = primary;
});

test('golden fixtures exist for each flag-off scenario', () => {
  const scenarios = readdirSync(GOLDEN_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  expect(scenarios.sort()).toEqual(
    [
      'admin-forward',
      'first-request',
      'reminder',
      'stored-refresh',
      'teacher-reroute',
    ].sort()
  );
});

test('flag off: first request matches main golden', async () => {
  const designed = await buildDesignedAdminApprovalEmail({
    ...FIX,
    pass1: false,
  });
  expect(designed.subject).toBe(readGolden('first-request', 'subject'));
  expect(designed.text).toBe(readGolden('first-request', 'text'));
  expect(designed.html).toBe(readGolden('first-request', 'html'));
});

test('flag off: reminder matches main golden', async () => {
  const designed = await buildDesignedAdminApprovalEmail({
    ...FIX,
    reminder: true,
    pass1: false,
  });
  expect(designed.subject).toBe(readGolden('reminder', 'subject'));
  expect(designed.text).toBe(readGolden('reminder', 'text'));
  expect(designed.html).toBe(readGolden('reminder', 'html'));
});

test('flag off: admin forward matches main golden', async () => {
  const designed = await buildDesignedAdminApprovalEmail({
    ...FIX,
    forwardedByAdminName: FIX.forwarder,
    pass1: false,
  });
  expect(designed.subject).toBe(readGolden('admin-forward', 'subject'));
  expect(designed.text).toBe(readGolden('admin-forward', 'text'));
  expect(designed.html).toBe(readGolden('admin-forward', 'html'));
});

test('flag off: teacher reroute matches main golden', async () => {
  const designed = await buildDesignedAdminApprovalEmail({
    ...FIX,
    forwardedByAdminName: FIX.forwarder,
    pass1: false,
  });
  expect(designed.subject).toBe(readGolden('teacher-reroute', 'subject'));
  expect(designed.text).toBe(readGolden('teacher-reroute', 'text'));
  expect(designed.html).toBe(readGolden('teacher-reroute', 'html'));
});

test('flag off: stored refresh HTML matches main golden', async () => {
  const designed = await buildDesignedAdminApprovalEmail({
    ...FIX,
    forwardedByAdminName: FIX.forwarder,
    pass1: false,
  });
  const html = await htmlForStoredAdminApprovalEmail({
    subject: designed.subject,
    text: designed.text,
    teacherName: FIX.teacherName,
    teacherEmail: FIX.teacherEmail,
    schoolName: FIX.schoolName,
    pass1: false,
  });
  expect(html).toBe(readGolden('stored-refresh', 'html'));
});
