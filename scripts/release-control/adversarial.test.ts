import { describe, expect, test } from 'bun:test';
import { verifyApprovalToken, signApproval, HMAC_FIXTURE_ISSUER_DISCLAIMER } from './approval-verifier';
import { PromotionControl } from './promotion-control';
import { MemoryPromotionStore, MEMORY_STORE_CAS_LIMITATION } from './memory-store';
import {
  TEST_BROKER_BINDING,
  TEST_ISSUER,
  TEST_MAIN_MERGE_BINDING,
  WORKER_FORGED_SECRET,
  sampleArtifact,
  seedAllScopes,
  signTestApproval,
} from './test-helpers';

describe('release-control adversarial / contract hardening', () => {
  test('HMAC fixture issuer disclaimer is explicit (not human approval)', () => {
    expect(HMAC_FIXTURE_ISSUER_DISCLAIMER).toContain('fixture');
    expect(HMAC_FIXTURE_ISSUER_DISCLAIMER.toLowerCase()).toContain('human');
  });

  test('prepare_only never fail-open; live fails closed on missing scope', async () => {
    const store = new MemoryPromotionStore();
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
    await expect(live.assertNoActiveHold('prod_deploy')).rejects.toMatchObject({
      reason: 'fail_closed_malformed',
    });
  });

  test('deployment pause hold never auto-expires when time advances', async () => {
    const store = new MemoryPromotionStore();
    seedAllScopes(store, 0);
    const control = new PromotionControl({
      store,
      approvalIssuer: TEST_ISSUER,
      brokerBinding: TEST_BROKER_BINDING,
      enforcementMode: 'live',
    });
    const holdSetAt = 1_000;
    await control.setHold({
      scope: 'prod_deploy',
      reason: 'production paused',
      setBySubject: 'human:bryant',
      nowMs: holdSetAt,
    });
    const yearsLater = holdSetAt + 1000 * 60 * 60 * 24 * 365 * 10;
    const still = await control.holdStillActiveAfterTimeAdvance({
      scope: 'prod_deploy',
      holdSetAtMs: holdSetAt,
      nowMs: yearsLater,
    });
    expect(still).toBe(true);
    await expect(control.assertNoActiveHold('prod_deploy')).rejects.toMatchObject({
      reason: 'hold_active',
    });
  });

  test('prod_deploy grant requires image digest in approval', () => {
    const binding = TEST_BROKER_BINDING;
    const token = signApproval(TEST_ISSUER, {
      subject: 'human:release',
      binding,
      artifact: { commitSha: 'a'.repeat(40) },
      generation: 0,
      expiresAtMs: Date.now() + 60_000,
      jti: 'no-digest',
    });
    expect(token).toBeTruthy();
    const verified = verifyApprovalToken(TEST_ISSUER, token!, Date.now(), {
      brokerBinding: binding,
    });
    expect(verified.ok).toBe(false);
    if (!verified.ok) expect(verified.reason).toBe('digest_required');
  });

  test('cross-scope replay: main_merge binding cannot consume prod_deploy grant', async () => {
    const store = new MemoryPromotionStore();
    seedAllScopes(store, 0);
    const control = new PromotionControl({
      store,
      approvalIssuer: TEST_ISSUER,
      brokerBinding: TEST_BROKER_BINDING,
      enforcementMode: 'live',
    });
    const artifact = sampleArtifact('3'.repeat(40));
    const nowMs = 5_000;
    const token = signTestApproval({
      subject: 'human:release',
      binding: TEST_BROKER_BINDING,
      artifact,
      generation: 0,
      nowMs,
    });
    await control.issueGrantFromSignedApproval({
      grantId: 'cross-scope',
      signedApprovalToken: token,
      nowMs,
      grantTtlMs: 60_000,
    });
    await expect(
      control.consumeGrant({
        grantId: 'cross-scope',
        scope: 'prod_deploy',
        binding: TEST_MAIN_MERGE_BINDING,
        artifact,
        idempotencyKey: 'run-x',
        nowMs,
      })
    ).rejects.toMatchObject({ reason: 'binding_mismatch' });
  });

  test('approval with wrong generation rejected at issue', async () => {
    const store = new MemoryPromotionStore();
    seedAllScopes(store, 0);
    const control = new PromotionControl({
      store,
      approvalIssuer: TEST_ISSUER,
      brokerBinding: TEST_BROKER_BINDING,
      enforcementMode: 'live',
    });
    const artifact = sampleArtifact('4'.repeat(40));
    const token = signTestApproval({
      subject: 'human:release',
      binding: TEST_BROKER_BINDING,
      artifact,
      generation: 99,
      nowMs: 1,
    });
    await expect(
      control.issueGrantFromSignedApproval({
        grantId: 'bad-gen',
        signedApprovalToken: token,
        nowMs: 1,
        grantTtlMs: 60_000,
      })
    ).rejects.toMatchObject({ reason: 'generation_conflict' });
  });

  test('expired signed approval cannot issue grant', async () => {
    const store = new MemoryPromotionStore();
    seedAllScopes(store, 0);
    const control = new PromotionControl({
      store,
      approvalIssuer: TEST_ISSUER,
      brokerBinding: TEST_BROKER_BINDING,
      enforcementMode: 'live',
    });
    const artifact = sampleArtifact('5'.repeat(40));
    const issuedAt = 10_000;
    const token = signTestApproval({
      subject: 'human:release',
      binding: TEST_BROKER_BINDING,
      artifact,
      generation: 0,
      nowMs: issuedAt,
      ttlMs: 100,
    });
    await expect(
      control.issueGrantFromSignedApproval({
        grantId: 'exp-approval',
        signedApprovalToken: token,
        nowMs: issuedAt + 500,
        grantTtlMs: 60_000,
      })
    ).rejects.toMatchObject({ reason: 'approval_invalid' });
  });

  test('worker forged HMAC secret fails verification', () => {
    const artifact = sampleArtifact();
    const forgedIssuer = {
      issuerId: TEST_ISSUER.issuerId,
      signingSecret: () => WORKER_FORGED_SECRET,
    };
    const token = signApproval(forgedIssuer, {
      subject: 'worker:evil',
      binding: TEST_BROKER_BINDING,
      artifact,
      generation: 0,
      expiresAtMs: Date.now() + 60_000,
      jti: 'forged',
    });
    const verified = verifyApprovalToken(TEST_ISSUER, token!, Date.now(), {
      brokerBinding: TEST_BROKER_BINDING,
    });
    expect(verified.ok).toBe(false);
  });

  test('memory store CAS limitation is documented (single-process mutex only)', () => {
    expect(MEMORY_STORE_CAS_LIMITATION).toContain('single-process');
  });
});
