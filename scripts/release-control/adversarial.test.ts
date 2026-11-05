import { describe, expect, test } from 'bun:test';
import { HMAC_FIXTURE_ISSUER_DISCLAIMER, verifyApprovalToken, signApproval } from './approval-verifier';
import { PromotionControl } from './promotion-control';
import { MemoryPromotionCasStore, MEMORY_STORE_CAS_LIMITATION } from './memory-cas-store';
import {
  TEST_BROKER_BINDING,
  TEST_ISSUER,
  TEST_MAIN_MERGE_BINDING,
  WORKER_FORGED_SECRET,
  liveBroker,
  sampleArtifact,
  seedAllScopes,
  signTestApproval,
} from './test-helpers';

describe('release-control adversarial (simulated)', () => {
  test('HMAC fixture is not human approval', () => {
    expect(HMAC_FIXTURE_ISSUER_DISCLAIMER).toMatch(/fixture|human/i);
  });

  test('prepare_only vs live fail-closed', async () => {
    const store = new MemoryPromotionCasStore();
    seedAllScopes(store, 0);
    const prepare = new PromotionControl({
      store,
      approvalIssuer: TEST_ISSUER,
      brokerBinding: TEST_BROKER_BINDING,
      enforcementMode: 'prepare_only',
    });
    await expect(prepare.assertNoActiveHold('prod_deploy')).rejects.toMatchObject({
      reason: 'fail_closed_unconfigured',
    });
    const live = new PromotionControl({
      store,
      approvalIssuer: TEST_ISSUER,
      brokerBinding: TEST_BROKER_BINDING,
      enforcementMode: 'live',
    });
    await expect(live.assertNoActiveHold('prod_deploy')).resolves.toBeUndefined();
  });

  test('hold survives +10y wall clock', async () => {
    const { broker, nowMs } = liveBroker();
    await broker.promotion.setHold({
      scope: 'prod_deploy',
      reason: 'production paused',
      setBySubject: 'human:bryant',
      nowMs,
    });
    const yearsLater = nowMs + 1000 * 60 * 60 * 24 * 365 * 10;
    expect(
      await broker.promotion.holdStillActiveAfterTimeAdvance({
        scope: 'prod_deploy',
        holdSetAtMs: nowMs,
        nowMs: yearsLater,
      })
    ).toBe(true);
  });

  test('prod_deploy requires digest in signed approval', () => {
    const token = signApproval(TEST_ISSUER, {
      subject: 'human:release',
      binding: TEST_BROKER_BINDING,
      artifact: { commitSha: 'a'.repeat(40) },
      generation: 0,
      expiresAtMs: Date.now() + 60_000,
      jti: 'x',
    });
    const verified = verifyApprovalToken(TEST_ISSUER, token!, Date.now(), {
      brokerBinding: TEST_BROKER_BINDING,
    });
    expect(verified.ok).toBe(false);
  });

  test('cross binding rejected at issue/consume', async () => {
    const { broker, nowMs } = liveBroker();
    const artifact = sampleArtifact('4'.repeat(40));
    const token = signTestApproval({
      subject: 'human:release',
      binding: TEST_MAIN_MERGE_BINDING,
      artifact: { commitSha: artifact.commitSha },
      generation: 0,
      nowMs,
    });
    await expect(
      broker.promotion.issueGrantFromSignedApproval({
        grantId: 'wrong-bind',
        signedApprovalToken: token,
        nowMs,
        grantTtlMs: 60_000,
      })
    ).rejects.toMatchObject({ reason: 'binding_mismatch' });
  });

  test('memory store CAS limitation exported', () => {
    expect(MEMORY_STORE_CAS_LIMITATION).toContain('single-process');
  });

  test('forged worker HMAC fails', () => {
    const token = signApproval(
      { issuerId: TEST_ISSUER.issuerId, signingSecret: () => WORKER_FORGED_SECRET },
      {
        subject: 'worker:evil',
        binding: TEST_BROKER_BINDING,
        artifact: sampleArtifact(),
        generation: 0,
        expiresAtMs: Date.now() + 60_000,
        jti: 'bad',
      }
    );
    expect(verifyApprovalToken(TEST_ISSUER, token!, Date.now(), { brokerBinding: TEST_BROKER_BINDING }).ok).toBe(
      false
    );
  });
});
