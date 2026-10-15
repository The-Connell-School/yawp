import { beforeEach, expect, mock, test } from 'bun:test';
const capture = mock();
const alias = mock();
const token = {
  id: 'token-1',
  disabledAt: null,
  uses: 0,
  maxUses: null,
  expiresAt: null,
  bypassWaitlist: false,
  label: 'Event QR',
  sourceName: 'Event',
  eventDate: null,
  eventLocation: null,
};
const application = {
  id: 'app-1',
  status: 'LEAD',
  acquisitionTokenId: token.id,
};
const prisma = {
  acquisitionToken: { findUnique: mock(), findFirst: mock(), update: mock() },
  acquisitionTokenScan: { findFirst: mock(), create: mock() },
  freeTierApplication: {
    findUnique: mock(),
    createMany: mock(),
    update: mock(),
  },
  $executeRaw: mock(),
  $transaction: mock(),
};
mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/services/posthog.server', () => ({
  posthog: { capture, alias },
}));
const assertHeadroom = mock();
mock.module('./usage-budget.server', () => ({
  assertFreeTierBudgetHeadroomForTransition: assertHeadroom,
  FreeTierBudgetExceededError: class extends Error {},
  freeTierApplicationConsumesBudget: () => false,
  countFreeTierActiveApplications: async () => 0,
  freeTierBudgetRemainingActivations: () => 100,
  readFreeTierUsageSummary: async () => ({}),
}));
const { redeemToken, submitWaitlist, recordAcquisitionTokenScan } =
  await import('./service.server');
const input = {
  name: 'Local teacher',
  email: 'teacher@yawp.local',
  schoolName: 'Local fixture',
  location: 'Local',
  gradeLevel: '10',
};
beforeEach(() => {
  capture.mockReset();
  alias.mockReset();
  assertHeadroom.mockReset();
  for (const model of Object.values(prisma)) {
    if (typeof model === 'object')
      for (const fn of Object.values(model)) fn.mockReset();
  }
  prisma.$executeRaw.mockReset();
  prisma.$executeRaw.mockResolvedValue(1);
  prisma.$transaction.mockImplementation(async (work: any) =>
    typeof work === 'function' ? work(prisma) : Promise.all(work)
  );
  prisma.acquisitionToken.findUnique.mockResolvedValue(token);
  prisma.freeTierApplication.findUnique.mockResolvedValue(null);
  prisma.freeTierApplication.createMany.mockResolvedValue({ count: 1 });
  prisma.acquisitionTokenScan.findFirst.mockResolvedValue(null);
});
test('organic signup emits once on insert; honeypot and replay do not convert', async () => {
  prisma.freeTierApplication.findUnique.mockResolvedValue({
    ...application,
    acquisitionTokenId: null,
  });
  await submitWaitlist(input);
  expect(capture).toHaveBeenCalledWith(
    expect.objectContaining({
      event: 'free_tier.signup',
      distinctId: 'free-tier-application:app-1',
      properties: expect.objectContaining({
        acquisition_channel: 'organic',
        created: true,
      }),
    })
  );
  capture.mockClear();
  prisma.freeTierApplication.createMany.mockResolvedValue({ count: 0 });
  await submitWaitlist(input);
  await submitWaitlist({ ...input, middleName: 'bot' });
  expect(capture).not.toHaveBeenCalled();
});
test('event redemption connects scan to inserted application and keeps its public contract', async () => {
  prisma.freeTierApplication.findUnique
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce(application);
  const result = await redeemToken(
    { ...input, token: 'event-code' },
    { scanDedupeCookie: 'local-scan-cookie' }
  );
  expect(result).toEqual({ ok: true, bypassWaitlist: false });
  expect(alias).toHaveBeenCalledWith({
    distinctId: expect.stringMatching(/^free-tier-token:token-1:[a-f0-9]{64}$/),
    alias: 'free-tier-application:app-1',
  });
  expect(capture).toHaveBeenCalledWith(
    expect.objectContaining({
      event: 'free_tier.signup',
      properties: expect.objectContaining({
        acquisition_channel: 'event_link',
        source_name: 'Event',
        created: true,
      }),
    })
  );
});
test('redemption replay and denied token never emit a conversion', async () => {
  prisma.freeTierApplication.findUnique.mockResolvedValue(application);
  await redeemToken({ ...input, token: 'event-code' });
  expect(capture).not.toHaveBeenCalled();
  prisma.acquisitionToken.findUnique.mockResolvedValue({
    ...token,
    disabledAt: new Date(),
  });
  expect(await redeemToken({ ...input, token: 'event-code' })).toEqual({
    ok: false,
    reason: 'disabled',
  });
  expect(capture).not.toHaveBeenCalled();
});
test('lost insert race emits no signup', async () => {
  prisma.freeTierApplication.createMany.mockResolvedValue({ count: 0 });
  await redeemToken({ ...input, token: 'event-code' });
  expect(capture).not.toHaveBeenCalled();
});
test('scan emits only after persistence and preserves dedupe', async () => {
  await recordAcquisitionTokenScan({
    tokenId: token.id,
    dedupeCookie: 'local-scan-cookie',
    userAgent: null,
  });
  expect(capture).toHaveBeenCalledWith(
    expect.objectContaining({
      event: 'free_tier.scan',
      distinctId: expect.stringMatching(/^free-tier-token:token-1:/),
    })
  );
  capture.mockClear();
  prisma.acquisitionTokenScan.findFirst.mockResolvedValue({ id: 'scan' });
  await recordAcquisitionTokenScan({
    tokenId: token.id,
    dedupeCookie: 'local-scan-cookie',
    userAgent: null,
  });
  expect(capture).not.toHaveBeenCalled();
});
test('analytics enrichment or client errors do not fail a committed signup', async () => {
  prisma.freeTierApplication.findUnique.mockRejectedValue(
    new Error('lookup unavailable')
  );
  expect(await submitWaitlist(input)).toEqual({ ok: true });
  prisma.freeTierApplication.findUnique.mockResolvedValue(application);
  capture.mockImplementation(() => {
    throw new Error('offline');
  });
  expect(await submitWaitlist(input)).toEqual({ ok: true });
});
