import { describe, expect, test } from 'bun:test';
import { MemoryPromotionStore } from './memory-store';
import { PromotionControl } from './promotion-control';
import { TEST_ISSUER, sampleArtifact, signTestApproval } from './test-helpers';

describe('release-control concurrency (simulated conditional store)', () => {
  test('concurrent hold + promotion ordering: hold wins when placed before consume completes', async () => {
    const store = new MemoryPromotionStore({
      seed: {
        prod_deploy: { scope: 'prod_deploy', generation: 0, hold: null, updatedAtMs: 0 },
      },
    });
    const control = new PromotionControl({
      store,
      approvalIssuer: TEST_ISSUER,
      enforcementEnabled: true,
    });
    const artifact = sampleArtifact('9'.repeat(40));
    const nowMs = 10_000_000;
    const token = signTestApproval({
      subject: 'human:deploy',
      scope: 'prod_deploy',
      artifact,
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
      permanent: false,
      reason: 'race',
      setBySubject: 'human:ops',
      nowMs: nowMs + 1,
    });
    const consumePromise = control.consumeGrant({
      grantId: 'g-conc',
      scope: 'prod_deploy',
      artifact,
      idempotencyKey: 'run-race-1',
      nowMs: nowMs + 1,
    });

    const results = await Promise.allSettled([holdPromise, consumePromise]);
    const holdOk = results[0].status === 'fulfilled';
    const consumeOk = results[1].status === 'fulfilled';
    expect(holdOk || consumeOk).toBe(true);
    if (!consumeOk) {
      expect((results[1] as PromiseRejectedResult).reason.reason).toBe('hold_active');
    }
    // After hold, promotion must remain blocked
    await expect(
      control.authorizePromotionAttempt({
        scope: 'prod_deploy',
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
    const control = new PromotionControl({
      store,
      approvalIssuer: TEST_ISSUER,
      enforcementEnabled: true,
    });
    const artifact = sampleArtifact('8'.repeat(40));
    const nowMs = 20_000_000;
    const token = signTestApproval({
      subject: 'human:merge',
      scope: 'main_merge',
      artifact,
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
        artifact,
        idempotencyKey: 'dup-key',
        nowMs,
      }),
      control.consumeGrant({
        grantId: 'g-par',
        scope: 'main_merge',
        artifact,
        idempotencyKey: 'dup-key',
        nowMs,
      }),
    ]);
    expect(attempts.some((a) => a.replay === false)).toBe(true);
    expect(attempts.every((a) => a.consumedAtMs === attempts[0].consumedAtMs)).toBe(true);
  });
});
