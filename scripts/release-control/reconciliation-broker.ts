import type { ApprovalIssuer } from './approval-verifier';
import type { GrantBinding } from './grant-binding';
import type { EnforcementMode } from './enforcement-mode';
import type { ArtifactBinding, PromotionScope } from './types';
import type { DurablePromotionCasStore } from './cas-store';
import { PromotionControl } from './promotion-control';
import {
  deriveOperationId,
  operationLogicalKey,
  type OperationState,
  type PromotionOperation,
} from './operation';
import { FakePromotionProvider, type ProviderReadback } from './fake-provider';
import { PromotionDeniedError, type PromotionDenyReason } from './errors';

export type ReconciliationBrokerConfig = {
  store: DurablePromotionCasStore;
  approvalIssuer: ApprovalIssuer;
  brokerBinding: GrantBinding;
  enforcementMode?: EnforcementMode;
};

export type OpenOperationResult = {
  operation: PromotionOperation;
  providerMutationPermitted: boolean;
  replayStatusOnly: boolean;
};

function mapTxReason(reason: string): PromotionDenyReason {
  const table: Record<string, PromotionDenyReason> = {
    hold_active: 'hold_active',
    hold_blocks_replay: 'hold_blocks_replay',
    expired: 'grant_expired',
    missing: 'grant_missing',
    already_consumed: 'grant_already_consumed',
    stale_generation: 'grant_stale_generation',
    artifact_mismatch: 'artifact_mismatch',
    binding_mismatch: 'binding_mismatch',
    unresolved_operation: 'grant_already_consumed',
    unreachable: 'fail_closed_unreachable',
  };
  return table[reason] ?? 'fail_closed_malformed';
}

export class ReconciliationBroker {
  readonly #store: DurablePromotionCasStore;
  readonly #control: PromotionControl;

