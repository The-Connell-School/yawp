import { beforeEach, describe, expect, mock, test } from 'bun:test';

const sendEmail = mock(async () => ({ status: 'success' as const }));
const findFirstLog = mock(async () => null);
const createLog = mock(async () => ({}));
const findUniqueApp = mock(async () => null as any);
const findFirstApproval = mock(async () => null as any);
const peekSignedLink = mock(async () => ({ ok: false as const, reason: 'invalid' as const }));

mock.module('~/utils/email.server', () => ({ sendEmail }));
mock.module('~/utils/db.server', () => ({
  prisma: {
    freeTierEmailLog: { findFirst: findFirstLog, create: createLog },
    freeTierApplication: { findUnique: findUniqueApp },
    freeTierAdminApproval: { findFirst: findFirstApproval },
  },
}));
mock.module('./signed-link.server', () => ({ peekSignedLink }));
mock.module('./free-tier-config.server', () => ({
  assertFreeTierRuntimeConfigured: () => {},
}));

const {
  adminLearnMoreInCooldown,
  sendBelowHsTeamContact,
  sendAdminLearnMoreTeamContact,
  TEAM_CONTACT_ADMIN_LEARN_MORE_COOLDOWN_MS,
  TEAM_CONTACT_ADMIN_LEARN_MORE_KIND,
  TEAM_CONTACT_BELOW_HS_KIND,
} = await import('./team-contact.server');

describe('team-contact.server', () => {
  beforeEach(() => {
    sendEmail.mockClear();
    findFirstLog.mockReset().mockResolvedValue(null);
    createLog.mockClear();
    findUniqueApp.mockReset();
    findFirstApproval.mockReset();
    peekSignedLink.mockReset().mockResolvedValue({ ok: false, reason: 'invalid' });
  });

  test('sendBelowHsTeamContact rejects applications without below-hs tag', async () => {
    findUniqueApp.mockResolvedValueOnce({
      id: 'app-1',
      name: 'T',
      email: 't@school.edu',
      schoolName: 'S',
      location: 'L',
      gradeLevel: '7',
      tags: [],
      status: 'REJECTED',
    });
    const result = await sendBelowHsTeamContact({ applicationId: 'app-1' });
    expect(result.ok).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test('sendBelowHsTeamContact emails hello and logs success', async () => {
    findUniqueApp.mockResolvedValueOnce({
      id: 'app-1',
      name: 'T',
      email: 't@school.edu',
      schoolName: 'S',
      location: 'L',
      gradeLevel: '7',
      tags: ['below-hs'],
      status: 'REJECTED',
    });
    const result = await sendBelowHsTeamContact({ applicationId: 'app-1' });
    expect(result.ok).toBe(true);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'hello@yawp.school' })
    );
    expect(createLog).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: TEAM_CONTACT_BELOW_HS_KIND }) })
    );
  });

  test('sendBelowHsTeamContact skips resend when a recent log exists', async () => {
    findFirstLog.mockResolvedValueOnce({ id: 'log-1' } as never);
    findUniqueApp.mockResolvedValueOnce({
      id: 'app-1',
      name: 'T',
      email: 't@school.edu',
      schoolName: 'S',
      location: 'L',
      gradeLevel: '7',
      tags: ['below-hs'],
      status: 'REJECTED',
    });
    const result = await sendBelowHsTeamContact({ applicationId: 'app-1' });
    expect(result.ok).toBe(true);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test('sendAdminLearnMoreTeamContact requires a valid approve token', async () => {
    const result = await sendAdminLearnMoreTeamContact({ token: 'bad' });
    expect(result).toEqual({ ok: false, reason: 'invalid' });
  });

  test('adminLearnMoreInCooldown queries admin learn-more log window', async () => {
    findFirstLog.mockResolvedValueOnce({ id: 'log-2' } as never);
    const inCooldown = await adminLearnMoreInCooldown('app-2');
    expect(inCooldown).toBe(true);
    expect(findFirstLog).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          applicationId: 'app-2',
          kind: TEAM_CONTACT_ADMIN_LEARN_MORE_KIND,
          success: true,
          createdAt: {
            gte: expect.any(Date),
          },
        }),
      })
    );
    expect(findFirstLog.mock.calls.length).toBeGreaterThan(0);
    const calledAt = findFirstLog.mock.calls[0]?.[0]?.where.createdAt
      .gte as Date;
    const delta = Date.now() - calledAt.getTime();
    expect(delta).toBeGreaterThanOrEqual(TEAM_CONTACT_ADMIN_LEARN_MORE_COOLDOWN_MS - 50);
    expect(delta).toBeLessThanOrEqual(TEAM_CONTACT_ADMIN_LEARN_MORE_COOLDOWN_MS + 50);
  });

  test('sendAdminLearnMoreTeamContact skips resend within 30 minutes', async () => {
    findFirstLog.mockResolvedValueOnce({ id: 'log-2' } as never);
    peekSignedLink.mockResolvedValueOnce({
      ok: true as const,
      applicationId: 'app-2',
      linkId: 'link-1',
    } as never);
    findUniqueApp.mockResolvedValueOnce({
      id: 'app-2',
      name: 'Jordan',
      email: 'j@school.edu',
      schoolName: 'LHS',
      location: 'City',
      gradeLevel: '11',
      tags: [],
    });
    findFirstApproval.mockResolvedValueOnce({
      adminName: 'Pat Admin',
      adminEmail: 'pat@district.org',
    });
    const result = await sendAdminLearnMoreTeamContact({
      token: 'good-token',
      adminRole: 'Principal',
    });
    expect(result).toEqual({ ok: true, learnMoreSent: true });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test('sendAdminLearnMoreTeamContact sends with application context', async () => {
    peekSignedLink.mockResolvedValueOnce({
      ok: true as const,
      applicationId: 'app-2',
      linkId: 'link-1',
    } as never);
    findUniqueApp.mockResolvedValueOnce({
      id: 'app-2',
      name: 'Jordan',
      email: 'j@school.edu',
      schoolName: 'LHS',
      location: 'City',
      gradeLevel: '11',
      tags: [],
    });
    findFirstApproval.mockResolvedValueOnce({
      adminName: 'Pat Admin',
      adminEmail: 'pat@district.org',
    });
    const result = await sendAdminLearnMoreTeamContact({
      token: 'good-token',
      adminRole: 'Principal',
    });
    expect(result).toEqual({ ok: true, learnMoreSent: true });
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('Jordan'),
      })
    );
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('Pat Admin'),
      })
    );
  });
});
