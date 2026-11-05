import { describe, expect, test } from 'bun:test';
import { verifyApprovalToken, signApproval } from './approval-verifier';
import { PromotionDeniedError } from './errors';
import { MemoryPromotionStore } from './memory-store';
import { PromotionBroker, WorkerPromotionClient } from './promotion-broker';
import { PromotionControl } from './promotion-control';
import { routesBypassingRequiredChecks } from './delivery-routes';
import {
  TEST_ISSUER,
  WORKER_FORGED_SECRET,
  sampleArtifact,
  seedAllScopes,
  signTestApproval,
} from './test-helpers';

function broker(nowMs = 1_000_000) {
  const store = new MemoryPromotionStore();
  seedAllScopes(store, nowMs);
  const b = new PromotionBroker({ store, approvalIssuer: TEST_ISSUER });
  return { store, control: b.control, nowMs };
}

describe('release-control promotion library (simulated store — not forge/AWS enforced)', () => {
  test('fail closed when enforcement disabled (prepare-only default)', async () => {
    const store = new MemoryPromotionStore();
    const control = new PromotionControl({
      store,
      approvalIssuer: TEST_ISSUER,
      enforcementEnabled: false,
    });
    await expect(control.assertNoActiveHold('main_merge')).rejects.toMatchObject({
      reason: 'fail_closed_unconfigured',
    });
  });

  test('fail closed on unreachable store', async () => {
    const store = new MemoryPromotionStore({ mode: 'unreachable' });
    const control = new PromotionControl({
      store,
      approvalIssuer: TEST_ISSUER,
      enforcementEnabled: true,
    });
    await expect(control.assertNoActiveHold('prod_deploy')).rejects.toMatchObject({
      reason: 'fail_closed_unreachable',
    });
  });

  test('fail closed on malformed scope record', async () => {
    const store = new MemoryPromotionStore({
      seed: {
        main_merge: {
          scope: 'main_merge',
          generation: -1,
          hold: null,
          updatedAtMs: 0,
        },
      },
    });
    const control = new PromotionControl({
      store,
      approvalIssuer: TEST_ISSUER,
      enforcementEnabled: true,
    });
    await expect(control.assertScopeReadable('main_merge')).rejects.toMatchObject({
      reason: 'fail_closed_malformed',
    });
  });

  test('missing scope fails closed when enforcement expects initialized table', async () => {
    const store = new MemoryPromotionStore();
    const control = new PromotionControl({
      store,
      approvalIssuer: TEST_ISSUER,
      enforcementEnabled: true,
    });
    await expect(control.assertScopeReadable('main_merge')).rejects.toMatchObject({
      reason: 'fail_closed_malformed',
    });
  });

  test('active hold blocks grant issue and consume', async () => {
    const { control, nowMs } = broker();
    await control.setHold({
      scope: 'prod_deploy',
      permanent: false,
      reason: 'incident',
      setBySubject: 'human:ops',
      nowMs,
    });
    const artifact = sampleArtifact();
    const token = signTestApproval({
      subject: 'human:ops',
      scope: 'prod_deploy',
      artifact,
      nowMs,
    });
    await expect(
      control.issueGrantFromSignedApproval({
        grantId: 'g1',
        signedApprovalToken: token,
        nowMs,
        grantTtlMs: 30_000,
      })
    ).rejects.toMatchObject({ reason: 'hold_active' });
  });

  test('generation bump on hold invalidates previously issued grant', async () => {
    const nowMs = 1_000_001;
    const seeded = new MemoryPromotionStore({
      seed: {
        prod_deploy: {
          scope: 'prod_deploy',
          generation: 0,
          hold: null,
          updatedAtMs: nowMs,
        },
      },
    });
    const ctl = new PromotionControl({
      store: seeded,
      approvalIssuer: TEST_ISSUER,
      enforcementEnabled: true,
    });
    const artifact = sampleArtifact('c'.repeat(40));
    const token = signTestApproval({
      subject: 'human:release',
      scope: 'prod_deploy',
      artifact,
      nowMs,
    });
    await ctl.issueGrantFromSignedApproval({
      grantId: 'g-old',
      signedApprovalToken: token,
      nowMs,
      grantTtlMs: 60_000,
    });
    await ctl.setHold({
      scope: 'prod_deploy',
      permanent: false,
      reason: 'stop ship',
      setBySubject: 'human:ops',
      nowMs: nowMs + 1,
    });
    await ctl.clearHold({
      scope: 'prod_deploy',
      clearedBySubject: 'human:ops',
      nowMs: nowMs + 2,
    });
    await expect(
      ctl.consumeGrant({
        grantId: 'g-old',
        scope: 'prod_deploy',
        artifact,
        idempotencyKey: 'run-1',
        nowMs: nowMs + 3,
      })
    ).rejects.toMatchObject({ reason: 'grant_stale_generation' });
  });

  test('expired grant cannot be consumed', async () => {
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
    const artifact = sampleArtifact('d'.repeat(40));
    const nowMs = 1_000_000;
    const token = signTestApproval({
      subject: 'human:merge',
      scope: 'main_merge',
      artifact,
      nowMs,
      ttlMs: 100,
    });
    await control.issueGrantFromSignedApproval({
      grantId: 'g-exp',
      signedApprovalToken: token,
      nowMs,
      grantTtlMs: 100,
    });
    await expect(
      control.consumeGrant({
        grantId: 'g-exp',
        scope: 'main_merge',
        artifact,
        idempotencyKey: 'run-1',
        nowMs: nowMs + 200,
      })
    ).rejects.toMatchObject({ reason: 'grant_expired' });
  });

  test('single-use grant rejects second idempotency key', async () => {
    const store = new MemoryPromotionStore({
      seed: {
        prod_flags: { scope: 'prod_flags', generation: 0, hold: null, updatedAtMs: 0 },
      },
    });
    const control = new PromotionControl({
      store,
      approvalIssuer: TEST_ISSUER,
      enforcementEnabled: true,
    });
    const artifact = sampleArtifact('e'.repeat(40));
    const nowMs = 2_000_000;
    const token = signTestApproval({
      subject: 'human:flags',
      scope: 'prod_flags',
      artifact,
      nowMs,
    });
    await control.issueGrantFromSignedApproval({
      grantId: 'g-once',
      signedApprovalToken: token,
      nowMs,
      grantTtlMs: 60_000,
    });
    await control.consumeGrant({
      grantId: 'g-once',
      scope: 'prod_flags',
      artifact,
      idempotencyKey: 'run-1/attempt-1',
      nowMs,
    });
    await expect(
      control.consumeGrant({
        grantId: 'g-once',
        scope: 'prod_flags',
        artifact,
        idempotencyKey: 'run-2/attempt-1',
        nowMs: nowMs + 1,
      })
    ).rejects.toMatchObject({ reason: 'grant_already_consumed' });
  });

  test('retry/replay with same idempotency key succeeds', async () => {
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
    const artifact = sampleArtifact('f'.repeat(40));
    const nowMs = 3_000_000;
    const token = signTestApproval({
      subject: 'human:deploy',
      scope: 'prod_deploy',
      artifact,
      nowMs,
    });
    await control.issueGrantFromSignedApproval({
      grantId: 'g-replay',
      signedApprovalToken: token,
      nowMs,
      grantTtlMs: 60_000,
    });
    const first = await control.consumeGrant({
      grantId: 'g-replay',
      scope: 'prod_deploy',
      artifact,
      idempotencyKey: 'run-9/attempt-1',
      nowMs,
    });
    const second = await control.consumeGrant({
      grantId: 'g-replay',
      scope: 'prod_deploy',
      artifact,
      idempotencyKey: 'run-9/attempt-1',
      nowMs: nowMs + 5,
    });
    expect(second.replay).toBe(true);
    expect(second.consumedAtMs).toBe(first.consumedAtMs);
  });

  test('wrong commit SHA or digest rejected at consume', async () => {
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
    const artifact = sampleArtifact('1'.repeat(40));
    const nowMs = 4_000_000;
    const token = signTestApproval({
      subject: 'human:deploy',
      scope: 'prod_deploy',
      artifact,
      nowMs,
    });
    await control.issueGrantFromSignedApproval({
      grantId: 'g-art',
      signedApprovalToken: token,
      nowMs,
      grantTtlMs: 60_000,
    });
    await expect(
      control.consumeGrant({
        grantId: 'g-art',
        scope: 'prod_deploy',
        artifact: { ...artifact, commitSha: '2'.repeat(40) },
        idempotencyKey: 'run-1',
        nowMs,
      })
    ).rejects.toMatchObject({ reason: 'artifact_mismatch' });
  });

  test('worker forging approval signature fails verification', () => {
    const artifact = sampleArtifact();
    const forgedIssuer = {
      issuerId: TEST_ISSUER.issuerId,
      signingSecret: () => WORKER_FORGED_SECRET,
    };
    const token = signApproval(forgedIssuer, {
      subject: 'worker:evil',
      scope: 'main_merge',
      artifact,
      expiresAtMs: Date.now() + 60_000,
      jti: 'forged',
    });
    expect(token).toBeTruthy();
    const verified = verifyApprovalToken(TEST_ISSUER, token!, Date.now());
    expect(verified.ok).toBe(false);
    if (!verified.ok) expect(verified.reason).toBe('bad_signature');
  });

  test('issueGrantFromWorkerApprovalRef always rejects', async () => {
    const { control, nowMs } = broker();
    await expect(
      control.issueGrantFromWorkerApprovalRef({
        grantId: 'g-forge',
        approvalRef: 'LGTM from worker',
        scope: 'main_merge',
        artifact: sampleArtifact(),
        nowMs,
      })
    ).rejects.toBeInstanceOf(PromotionDeniedError);
  });

  test('merge_group green check stale after subsequent hold', async () => {
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
    const checkPassedAt = 1000;
    const obsBefore = await control.evaluateMergeGateStaleCheck({
      scope: 'main_merge',
      mergeGroupCheckPassedAtMs: checkPassedAt,
      nowMs: 1001,
    });
    expect(obsBefore.staleRelativeToHold).toBe(false);
    expect(obsBefore.mergeAllowedByHoldState).toBe(true);

    await control.setHold({
      scope: 'main_merge',
      permanent: false,
      reason: 'halt',
      setBySubject: 'human:ops',
      nowMs: 2000,
    });
    const obsAfter = await control.evaluateMergeGateStaleCheck({
      scope: 'main_merge',
      mergeGroupCheckPassedAtMs: checkPassedAt,
      nowMs: 2001,
    });
    expect(obsAfter.staleRelativeToHold).toBe(true);
    expect(obsAfter.mergeAllowedByHoldState).toBe(false);
  });

  test('hold after grant consume documents TOCTOU / in-flight semantics', () => {
    const { control } = broker();
    const note = control.describeConsumeThenHoldRace({
      consumeAtMs: 5000,
      holdAtMs: 5001,
    });
    expect(note?.inFlightOperationMayStillComplete).toBe(true);
  });

  test('permanent hold cannot clear without force', async () => {
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
    await control.setHold({
      scope: 'prod_deploy',
      permanent: true,
      reason: 'regulatory',
      setBySubject: 'human:legal',
      nowMs: 1,
    });
    await expect(
      control.clearHold({
        scope: 'prod_deploy',
        clearedBySubject: 'human:ops',
        nowMs: 2,
      })
    ).rejects.toMatchObject({ reason: 'hold_permanent' });
    const gen = await control.clearHold({
      scope: 'prod_deploy',
      clearedBySubject: 'human:legal',
      nowMs: 3,
      forceClearPermanent: true,
    });
    expect(gen).toBeGreaterThan(0);
  });

  test('incident direct merge route bypasses required checks (documented inventory)', () => {
    const bypass = routesBypassingRequiredChecks();
    expect(bypass.some((r) => r.id === 'github_bypass')).toBe(true);
    expect(bypass.some((r) => r.id === 'aws_direct')).toBe(true);
  });

  test('worker client cannot forge approvals', () => {
    const client = new WorkerPromotionClient({});
    expect(client.canForgeApproval()).toBe(false);
  });
});
