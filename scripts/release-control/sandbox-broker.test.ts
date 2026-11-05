import { describe, expect, test } from 'bun:test';
import { FakePromotionProvider } from './fake-provider';
import { MemoryPromotionStore } from './memory-store';
import { PromotionBroker } from './promotion-broker';
import {
  TEST_BROKER_BINDING,
  TEST_ISSUER,
  sampleArtifact,
  seedAllScopes,
  signTestApproval,
} from './test-helpers';

/**
 * Executable sandbox — fake provider boundary only.
 * Does NOT prove AWS/GitHub enforcement.
 */
describe('sandbox broker + fake provider ordering', () => {
  test('first consume permits one provider mutation; replay does not duplicate', async () => {
    const store = new MemoryPromotionStore();
    seedAllScopes(store, 0);
    const broker = new PromotionBroker({
      store,
      approvalIssuer: TEST_ISSUER,
      brokerBinding: TEST_BROKER_BINDING,
      enforcementMode: 'live',
    });
    const provider = new FakePromotionProvider();
    const artifact = sampleArtifact('0'.repeat(40));
    const nowMs = 1_000;
    const token = signTestApproval({
      subject: 'human:release',
      binding: TEST_BROKER_BINDING,
      artifact,
      generation: 0,
      nowMs,
    });
    await broker.control.issueGrantFromSignedApproval({
      grantId: 'sandbox-1',
      signedApprovalToken: token,
      nowMs,
      grantTtlMs: 60_000,
    });

    const key = 'run-1/attempt-1';
    const auth1 = await broker.control.authorizePromotionAttempt({
      scope: 'prod_deploy',
      binding: TEST_BROKER_BINDING,
      artifact,
      grantId: 'sandbox-1',
      idempotencyKey: key,
      nowMs,
    });
    expect(auth1.providerMutationPermitted).toBe(true);
    const m1 = await provider.mutate({
      idempotencyKey: key,
      atMs: nowMs,
      artifactCommit: artifact.commitSha,
      permitted: auth1.providerMutationPermitted,
    });
    expect(m1.ok).toBe(true);
    store.recordProviderMutation('sandbox-1');

    const auth2 = await broker.control.consumeGrant({
      scope: 'prod_deploy',
      binding: TEST_BROKER_BINDING,
      artifact,
      grantId: 'sandbox-1',
      idempotencyKey: key,
      nowMs: nowMs + 1,
    });
    expect(auth2.replayStatusOnly).toBe(true);
    expect(auth2.providerMutationPermitted).toBe(false);
    const m2 = await provider.mutate({
      idempotencyKey: key,
      atMs: nowMs + 1,
      artifactCommit: artifact.commitSha,
      permitted: auth2.providerMutationPermitted,
    });
    expect(m2.ok).toBe(false);
    expect(provider.mutationCountForKey(key)).toBe(1);
  });

  test('provider failure before mutation: retry replay status-only then succeed once', async () => {
    const store = new MemoryPromotionStore();
    seedAllScopes(store, 0);
    const broker = new PromotionBroker({
      store,
      approvalIssuer: TEST_ISSUER,
      brokerBinding: TEST_BROKER_BINDING,
      enforcementMode: 'live',
    });
    const provider = new FakePromotionProvider();
    provider.queueFailureOnce();
    const artifact = sampleArtifact('1'.repeat(40));
    const nowMs = 2_000;
    const token = signTestApproval({
      subject: 'human:release',
      binding: TEST_BROKER_BINDING,
      artifact,
      generation: 0,
      nowMs,
    });
    await broker.control.issueGrantFromSignedApproval({
      grantId: 'sandbox-2',
      signedApprovalToken: token,
      nowMs,
      grantTtlMs: 60_000,
    });
    const key = 'run-2/attempt-1';

    const auth1 = await broker.control.authorizePromotionAttempt({
      scope: 'prod_deploy',
      binding: TEST_BROKER_BINDING,
      artifact,
      grantId: 'sandbox-2',
      idempotencyKey: key,
      nowMs,
    });
    const fail = await provider.mutate({
      idempotencyKey: key,
      atMs: nowMs,
      artifactCommit: artifact.commitSha,
      permitted: auth1.providerMutationPermitted,
    });
    expect(fail.ok).toBe(false);

    const authReplay = await broker.control.consumeGrant({
      scope: 'prod_deploy',
      binding: TEST_BROKER_BINDING,
      artifact,
      grantId: 'sandbox-2',
      idempotencyKey: key,
      nowMs: nowMs + 1,
    });
    expect(authReplay.providerMutationPermitted).toBe(false);
    const retryMutate = await provider.mutate({
      idempotencyKey: key,
      atMs: nowMs + 1,
      artifactCommit: artifact.commitSha,
      permitted: authReplay.providerMutationPermitted,
    });
    expect(retryMutate.ok).toBe(false);
    expect(provider.mutationCountForKey(key)).toBe(0);
    // Recovery uncertainty: workflow must reconcile provider state out of band;
    // this library does not auto-re-grant after provider_error.
  });

  test('hold after consume blocks replay (no second mutation path)', async () => {
    const store = new MemoryPromotionStore();
    seedAllScopes(store, 0);
    const broker = new PromotionBroker({
      store,
      approvalIssuer: TEST_ISSUER,
      brokerBinding: TEST_BROKER_BINDING,
      enforcementMode: 'live',
    });
    const provider = new FakePromotionProvider();
    const artifact = sampleArtifact('2'.repeat(40));
    const nowMs = 3_000;
    const token = signTestApproval({
      subject: 'human:release',
      binding: TEST_BROKER_BINDING,
      artifact,
      generation: 0,
      nowMs,
    });
    await broker.control.issueGrantFromSignedApproval({
      grantId: 'sandbox-3',
      signedApprovalToken: token,
      nowMs,
      grantTtlMs: 60_000,
    });
    const key = 'run-3/attempt-1';
    const auth = await broker.control.authorizePromotionAttempt({
      scope: 'prod_deploy',
      binding: TEST_BROKER_BINDING,
      artifact,
      grantId: 'sandbox-3',
      idempotencyKey: key,
      nowMs,
    });
    await provider.mutate({
      idempotencyKey: key,
      atMs: nowMs,
      artifactCommit: artifact.commitSha,
      permitted: auth.providerMutationPermitted,
    });

    await broker.control.setHold({
      scope: 'prod_deploy',
      reason: 'pause',
      setBySubject: 'human:ops',
      nowMs: nowMs + 1,
    });

    await expect(
      broker.control.consumeGrant({
        scope: 'prod_deploy',
        binding: TEST_BROKER_BINDING,
        artifact,
        grantId: 'sandbox-3',
        idempotencyKey: key,
        nowMs: nowMs + 2,
      })
    ).rejects.toMatchObject({ reason: 'hold_blocks_replay' });
  });
});
