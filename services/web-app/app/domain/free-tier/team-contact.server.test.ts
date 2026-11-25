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
  sendManualReviewTeamContact,
  internalFreeTierReviewQueueUrl,
  TEAM_CONTACT_ADMIN_LEARN_MORE_COOLDOWN_MS,
  TEAM_CONTACT_ADMIN_LEARN_MORE_KIND,
  TEAM_CONTACT_BELOW_HS_KIND,
  TEAM_CONTACT_MANUAL_REVIEW_KIND,
} = await import('./team-contact.server');

describe('internalFreeTierReviewQueueUrl', () => {
  test('links to Internal\'s real decision queue with an explicit environment and teacher search', () => {
    const saved = { origin: process.env.INTERNAL_PLATFORM_ORIGIN, env: process.env.YAWP_ENVIRONMENT };
    process.env.INTERNAL_PLATFORM_ORIGIN = 'https://internal.yawp.school/';
    process.env.YAWP_ENVIRONMENT = 'production';
    expect(internalFreeTierReviewQueueUrl('kd+test@example.com')).toBe(
      'https://internal.yawp.school/free-trial/waitlist?env=production&q=kd%2Btest%40example.com'
    );
    expect(internalFreeTierReviewQueueUrl()).toBe('https://internal.yawp.school/free-trial/waitlist?env=production');
    process.env.YAWP_ENVIRONMENT = 'demo';
    expect(internalFreeTierReviewQueueUrl()).toBe('https://internal.yawp.school/free-trial/waitlist?env=demo');
    expect(internalFreeTierReviewQueueUrl()).not.toContain('/free-tier/approvals');
    delete process.env.INTERNAL_PLATFORM_ORIGIN;
    expect(internalFreeTierReviewQueueUrl('a@b.co')).toBeNull();
    if (saved.origin === undefined) delete process.env.INTERNAL_PLATFORM_ORIGIN; else process.env.INTERNAL_PLATFORM_ORIGIN = saved.origin;
    if (saved.env === undefined) delete process.env.YAWP_ENVIRONMENT; else process.env.YAWP_ENVIRONMENT = saved.env;
  });
});

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
    const firstCall = findFirstLog.mock.calls[0] as unknown as
      | [{ where: { createdAt: { gte: Date } } }]
      | undefined;
    if (!firstCall) throw new Error('expected findFirstLog call');
    const calledAt = firstCall[0].where.createdAt.gte;
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

  test.each([
    ['consumer_domain', 'personal consumer domain'],
    ['domain_mismatch', 'does not match'],
    ['same_as_teacher', 'matches the teacher'],
  ] as const)('sendManualReviewTeamContact includes hold reason %s', async (holdReason, snippet) => {
    process.env.INTERNAL_PLATFORM_ORIGIN = 'https://internal.yawp.school';
    const result = await sendManualReviewTeamContact({
      applicationId: 'app-mr',
      teacherName: 'Taylor',
      teacherEmail: 't@school.edu',
      schoolName: 'LHS',
      adminName: 'Pat',
      adminEmail: 'pat@example.com',
      holdReason,
    });
    expect(result.ok).toBe(true);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'hello@yawp.school',
        text: expect.stringContaining(snippet),
      })
    );
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringMatching(/Internal review queue: https:\/\/internal\.yawp\.school\/free-trial\/waitlist\?env=(production|demo)&q=/),
      })
    );
    sendEmail.mockClear();
    delete process.env.INTERNAL_PLATFORM_ORIGIN;
  });

  test('sendManualReviewTeamContact dedupes within ten minutes', async () => {
    findFirstLog.mockResolvedValueOnce({ id: 'log-mr' } as never);
    const result = await sendManualReviewTeamContact({
      applicationId: 'app-mr',
      teacherName: 'Taylor',
      teacherEmail: 't@school.edu',
      schoolName: 'LHS',
      adminName: 'Pat',
      adminEmail: 'pat@example.com',
      holdReason: 'consumer_domain',
    });
    expect(result.ok).toBe(true);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(findFirstLog).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          applicationId: 'app-mr',
          kind: TEAM_CONTACT_MANUAL_REVIEW_KIND,
        }),
      })
    );
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
