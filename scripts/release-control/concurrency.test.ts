import { describe, expect, test } from 'bun:test';
import { MemoryPromotionStore } from './memory-store';
import { PromotionControl } from './promotion-control';
import {
  TEST_BROKER_BINDING,
  TEST_ISSUER,
  sampleArtifact,
  seedAllScopes,
  signTestApproval,
} from './test-helpers';

describe('release-control concurrency (simulated conditional store)', () => {
  test('concurrent hold + promotion ordering', async () => {
    const store = new MemoryPromotionStore({
      seed: {
        prod_deploy: { scope: 'prod_deploy', generation: 0, hold: null, updatedAtMs: 0 },
      },
    });
    const control = new PromotionControl({
      store,
      approvalIssuer: TEST_ISSUER,
      brokerBinding: TEST_BROKER_BINDING,
      enforcementMode: 'live',
    });
    const artifact = sampleArtifact('9'.repeat(40));
    const nowMs = 10_000_000;
    const token = signTestApproval({
      subject: 'human:deploy',
      binding: TEST_BROKER_BINDING,
      artifact,
      generation: 0,
      nowMs,
    });
    await control.issueGrantFromSignedApproval({
      grantId: 'g-conc',
      signedApprovalToken: token,
      nowMs,
      grantTtlMs: 120_000,
    });

    const holdPromise = control.setHold({
      scope: 'prod_deploy',
      reason: 'race',
      setBySubject: 'human:ops',
      nowMs: nowMs + 1,
    });
    const consumePromise = control.consumeGrant({
      grantId: 'g-conc',
      scope: 'prod_deploy',
      binding: TEST_BROKER_BINDING,
      artifact,
      idempotencyKey: 'run-race-1',
      nowMs: nowMs + 1,
    });

    const results = await Promise.allSettled([holdPromise, consumePromise]);
    if (results[1].status === 'rejected') {
      expect(['hold_active', 'grant_stale_generation']).toContain(
        (results[1] as PromiseRejectedResult).reason.reason
      );
    }
    await expect(
      control.authorizePromotionAttempt({
        scope: 'prod_deploy',
        binding: TEST_BROKER_BINDING,
        artifact,
        grantId: 'g-conc',
        idempotencyKey: 'run-race-2',
        nowMs: nowMs + 5,
      })
    ).rejects.toMatchObject({ reason: 'hold_active' });
  });

  test('parallel consume with same idempotency key is replay-safe', async () => {
    const store = new MemoryPromotionStore({
      seed: {
        main_merge: { scope: 'main_merge', generation: 0, hold: null, updatedAtMs: 0 },
      },
    });
    const binding = {
      environment: 'production' as const,
      repository: 'The-Connell-School/yawp',
      operation: 'main_merge' as const,
    };
    const control = new PromotionControl({
      store,
      approvalIssuer: TEST_ISSUER,
      brokerBinding: binding,
      enforcementMode: 'live',
    });
    const artifact = { commitSha: '8'.repeat(40) };
    const nowMs = 20_000_000;
    const token = signTestApproval({
      subject: 'human:merge',
      binding,
      artifact,
      generation: 0,
      nowMs,
    });
    await control.issueGrantFromSignedApproval({
      grantId: 'g-par',
      signedApprovalToken: token,
      nowMs,
      grantTtlMs: 120_000,
    });

    const attempts = await Promise.all([
      control.consumeGrant({
        grantId: 'g-par',
        scope: 'main_merge',
        binding,
        artifact,
        idempotencyKey: 'dup-key',
        nowMs,
      }),
      control.consumeGrant({
        grantId: 'g-par',
        scope: 'main_merge',
        binding,
        artifact,
        idempotencyKey: 'dup-key',
        nowMs,
      }),
    ]);
    const permittedCount = attempts.filter((a) => a.providerMutationPermitted).length;
    expect(permittedCount).toBe(1);
  });
});
