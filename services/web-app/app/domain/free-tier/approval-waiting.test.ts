import { expect, test } from 'bun:test';
import {
  approvalMailto,
  approvalSentDate,
  forwardApprovalSchema,
} from './approval-waiting';

test('mailto encodes recipient, reserved characters, and line breaks as values', () => {
  const link = approvalMailto({
    adminEmail: 'patel+approval@example.org',
    adminName: 'Patel & Lee',
    teacherName: 'A?B#C',
    schoolName: 'Lincoln High School',
    approvalEmailFrom: 'hello@yawp.school',
  });
  expect(link.startsWith('mailto:patel%2Bapproval%40example.org?')).toBe(true);
  const query = new URLSearchParams(link.split('?')[1]);
  expect(query.get('subject')).toBe('My Yawp! classroom approval request');
  const body = query.get('body') ?? '';
  expect(body).toContain('Patel & Lee,\n\n');
  expect(body).toContain(
    'I requested Yawp! for my classroom at Lincoln High School, and Yawp! just sent you an approval email.'
  );
  expect(body).toContain('in your inbox from hello@yawp.school.');
  expect(body).toContain(
    'Approving takes about a minute, and it lets my students start writing with Yawp!'
  );
  expect(body).not.toContain('with Yawp!.');
  expect(body).toContain('A?B#C');
  expect(approvalSentDate('2026-10-14T00:01:00Z')).toBe('October 14');
});

test('forward input rejects missing, malformed, overlong and injected fields', () => {
  for (const fields of [
    { newAdminName: '', newAdminEmail: 'a@b.org' },
    { newAdminName: 'Name', newAdminEmail: 'bad' },
    { newAdminName: 'a'.repeat(121), newAdminEmail: 'a@b.org' },
    { newAdminName: 'Name\r\nInjected', newAdminEmail: 'a@b.org' },
  ])
    expect(forwardApprovalSchema.safeParse(fields).success).toBe(false);
  expect(
    forwardApprovalSchema.parse({
      newAdminName: ' Dr. Patel ',
      newAdminEmail: 'PATEL@EXAMPLE.ORG',
    })
  ).toEqual({ newAdminName: 'Dr. Patel', newAdminEmail: 'patel@example.org' });
});
