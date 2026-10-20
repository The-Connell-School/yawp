import { expect, test } from 'bun:test';
import { approvalMailto, approvalSentDate, forwardApprovalSchema } from './approval-waiting';
test('mailto encodes recipient, reserved characters, and line breaks as values',()=>{
  const link=approvalMailto({adminEmail:'patel+approval@example.org',adminName:'Patel & Lee',teacherName:'A?B#C'});
  expect(link.startsWith('mailto:patel%2Bapproval%40example.org?')).toBe(true);
  const query=new URLSearchParams(link.split('?')[1]);
  expect(query.get('subject')).toBe('My YAWP! classroom approval request');
  expect(query.get('body')).toContain('Patel & Lee,\n\n'); expect(query.get('body')).toContain('A?B#C');
  expect(approvalSentDate('2026-10-14T00:01:00Z')).toBe('October 14');
});
test('forward input rejects missing, malformed, overlong and injected fields',()=>{
 for(const fields of [{newAdminName:'',newAdminEmail:'a@b.org'},{newAdminName:'Name',newAdminEmail:'bad'},{newAdminName:'a'.repeat(121),newAdminEmail:'a@b.org'},{newAdminName:'Name\r\nInjected',newAdminEmail:'a@b.org'}]) expect(forwardApprovalSchema.safeParse(fields).success).toBe(false);
 expect(forwardApprovalSchema.parse({newAdminName:' Dr. Patel ',newAdminEmail:'PATEL@EXAMPLE.ORG'})).toEqual({newAdminName:'Dr. Patel',newAdminEmail:'patel@example.org'});
});
