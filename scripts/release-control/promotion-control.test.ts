import { describe, expect, test } from 'bun:test';
import { PromotionDeniedError } from './errors';
import { MemoryPromotionStore } from './memory-store';
import { PromotionBroker, WorkerPromotionClient } from './promotion-broker';
import { PromotionControl } from './promotion-control';
import { routesBypassingRequiredChecks } from './delivery-routes';
import {
  TEST_BROKER_BINDING,
  TEST_ISSUER,
  TEST_MAIN_MERGE_BINDING,
  sampleArtifact,
  seedAllScopes,
  signTestApproval,
} from './test-helpers';

function liveControl(store: MemoryPromotionStore, binding = TEST_BROKER_BINDING) {
  return new PromotionControl({
    store,
    approvalIssuer: TEST_ISSUER,
    brokerBinding: binding,
    enforcementMode: 'live',
  });
}

function broker(nowMs = 1_000_000) {
  const store = new MemoryPromotionStore();
  seedAllScopes(store, nowMs);
  return {
    store,
    control: liveControl(store),
    nowMs,
  };
}

describe('release-control promotion library (simulated store — not forge/AWS enforced)', () => {
  test('prepare_only denies promotion paths (never fail-open)', async () => {
    const store = new MemoryPromotionStore();
    seedAllScopes(store, 0);
    const control = new PromotionControl({
      store,
      approvalIssuer: TEST_ISSUER,
      brokerBinding: TEST_BROKER_BINDING,
      enforcementMode: 'prepare_only',
    });
    await expect(control.assertNoActiveHold('prod_deploy')).rejects.toMatchObject({
      reason: 'fail_closed_unconfigured',
    });
  });

  test('fail closed on unreachable store', async () => {
    const store = new MemoryPromotionStore({ mode: 'unreachable' });
    const control = liveControl(store);
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
    const control = liveControl(store, TEST_MAIN_MERGE_BINDING);
    await expect(control.assertScopeReadable('main_merge')).rejects.toMatchObject({
      reason: 'fail_closed_malformed',
    });
  });

  test('active hold blocks grant issue', async () => {
    const { control, nowMs } = broker();
    await control.setHold({
      scope: 'prod_deploy',
      reason: 'incident',
      setBySubject: 'human:ops',
      nowMs,
    });
    const artifact = sampleArtifact();
    const token = signTestApproval({
      subject: 'human:ops',
      binding: TEST_BROKER_BINDING,
      artifact,
      generation: 1,
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

  test('generation bump invalidates previously issued grant', async () => {
    const nowMs = 1_000_001;
    const store = new MemoryPromotionStore({
      seed: {
        prod_deploy: {
          scope: 'prod_deploy',
          generation: 0,
          hold: null,
          updatedAtMs: nowMs,
        },
      },
    });
    const ctl = liveControl(store);
    const artifact = sampleArtifact('c'.repeat(40));
    const token = signTestApproval({
      subject: 'human:release',
      binding: TEST_BROKER_BINDING,
      artifact,
      generation: 0,
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
        binding: TEST_BROKER_BINDING,
        artifact,
        idempotencyKey: 'run-1',
        nowMs: nowMs + 3,
      })
    ).rejects.toMatchObject({ reason: 'grant_stale_generation' });
  });

  test('replay returns status only — no second provider permission', async () => {
    const store = new MemoryPromotionStore({
      seed: {
        prod_deploy: { scope: 'prod_deploy', generation: 0, hold: null, updatedAtMs: 0 },
      },
    });
    const control = liveControl(store);
    const artifact = sampleArtifact('f'.repeat(40));
    const nowMs = 3_000_000;
    const token = signTestApproval({
      subject: 'human:deploy',
      binding: TEST_BROKER_BINDING,
      artifact,
      generation: 0,
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
      binding: TEST_BROKER_BINDING,
      artifact,
      idempotencyKey: 'run-9/attempt-1',
      nowMs,
    });
    expect(first.providerMutationPermitted).toBe(true);
    const second = await control.consumeGrant({
      grantId: 'g-replay',
      scope: 'prod_deploy',
      binding: TEST_BROKER_BINDING,
      artifact,
      idempotencyKey: 'run-9/attempt-1',
      nowMs: nowMs + 5,
    });
    expect(second.replayStatusOnly).toBe(true);
    expect(second.providerMutationPermitted).toBe(false);
    expect(second.consumedAtMs).toBe(first.consumedAtMs);
  });

  test('merge_group green check stale after subsequent hold', async () => {
    const store = new MemoryPromotionStore({
      seed: {
        main_merge: { scope: 'main_merge', generation: 0, hold: null, updatedAtMs: 0 },
      },
    });
    const control = liveControl(store, TEST_MAIN_MERGE_BINDING);
    const checkPassedAt = 1000;
    const obsBefore = await control.evaluateMergeGateStaleCheck({
      scope: 'main_merge',
      mergeGroupCheckPassedAtMs: checkPassedAt,
      nowMs: 1001,
    });
    expect(obsBefore.staleRelativeToHold).toBe(false);

    await control.setHold({
      scope: 'main_merge',
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
  });

  test('hold requires explicit authorized release (clearHold)', async () => {
    const { control, nowMs } = broker();
    await control.setHold({
      scope: 'prod_deploy',
      reason: 'regulatory',
      setBySubject: 'human:legal',
      nowMs: 1,
    });
    await expect(control.assertNoActiveHold('prod_deploy')).rejects.toMatchObject({
      reason: 'hold_active',
    });
    await control.clearHold({
      scope: 'prod_deploy',
      clearedBySubject: 'human:legal',
      nowMs: 2,
    });
    await control.assertNoActiveHold('prod_deploy');
  });

  test('incident direct merge route bypasses required checks (inventory)', () => {
    const bypass = routesBypassingRequiredChecks();
    expect(bypass.some((r) => r.id === 'github_bypass')).toBe(true);
  });

  test('worker client cannot forge approvals', () => {
    expect(new WorkerPromotionClient({}).canForgeApproval()).toBe(false);
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
});
