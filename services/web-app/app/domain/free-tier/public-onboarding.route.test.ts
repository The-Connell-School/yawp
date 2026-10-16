import { beforeEach, expect, mock, test } from 'bun:test';
import { z } from 'zod';
const waitlistInputSchema = z.object({
  name: z.string().trim().min(1).max(200), email: z.string().trim().toLowerCase().email().max(320),
  schoolName: z.string().trim().min(1).max(200), location: z.string().trim().min(1).max(200),
  gradeLevel: z.string().trim().min(1).max(50), middleName: z.string().max(200).optional(),
}).strict();
const submit = mock(async (..._args: any[]) => ({ ok: true }));
const redeem = mock(async (..._args: any[]) => ({ ok: true, bypassWaitlist: false }));
const decline = mock(async (..._args: any[]) => Response.json({ ok: true }));
const setting = mock(async (..._args: any[]): Promise<any> => ({ value: 'true' }));
const enabled = mock(async () => {});
const throttle = mock(async (..._args: any[]): Promise<any> => ({ allowed: true }));
const mail = mock(async () => {});
mock.module('~/utils/db.server', () => ({ prisma: { setting: { findUnique: setting } } }));
mock.module('./service.server', () => ({ waitlistInputSchema,
  redeemInputSchema: waitlistInputSchema.omit({ middleName: true }).extend({ token: z.string().min(1).max(500) }),
  submitWaitlist: submit, redeemToken: redeem, normalizeEmail: (s: string) => s.trim().toLowerCase(),
  hashToken: (s: string) => s, checkTokenValidity: async () => ({ valid: true }),
  findAcquisitionTokenByCredential: async () => null, recordAcquisitionTokenScan: async () => {},
}));
mock.module('./grade-gate.server', () => ({ recordBelowHsDecline: decline }));
mock.module('./approval-flow.server', () => ({ sendReleaseEmailsForApplicationIds: mail }));
mock.module('~/utils/free-tier/free-tier-feature-gate.server', () => ({ requireFreeTierEnabled: enabled }));
mock.module('~/utils/rate-limit.server', () => ({ enforceUnauthByIpAndTarget: throttle }));
const landing = await import('~/routes/free._index/route');
const waitlist = await import('~/routes/api.free-tier.waitlist/route');
const token = await import('~/routes/api.free-tier.token/route');
const fields = { name: 'Teacher', email: '  TEACHER@example.edu  ', schoolName: 'Demo High', location: 'Here' };
const paths = ['free', 'waitlist', 'token'] as const;
async function post(path: typeof paths[number], gradeLevel: unknown, extra: object = {}) {
  const input = { ...fields, gradeLevel, ...(path === 'token' ? { token: 'event' } : {}), ...extra };
  const request = path === 'free'
    ? new Request('http://localhost/free?index', { method: 'POST', body: new URLSearchParams(Object.entries(input).filter(([,v]) => v !== undefined).map(([k,v]) => [k, String(v)])) })
    : new Request(`http://localhost/api/free-tier/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
  const result = await (path === 'free' ? landing : path === 'token' ? token : waitlist).action({ request } as never);
  return result instanceof Response ? { status: result.status, body: await result.json().catch(() => null) } : { status: 200, body: result };
}
beforeEach(() => {
  setting.mockReset().mockResolvedValue({ value: 'true' });
  submit.mockClear(); redeem.mockClear(); decline.mockClear(); mail.mockClear();
  throttle.mockReset().mockResolvedValue({ allowed: true }); enabled.mockClear();
});
for (const path of paths) {
  for (const grade of ['9', '10', '11', '12']) test(`${path}: everyone admits explicit ${grade} with original copy context`, async () => {
    expect((await post(path, grade)).body.ok).toBe(true);
    expect(decline).not.toHaveBeenCalled();
    expect(path === 'token' ? redeem : submit).toHaveBeenCalledWith(expect.objectContaining({ gradeLevel: grade, email: 'teacher@example.edu' }), expect.objectContaining({ onboardingV2: true }));
  });
  for (const grade of ['K', '1', '8']) test(`${path}: explicit ${grade} records decline before admission`, async () => {
    expect((await post(path, grade)).body).toEqual(path === 'free' ? { ok: true, declined: true } : { ok: true });
    expect(decline).toHaveBeenCalledWith(expect.objectContaining({ gradeLevel: grade, email: 'teacher@example.edu', ...(path === 'token' ? { token: 'event' } : {}) }));
    expect(submit).not.toHaveBeenCalled(); expect(redeem).not.toHaveBeenCalled(); expect(mail).not.toHaveBeenCalled();
  });
  for (const grade of [undefined, '', 'mixed', '7th grade', '9–12', '13', '09', '9,10']) test(`${path}: enabled gate rejects ${String(grade)}`, async () => {
    const result = await post(path, grade);
    expect(result.body.ok).not.toBe(true);
    expect(submit).not.toHaveBeenCalled(); expect(redeem).not.toHaveBeenCalled(); expect(decline).not.toHaveBeenCalled();
  });
  for (const flag of ['false', 'targeted', 'missing', 'unreadable']) test(`${path}: ${flag} preserves legacy grade behavior`, async () => {
    if (flag === 'unreadable') setting.mockRejectedValue(new Error('local unreadable setting'));
    else setting.mockResolvedValue(flag === 'missing' ? null : { value: flag === 'targeted' ? JSON.stringify({ mode: 'targeted', orgIds: ['default-org'] }) : flag });
    const input = { ...fields, email: 'teacher@example.edu' };
    expect((await post(path, '7th grade', input)).body.ok).toBe(true);
    expect(decline).not.toHaveBeenCalled();
    const calls = (path === 'token' ? redeem : submit).mock.calls;
    expect(calls[0]?.[1]?.onboardingV2).not.toBe(true);
  });
  test(`${path}: throttling prevents decline and admission`, async () => {
    throttle.mockResolvedValue({ allowed: false, retryAfterSeconds: 30 });
    await post(path, '7');
    expect(submit).not.toHaveBeenCalled(); expect(redeem).not.toHaveBeenCalled(); expect(decline).not.toHaveBeenCalled();
  });
  test(`${path}: honeypot reveals nothing and stores nothing`, async () => {
    expect((await post(path, '7', { middleName: 'bot' })).body).toEqual({ ok: true });
    expect(submit).not.toHaveBeenCalled(); expect(redeem).not.toHaveBeenCalled(); expect(decline).not.toHaveBeenCalled();
  });
}
for (const path of ['waitlist', 'token'] as const) {
  for (const grade of [9, null, ['9'], { grade: '9' }]) test(`${path}: typed malformed grade rejected`, async () => {
    expect((await post(path, grade)).status).toBe(400);
    expect(submit).not.toHaveBeenCalled(); expect(redeem).not.toHaveBeenCalled(); expect(decline).not.toHaveBeenCalled();
  });
}
test('form token decline passes only validated credential, never calls admission/mail', async () => {
  expect((await post('free', '7', { intent: 'redeem', token: 'event' })).body).toEqual({ ok: true, declined: true });
  expect(decline).toHaveBeenCalledWith(expect.objectContaining({ token: 'event' }));
  expect(redeem).not.toHaveBeenCalled(); expect(mail).not.toHaveBeenCalled();
});
test('a failed decline write never shows the decline confirmation', async () => {
  decline.mockResolvedValueOnce(Response.json({ error: 'flag_off' }, { status: 409 }));
  expect((await post('free', '7')).body.ok).toBe(false);
  expect(submit).not.toHaveBeenCalled();
});
