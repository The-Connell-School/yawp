import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';
const sendReleaseEmailsForApplicationIds = mock(async () => []);
const approved = mock(async () => {});
const rejected = mock(async () => {});
mock.module('./approval-flow.server', () => ({ sendReleaseEmailsForApplicationIds }));
mock.module('./approval-hooks.server', () => ({
  ensureFreeTierProductionApprovalHooks: async () => {},
  getApprovalHooks: () => ({ onApplicationApproved: approved, onApplicationRejected: rejected }),
}));
const enabled = process.env.FREE_TIER_DB_TESTS === '1';
const suite = enabled ? describe : describe.skip;
const prisma = enabled ? (await import('~/utils/db.server')).prisma : null;
const http = enabled ? await import('~/utils/internal-free-tier-http.server') : null;
const auth = enabled ? await import('~/utils/internal-platform-auth.server') : null;
const run = Math.random().toString(36).slice(2, 8);
const actorEmail = `caps-${run}@yawp.local`;
const secret = 'local-only-cap-test-key-01234567890123456789';
const keys = ['FREE_TIER_RELEASE_CAP', 'FREE_TIER_BUDGET_ENVIRONMENT', 'FREE_TIER_PREVIEW_BUDGET_USD',
  'FREE_TIER_PREVIEW_UNIT_COST_USD', 'YAWP_INTERNAL_API_KEYS', 'INTERNAL_API_NONCE_STORE'];
const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
beforeAll(async () => {
  if (!enabled) return;
  await (await import('./free-tier-integration-flag.server')).enableFreeTierFlagForIntegrationTests();
  process.env.YAWP_INTERNAL_API_KEYS = JSON.stringify([{ id: 'local-caps', secret, scopes: ['management:write'] }]);
  process.env.INTERNAL_API_NONCE_STORE = 'memory';
});
afterAll(async () => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  if (!enabled) return;
  await prisma!.internalPlatformApiAudit.deleteMany({ where: { actorEmail } });
  await prisma!.freeTierApplication.deleteMany({ where: { email: { startsWith: `operator-caps-${run}-` } } });
  auth!.resetInternalApiMemoryNonceStore();
});
suite('operator cap denials persist without charged side effects', () => {
  for (const reason of ['cap_reached', 'budget_exceeded'] as const) {
    for (const operation of ['release', 'reopen'] as const) {
      test(`signed ${operation} persists ${reason} denial`, async () => {
        sendReleaseEmailsForApplicationIds.mockClear(); approved.mockClear(); rejected.mockClear();
        const app = await prisma!.freeTierApplication.create({ data: {
          email: `operator-caps-${run}-${operation}-${reason}@yawp.local`, name: 'Local operator cap test',
          schoolName: 'Local demo', location: 'Austin', gradeLevel: '10', status: operation === 'release' ? 'LEAD' : 'REJECTED',
        } });
        const { readFreeTierUsageSummary } = await import('./usage-budget.server');
        const active = (await readFreeTierUsageSummary()).activeApplications;
        process.env.FREE_TIER_RELEASE_CAP = String(active + (reason === 'cap_reached' ? 0 : 10));
        process.env.FREE_TIER_BUDGET_ENVIRONMENT = 'preview';
        process.env.FREE_TIER_PREVIEW_UNIT_COST_USD = '1';
        process.env.FREE_TIER_PREVIEW_BUDGET_USD = String(active + (reason === 'budget_exceeded' ? 0 : 10));
        const body = JSON.stringify(operation === 'release' ? { applicationIds: [app.id] } : { decidedByEmail: actorEmail });
        const url = operation === 'release' ? 'http://localhost/api/internal/v1/free-tier/release'
          : `http://localhost/api/internal/v1/free-tier/approval/${app.id}/reopen`;
        const signed = auth!.signInternalApiRequest({ method: 'POST', url, body, keyId: 'local-caps', secret, actor: actorEmail });
        const request = new Request(url, { method: 'POST', headers: { ...signed.headers, 'content-type': 'application/json' }, body });
        const result = operation === 'release' ? await http!.releaseBatchHttp(request) : await http!.reopenHttp(request);
        expect(result.status).toBe(reason === 'budget_exceeded' ? 402 : operation === 'reopen' ? 409 : 200);
        const payload = await result.json();
        if (operation === 'release' && reason === 'cap_reached') expect(payload).toMatchObject({ released: 0, refused: 1, skipped: 0 });
        else expect(payload.error).toBe(reason === 'cap_reached' ? 'Release cap reached' : 'Free-tier budget reached');
        const rows = await prisma!.internalPlatformApiAudit.findMany({ where: { actorEmail, result: 'denied' }, orderBy: { createdAt: 'desc' } });
        const denial = rows.find((row) => row.action?.includes(operation));
        expect(denial).toBeDefined();
        expect((denial!.metadata as { reason: string }).reason).toBe(operation === 'release' ? reason : reason === 'cap_reached' ? 'Release cap reached' : 'Free-tier budget reached');
        expect(await prisma!.freeTierApplication.findUnique({ where: { id: app.id } })).toEqual(app);
        expect(await prisma!.freeTierApprovalDecision.count({ where: { applicationId: app.id } })).toBe(0);
        expect(await prisma!.freeTierSignedLink.count({ where: { applicationId: app.id } })).toBe(0);
        expect(await prisma!.freeTierEmailLog.count({ where: { applicationId: app.id } })).toBe(0);
        expect(sendReleaseEmailsForApplicationIds).not.toHaveBeenCalled();
        expect(approved).not.toHaveBeenCalled(); expect(rejected).not.toHaveBeenCalled();
        if (process.env.FREE_TIER_CAPS_EVIDENCE_DIR) {
          writeFileSync(join(process.env.FREE_TIER_CAPS_EVIDENCE_DIR, `operator-${operation}-${reason}.json`), JSON.stringify({
            request: { method: 'POST', path: new URL(url).pathname, body: JSON.parse(body) },
            response: { status: result.status, body: payload },
            application: { before: { status: app.status, releasedAt: app.releasedAt }, after: { status: app.status, releasedAt: app.releasedAt }, unchanged: true },
            audit: { action: denial!.action, result: denial!.result, metadata: denial!.metadata },
            sideEffects: { approvalDecisions: 0, signedLinks: 0, emailLogs: 0, emailCalls: 0, approvalHooks: 0 },
          }, null, 2));
        }
      });
    }
  }
});
