import { describe, expect, mock, test } from 'bun:test';

const teacherName = 'Jordan Rivera';
const schoolName = 'Lincoln High School';
const teacherEmail = 'jrivera@example.test';
const approveUrl = 'https://yawp.test/free/admin/approve?t=fake-approve';
const notRightPersonUrl =
  'https://yawp.test/free/admin/not-right-person?t=fake-forward';

const findUnique = mock(async (): Promise<Record<string, unknown> | null> => null);

mock.module('~/domain/feature-flags/feature-flags.server', () => ({
  isFreeTierEnabled: async () => false,
}));

mock.module('~/utils/db.server', () => ({
  prisma: {
    freeTierApplication: { findUnique },
    freeTierSignedLink: { findUnique: mock(async () => null) },
    freeTierAdminApproval: {
      findUnique,
      findFirst: mock(async () => null),
    },
  },
}));

const { buildDesignedAdminApprovalEmail } = await import(
  './admin-approval-email.server'
);
const {
  adminApprovalEmailContextFromStoredMessage,
  mergeAdminApprovalEmailContext,
  resolveAdminApprovalEmailContext,
} = await import('./admin-approval-email-context.server');
const { adminApprovalTeacherRerouteLead, teacherAtSchool } = await import(
  './admin-approval-copy'
);
describe('admin approval email forward context', () => {
  test('resolveAdminApprovalEmailContext treats teacher reroute separately from admin forward', async () => {
    findUnique.mockReset();
    findUnique.mockResolvedValueOnce({ adminName: 'Sam Chen' });
    expect(
      await resolveAdminApprovalEmailContext({
        redirectedFromId: 'prev',
        forwardedByRole: 'teacher',
      })
    ).toEqual({ forwardedByAdminName: 'Sam Chen' });
    findUnique.mockResolvedValueOnce({ adminName: 'Sam Chen' });
    expect(
      await resolveAdminApprovalEmailContext({
        redirectedFromId: 'prev',
        forwardedByRole: 'admin',
      })
    ).toEqual({ forwardedByAdminName: 'Sam Chen' });
    findUnique.mockResolvedValueOnce({ adminName: 'Sam Chen' });
    expect(
      await resolveAdminApprovalEmailContext({
        redirectedFromId: 'prev',
        forwardedByRole: null,
      })
    ).toEqual({ forwardedByAdminName: 'Sam Chen' });
  });

  test('pass1 first-admin reminder uses frame 37 muted lead', async () => {
    const designed = await buildDesignedAdminApprovalEmail({
      teacherName,
      teacherEmail,
      schoolName,
      approveUrl,
      notRightPersonUrl,
      reminder: true,
      pass1: true,
    });
    expect(designed.text).toContain(
      'A quick reminder: Jordan Rivera at Lincoln High School is still waiting on your approval.'
    );
  });

  test('forwarded admin reminders keep forward wording', async () => {
    const designed = await buildDesignedAdminApprovalEmail({
      teacherName,
      teacherEmail,
      schoolName,
      approveUrl,
      notRightPersonUrl,
      forwardedByAdminName: 'Sam Chen',
      reminder: true,
      pass1: true,
    });
    const atSchool = teacherAtSchool(teacherName, schoolName);
    expect(designed.subject).toBe(
      `Reminder: Can you approve Yawp! for ${atSchool}?`
    );
    expect(designed.text).toContain('Sam Chen forwarded Jordan Rivera');
    expect(designed.text).not.toContain('They named you as the administrator');
    expect(designed.text).toContain(
      "A quick reminder: Sam Chen forwarded Jordan Rivera's request at Lincoln High School to you, and it's still waiting on your approval."
    );
  });

  test('teacher reroute email does not claim the previous admin forwarded it', async () => {
    const flagOff = await buildDesignedAdminApprovalEmail({
      teacherName,
      teacherEmail,
      schoolName,
      approveUrl,
      notRightPersonUrl,
      routedByTeacher: true,
      pass1: false,
    });
    expect(flagOff.text).not.toContain('forwarded this to you');
    expect(flagOff.text).not.toContain(
      adminApprovalTeacherRerouteLead(teacherName, schoolName, true)
    );
    expect(flagOff.text).toContain('They named you as the administrator');

    const pass1 = await buildDesignedAdminApprovalEmail({
      teacherName,
      teacherEmail,
      schoolName,
      approveUrl,
      notRightPersonUrl,
      routedByTeacher: true,
      pass1: true,
    });
    expect(pass1.text).toContain(
      adminApprovalTeacherRerouteLead(teacherName, schoolName, true)
    );
    expect(pass1.text).not.toContain('forwarded this to you');
    expect(pass1.text).not.toContain('They named you as the administrator');
  });

  test('outbox refresh reuses forward context from stored delivery payload', () => {
    const pass1Stored = adminApprovalEmailContextFromStoredMessage({
      text: "Sam Chen forwarded Jordan Rivera's request at Lincoln High School to you.\n\nApprove",
    });
    expect(pass1Stored).toEqual({ forwardedByAdminName: 'Sam Chen' });
    const stored = adminApprovalEmailContextFromStoredMessage({
      text: 'Sam Chen forwarded this to you as the right person to approve classroom software for Jordan Rivera at Lincoln High School.\n\nApprove',
      forwardedByAdminName: 'Sam Chen',
    });
    const merged = mergeAdminApprovalEmailContext({}, stored);
    expect(merged).toEqual({ forwardedByAdminName: 'Sam Chen' });
    const teacherStored = adminApprovalEmailContextFromStoredMessage({
      text: `${adminApprovalTeacherRerouteLead(teacherName, schoolName)}\n\nApprove`,
      routedByTeacher: true,
    });
    expect(teacherStored).toEqual({ routedByTeacher: true });
  });

  test('teacher reroute on approval row overrides legacy admin-forward payload text', () => {
    const legacy = adminApprovalEmailContextFromStoredMessage({
      text: 'Sam Chen forwarded this to you as the right person to approve classroom software for Jordan Rivera at Lincoln High School.\n\nApprove',
    });
    expect(
      mergeAdminApprovalEmailContext({ routedByTeacher: true }, legacy)
    ).toEqual({ routedByTeacher: true });
  });
});
