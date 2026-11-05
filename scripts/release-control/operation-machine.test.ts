import { describe, expect, test } from 'bun:test';
import { MEMORY_STORE_CAS_LIMITATION } from './memory-cas-store';
import { HOLD_OPERATION_LINEARIZATION } from './reconciliation-broker';
import {
  TEST_BROKER_BINDING,
  issueTestGrant,
  liveBroker,
  sampleArtifact,
} from './test-helpers';

describe('operation state machine (sandbox — not distributed/provider enforced)', () => {
  test('happy path: authorized → claimed → submitting → accepted → succeeded via readback', async () => {
    const { broker, nowMs } = liveBroker();
    const artifact = sampleArtifact('a'.repeat(40));
    await issueTestGrant(broker, { grantId: 'g1', artifact, nowMs });
    const { FakePromotionProvider } = await import('./fake-provider');
    const fake = new FakePromotionProvider();
    const opened = await broker.openOperation({
      grantId: 'g1',
      scope: 'prod_deploy',
      binding: TEST_BROKER_BINDING,
      artifact,
      idempotencyKey: 'run/1',
      nowMs,
    });
    expect(opened.providerMutationPermitted).toBe(true);

    await broker.claimOperation(opened.operation.operationId, nowMs + 1);
    const submitted = await broker.executeProviderSubmit({
      operationId: opened.operation.operationId,
      provider: fake,
      nowMs: nowMs + 2,
    });
    expect(submitted.operation.state).toBe('accepted');
    fake.setReadback(submitted.providerToken!, { outcome: 'succeeded' });
    const final = await broker.reconcileReadback({
      operationId: opened.operation.operationId,
      provider: fake,
      providerToken: submitted.providerToken!,
      nowMs: nowMs + 3,
    });
    expect(final.state).toBe('succeeded');
    expect(fake.submitCalls.length).toBe(1);
  });

  test('provider rejection before acceptance → failed; retry does not resubmit', async () => {
    const { broker, nowMs } = liveBroker();
    const artifact = sampleArtifact('b'.repeat(40));
    await issueTestGrant(broker, { grantId: 'g2', artifact, nowMs });
    const { FakePromotionProvider } = await import('./fake-provider');
    const fake = new FakePromotionProvider();
    fake.queueResults({ kind: 'rejected_before_acceptance' });

    const opened = await broker.openOperation({
      grantId: 'g2',
      scope: 'prod_deploy',
      binding: TEST_BROKER_BINDING,
      artifact,
      idempotencyKey: 'run/2',
      nowMs,
    });
    await broker.claimOperation(opened.operation.operationId, nowMs);
    const submitted = await broker.executeProviderSubmit({
      operationId: opened.operation.operationId,
      provider: fake,
      nowMs: nowMs + 1,
    });
    expect(submitted.operation.state).toBe('failed');
    const retry = await broker.executeProviderSubmit({
      operationId: opened.operation.operationId,
      provider: fake,
      nowMs: nowMs + 2,
    });
    expect(retry.operation.state).toBe('failed');
    expect(fake.submitCount(opened.operation.operationId)).toBe(1);
  });

  test('timeout after acceptance → unknown; readback reconciles without resubmit', async () => {
    const { broker, nowMs } = liveBroker();
    const artifact = sampleArtifact('c'.repeat(40));
    await issueTestGrant(broker, { grantId: 'g3', artifact, nowMs });
    const { FakePromotionProvider } = await import('./fake-provider');
    const fake = new FakePromotionProvider();
    fake.queueResults({ kind: 'timeout_after_acceptance', providerToken: 'tok-timeout' });

    const opened = await broker.openOperation({
      grantId: 'g3',
      scope: 'prod_deploy',
      binding: TEST_BROKER_BINDING,
      artifact,
      idempotencyKey: 'run/3',
      nowMs,
    });
    await broker.claimOperation(opened.operation.operationId, nowMs);
    const submitted = await broker.executeProviderSubmit({
      operationId: opened.operation.operationId,
      provider: fake,
      nowMs: nowMs + 1,
    });
    expect(submitted.operation.state).toBe('unknown');
    fake.setReadback(submitted.providerToken!, { outcome: 'succeeded' });
    const reconciled = await broker.reconcileReadback({
      operationId: opened.operation.operationId,
      provider: fake,
      providerToken: submitted.providerToken!,
      nowMs: nowMs + 2,
    });
    expect(reconciled.state).toBe('succeeded');
    expect(fake.submitCount(opened.operation.operationId)).toBe(1);
  });

  test('worker crash before claim: duplicate open replay is status-only', async () => {
    const { broker, nowMs } = liveBroker();
    const artifact = sampleArtifact('d'.repeat(40));
    await issueTestGrant(broker, { grantId: 'g4', artifact, nowMs });
    const first = await broker.openOperation({
      grantId: 'g4',
      scope: 'prod_deploy',
      binding: TEST_BROKER_BINDING,
      artifact,
      idempotencyKey: 'run/4',
      nowMs,
    });
    const replay = await broker.openOperation({
      grantId: 'g4',
      scope: 'prod_deploy',
      binding: TEST_BROKER_BINDING,
      artifact,
      idempotencyKey: 'run/4',
      nowMs: nowMs + 100,
    });
    expect(first.providerMutationPermitted).toBe(true);
    expect(replay.replayStatusOnly).toBe(true);
    expect(replay.providerMutationPermitted).toBe(false);
  });

  test('hold before claim blocks open', async () => {
    const { broker, nowMs } = liveBroker();
    const artifact = sampleArtifact('e'.repeat(40));
    await issueTestGrant(broker, { grantId: 'g5', artifact, nowMs });
    await broker.promotion.setHold({
      scope: 'prod_deploy',
      reason: 'pause',
      setBySubject: 'human:ops',
      nowMs: nowMs + 1,
    });
    await expect(
      broker.openOperation({
        grantId: 'g5',
        scope: 'prod_deploy',
        binding: TEST_BROKER_BINDING,
        artifact,
        idempotencyKey: 'run/5',
        nowMs: nowMs + 2,
      })
    ).rejects.toMatchObject({ reason: 'hold_active' });
  });

  test('hold after claim before submit blocks submitting transition', async () => {
    const { broker, nowMs } = liveBroker();
    const artifact = sampleArtifact('f'.repeat(40));
    await issueTestGrant(broker, { grantId: 'g6', artifact, nowMs });
    const opened = await broker.openOperation({
      grantId: 'g6',
      scope: 'prod_deploy',
      binding: TEST_BROKER_BINDING,
      artifact,
      idempotencyKey: 'run/6',
      nowMs,
    });
    await broker.claimOperation(opened.operation.operationId, nowMs + 1);
    await broker.promotion.setHold({
      scope: 'prod_deploy',
      reason: 'pause',
      setBySubject: 'human:ops',
      nowMs: nowMs + 2,
    });
    const { FakePromotionProvider } = await import('./fake-provider');
    const fake = new FakePromotionProvider();
    await expect(
      broker.executeProviderSubmit({
        operationId: opened.operation.operationId,
        provider: fake,
        nowMs: nowMs + 3,
      })
    ).rejects.toMatchObject({ reason: 'hold_active' });
    expect(HOLD_OPERATION_LINEARIZATION.holdAfterClaimBeforeSubmit).toContain('blocks');
  });

  test('new grant cannot duplicate unresolved operation (same logical key)', async () => {
    const { broker, nowMs } = liveBroker();
    const artifact = sampleArtifact('1'.repeat(40));
    await issueTestGrant(broker, { grantId: 'g7a', artifact, nowMs });
    await broker.openOperation({
      grantId: 'g7a',
      scope: 'prod_deploy',
      binding: TEST_BROKER_BINDING,
      artifact,
      idempotencyKey: 'run/7',
      nowMs,
    });
    await issueTestGrant(broker, { grantId: 'g7b', artifact, nowMs: nowMs + 1 });
    await expect(
      broker.openOperation({
        grantId: 'g7b',
        scope: 'prod_deploy',
        binding: TEST_BROKER_BINDING,
        artifact,
        idempotencyKey: 'run/7',
        nowMs: nowMs + 2,
      })
    ).rejects.toMatchObject({ reason: 'grant_already_consumed' });
  });

  test('multiple workers: one wins claim CAS', async () => {
    const { broker, nowMs } = liveBroker();
    const artifact = sampleArtifact('2'.repeat(40));
    await issueTestGrant(broker, { grantId: 'g8', artifact, nowMs });
    const opened = await broker.openOperation({
      grantId: 'g8',
      scope: 'prod_deploy',
      binding: TEST_BROKER_BINDING,
      artifact,
      idempotencyKey: 'run/8',
      nowMs,
    });
    const results = await Promise.allSettled([
      broker.claimOperation(opened.operation.operationId, nowMs + 1),
      broker.claimOperation(opened.operation.operationId, nowMs + 1),
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    const bad = results.filter((r) => r.status === 'rejected');
    expect(ok.length).toBe(1);
    expect(bad.length).toBe(1);
  });

  test('consume+audit atomic: audit appended iff transact ok', async () => {
    const { store, broker, nowMs } = liveBroker();
    const artifact = sampleArtifact('3'.repeat(40));
    await issueTestGrant(broker, { grantId: 'g9', artifact, nowMs });
    const before = store.audits.length;
    await broker.openOperation({
      grantId: 'g9',
      scope: 'prod_deploy',
      binding: TEST_BROKER_BINDING,
      artifact,
      idempotencyKey: 'run/9',
      nowMs,
    });
    expect(store.audits.length).toBe(before + 1);
  });

  test('documents memory CAS limitation', () => {
    expect(MEMORY_STORE_CAS_LIMITATION).toContain('single-process');
  });
});