  constructor(config: ReconciliationBrokerConfig) {
    this.#store = config.store;
    this.#control = new PromotionControl({
      store: config.store,
      approvalIssuer: config.approvalIssuer,
      brokerBinding: config.brokerBinding,
      enforcementMode: config.enforcementMode ?? 'live',
    });
  }

  get promotion(): PromotionControl {
    return this.#control;
  }

  get store(): DurablePromotionCasStore {
    return this.#store;
  }

  async openOperation(input: {
    grantId: string;
    scope: PromotionScope;
    binding: GrantBinding;
    artifact: ArtifactBinding;
    idempotencyKey: string;
    nowMs: number;
  }): Promise<OpenOperationResult> {
    const operationId = deriveOperationId(input.grantId, input.idempotencyKey);
    const logicalKey = operationLogicalKey(input);
    const unresolved = await this.#store.findUnresolvedOperationByLogicalKey(logicalKey);
    if (unresolved !== 'missing' && unresolved.grantId !== input.grantId) {
      throw new PromotionDeniedError(
        'grant_already_consumed',
        'unresolved operation blocks new grant for same promotion key'
      );
    }

    const scope = await this.#store.loadScope(input.scope);
    if (!scope.ok) throw new PromotionDeniedError('fail_closed_malformed');

    const operation: PromotionOperation = {
      operationId,
      grantId: input.grantId,
      idempotencyKey: input.idempotencyKey,
      scope: input.scope,
      binding: input.binding,
      artifact: input.artifact,
      state: 'authorized',
      generationAtOpen: scope.record.generation,
      updatedAtMs: input.nowMs,
      providerSubmitAttempted: false,
    };

    const tx = await this.#store.transactConsumeWithAudit({
      ...input,
      audit: {
        eventId: `grant-consume-${input.grantId}-${input.idempotencyKey}`,
        atMs: input.nowMs,
        kind: 'grant.consume',
        scope: input.scope,
        detail: { grantId: input.grantId, operationId },
      },
      operation,
    });

    if (!tx.ok) throw new PromotionDeniedError(mapTxReason(tx.reason), tx.reason);

    const op = await this.#store.loadOperation(operationId);
    if (op === 'missing') throw new PromotionDeniedError('fail_closed_malformed');
    return {
      operation: op,
      providerMutationPermitted: tx.providerMutationPermitted,
      replayStatusOnly: tx.replay,
    };
  }

  async claimOperation(operationId: string, nowMs: number): Promise<PromotionOperation> {
    const op = await this.#store.loadOperation(operationId);
    if (op === 'missing') throw new PromotionDeniedError('fail_closed_malformed');
    const scope = await this.#store.loadScope(op.scope);
    if (scope.ok && scope.record.hold?.active) {
      throw new PromotionDeniedError('hold_active', 'hold blocks new claim');
    }
    const tx = await this.#store.transitionOperation({
      operationId,
      expected: { operationState: op.state, operationUpdatedAtMs: op.updatedAtMs },
      nextState: 'claimed',
      nowMs,
    });
    if (!tx.ok) throw new PromotionDeniedError('fail_closed_malformed', tx.reason);
    return tx.operation;
  }

  async executeProviderSubmit(input: {
    operationId: string;
    provider: FakePromotionProvider;
    nowMs: number;
  }): Promise<{ operation: PromotionOperation; providerToken?: string }> {
    let op = await this.#store.loadOperation(input.operationId);
    if (op === 'missing') throw new PromotionDeniedError('fail_closed_malformed');

    if (op.providerSubmitAttempted || op.state === 'succeeded' || op.state === 'failed') {
      return { operation: op };
    }

    if (op.state === 'authorized') {
      op = await this.claimOperation(input.operationId, input.nowMs);
    }

    if (op.state === 'claimed') {
      const toSubmitting = await this.#store.transitionOperation({
        operationId: input.operationId,
        expected: { operationState: 'claimed', operationUpdatedAtMs: op.updatedAtMs },
        nextState: 'submitting',
        nowMs: input.nowMs,
      });
      if (!toSubmitting.ok) {
        throw new PromotionDeniedError(
          toSubmitting.reason === 'hold_active' ? 'hold_active' : 'fail_closed_malformed',
          toSubmitting.reason
        );
      }
      op = toSubmitting.operation;
    }

    if (op.state !== 'submitting') return { operation: op };

    const result = await input.provider.submit(input.operationId);
    if (result.kind === 'rejected_before_acceptance') {
      const failed = await this.#store.transitionOperation({
        operationId: input.operationId,
        expected: { operationState: 'submitting', operationUpdatedAtMs: op.updatedAtMs },
        nextState: 'failed',
        nowMs: input.nowMs,
        markProviderSubmitAttempted: true,
      });
      if (!failed.ok) throw new PromotionDeniedError('fail_closed_malformed', failed.reason);
      return { operation: failed.operation };
    }

    const nextState: OperationState =
      result.kind === 'timeout_after_acceptance' ? 'unknown' : 'accepted';
    const accepted = await this.#store.transitionOperation({
      operationId: input.operationId,
      expected: { operationState: 'submitting', operationUpdatedAtMs: op.updatedAtMs },
      nextState,
      nowMs: input.nowMs,
      markProviderSubmitAttempted: true,
    });
    if (!accepted.ok) throw new PromotionDeniedError('fail_closed_malformed', accepted.reason);
    return {
      operation: accepted.operation,
      providerToken: result.providerToken,
    };
  }

  async reconcileReadback(input: {
    operationId: string;
    provider: FakePromotionProvider;
    providerToken: string;
    nowMs: number;
  }): Promise<PromotionOperation> {
    const op = await this.#store.loadOperation(input.operationId);
    if (op === 'missing') throw new PromotionDeniedError('fail_closed_malformed');
    if (op.state !== 'accepted' && op.state !== 'unknown') return op;

    const readback: ProviderReadback = await input.provider.readback(input.providerToken);
    let next: OperationState = op.state;
    if (readback.outcome === 'succeeded') next = 'succeeded';
    else if (readback.outcome === 'failed') next = 'failed';
    else next = 'unknown';

    if (next === op.state) return op;

    const tx = await this.#store.transitionOperation({
      operationId: input.operationId,
      expected: { operationState: op.state, operationUpdatedAtMs: op.updatedAtMs },
      nextState: next,
      nowMs: input.nowMs,
    });
    if (!tx.ok) throw new PromotionDeniedError('fail_closed_malformed', tx.reason);
    return tx.operation;
  }
}

export type HoldOperationLinearization = {
  holdBeforeClaim: 'blocks_claim_and_submit';
  holdAfterClaimBeforeSubmit: 'blocks_submit_cas_may_fail_hold_active';
  holdAfterAccepted: 'does_not_revoke_provider_in_flight';
  newGrantWithUnresolvedOp: 'denied_for_same_logical_key';
};

export const HOLD_OPERATION_LINEARIZATION: HoldOperationLinearization = {
  holdBeforeClaim: 'blocks_claim_and_submit',
  holdAfterClaimBeforeSubmit: 'blocks_submit_cas_may_fail_hold_active',
  holdAfterAccepted: 'does_not_revoke_provider_in_flight',
  newGrantWithUnresolvedOp: 'denied_for_same_logical_key',
};
