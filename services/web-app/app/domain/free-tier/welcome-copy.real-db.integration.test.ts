import { afterAll, beforeAll, expect, test, mock } from 'bun:test';
// Capture at the only transport boundary. Never import a real provider.
const deliver = mock(async (_args: any) => ({ status: 'success' as const }));
mock.module('~/utils/email.server', () => ({ sendEmail: deliver }));
import { prisma } from '~/utils/db.server';
import { submitWaitlist, redeemToken, releaseBatch } from './service.server';
import { sendReleaseEmailsForApplicationIds } from './approval-flow.server';
const local = process.env.FREE_WELCOME_DB_TESTS === '1' ? test : test.skip;
const prefix = `welcome-copy-${Date.now()}`;
const fields = (suffix: string) => ({ name: 'Ada <Teacher>', email: `${prefix}-${suffix}@example.edu`, schoolName: 'Local High', location: 'Local', gradeLevel: '11' });
let old: any;
beforeAll(async () => {
  if (process.env.FREE_WELCOME_DB_TESTS !== '1') return;
  const url = new URL(process.env.DATABASE_URL!);
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || !(url.pathname.includes('fto-free-page') || (process.env.GITHUB_ACTIONS === 'true' && url.pathname === '/yawp_migration_ci'))) throw new Error('Dedicated local welcome database required');
  old = await prisma.setting.findUnique({ where: { name: 'feature_flag.free_tier' } });
  process.env.FREE_TIER_LINK_HMAC_SECRET = 'local-welcome-copy-tests';
  process.env.PRIMARY_APP_URL = 'http://localhost:5241';
  process.env.FREE_TIER_RELEASE_CAP = '100000';
});
afterAll(async () => {
  if (process.env.FREE_WELCOME_DB_TESTS !== '1') return;
  await prisma.freeTierApplication.deleteMany({ where: { email: { startsWith: prefix } } });
  await prisma.acquisitionToken.deleteMany({ where: { label: { startsWith: prefix } } });
  if (old) await prisma.setting.update({ where: { name: old.name }, data: { value: old.value } });
  else await prisma.setting.deleteMany({ where: { name: 'feature_flag.free_tier' } });
  await prisma.$disconnect();
});
local('original copy survives duplicates, later token admission and a flag change before delayed delivery', async () => {
  await submitWaitlist(fields('v2'), { onboardingV2: true });
  await submitWaitlist({ ...fields('v2'), name: 'Changed' });
  const v2 = await prisma.freeTierApplication.findUniqueOrThrow({ where: { email: fields('v2').email } });
  expect(v2.releaseEmailCopyVersion).toBe('free-tier-onboarding-v2'); expect(v2.name).toBe('Ada <Teacher>');
  await submitWaitlist(fields('legacy'));
  const legacy = await prisma.freeTierApplication.findUniqueOrThrow({ where: { email: fields('legacy').email } });
  expect(legacy.releaseEmailCopyVersion).toBeNull();
  await submitWaitlist(fields('legacy'), { onboardingV2: true });
  const token = await prisma.acquisitionToken.create({ data: { code: prefix, tokenHash: prefix, label: prefix, bypassWaitlist: true } });
  await redeemToken({ ...fields('legacy'), token: token.code! }, { onboardingV2: true });
  await prisma.setting.upsert({ where: { name: 'feature_flag.free_tier' }, create: { name: 'feature_flag.free_tier', value: 'false' }, update: { value: 'false' } });
  expect((await releaseBatch({ applicationIds: [v2.id] })).released).toBe(1);
  deliver.mockClear();
  expect(await sendReleaseEmailsForApplicationIds([v2.id, legacy.id])).toEqual([{ applicationId: v2.id, ok: true }, { applicationId: legacy.id, ok: true }]);
  expect(deliver.mock.calls[0][0].subject).toBe("You're in!");
  expect(deliver.mock.calls[0][0].text).toContain("\n\nYou're in!\n\n");
  expect(deliver.mock.calls[0][0].html).toContain('Ada &lt;Teacher&gt;');
  expect(deliver.mock.calls[0][0].html).not.toContain('<Teacher>');
  expect(deliver.mock.calls[1][0].subject).toBe("You're in — start your YAWP classroom");
  // Turn v2 on at delivery: the original legacy context still wins.
  await prisma.setting.update({ where: { name: 'feature_flag.free_tier' }, data: { value: 'true' } });
  await sendReleaseEmailsForApplicationIds([legacy.id]);
  expect(deliver.mock.calls.at(-1)![0].subject).toBe("You're in — start your YAWP classroom");
});
local('token-created applications persist their initial context once, under concurrent redemption', async () => {
  const token = await prisma.acquisitionToken.create({ data: { code: prefix + '-race', tokenHash: prefix + '-race', label: prefix + '-race', bypassWaitlist: false } });
  await Promise.all(Array.from({ length: 3 }, () => redeemToken({ ...fields('token'), token: token.code! }, { onboardingV2: true })));
  const row = await prisma.freeTierApplication.findUniqueOrThrow({ where: { email: fields('token').email } });
  expect(row.releaseEmailCopyVersion).toBe('free-tier-onboarding-v2');
  expect((await prisma.acquisitionToken.findUniqueOrThrow({ where: { id: token.id } })).uses).toBe(1);
  await redeemToken({ ...fields('token'), token: token.code! });
  expect((await prisma.freeTierApplication.findUniqueOrThrow({ where: { id: row.id } })).releaseEmailCopyVersion).toBe('free-tier-onboarding-v2');
});
