import { parseArtifactBinding, artifactsMatch } from './artifact';
import {
  verifyApprovalToken,
  type ApprovalIssuer,
  approvalRefIsUntrustedWorkerHint,
} from './approval-verifier';
import { PromotionDeniedError, type PromotionDenyReason } from './errors';
import type { EnforcementMode } from './enforcement-mode';
import { promotionPathAllowed } from './enforcement-mode';
import {
  artifactMeetsOperationRequirements,
  grantBindingsMatch,
  type GrantBinding,
} from './grant-binding';
import type { ArtifactBinding, PromotionScope } from './types';
import type { PromotionStore } from './store';

export type PromotionControlOptions = {
  store: PromotionStore;
  approvalIssuer: ApprovalIssuer;
  brokerBinding: GrantBinding;
  enforcementMode?: EnforcementMode;
};

export type MergeGateObservation = {
  checkPassedAtMs: number;
  staleRelativeToHold: boolean;
  mergeAllowedByHoldState: boolean;
};

export type ConsumeThenHoldRaceNote = {
  grantConsumed: true;
  holdPlacedAfterConsumeMs: number;
  externalMutationStartedAfterConsume: true;
  inFlightOperationMayStillComplete: true;
};

export type PromotionAuthorizationResult = {
  consumedAtMs: number;
  replayStatusOnly: boolean;
  providerMutationPermitted: boolean;
};

function deny(reason: PromotionDenyReason, detail?: string): never {
  throw new PromotionDeniedError(reason, detail);
}

export class PromotionControl {
  readonly #store: PromotionStore;
  readonly #issuer: ApprovalIssuer;
  readonly #brokerBinding: GrantBinding;
  readonly #mode: EnforcementMode;

  constructor(options: PromotionControlOptions) {
    this.#store = options.store;
    this.#issuer = options.approvalIssuer;
    this.#brokerBinding = options.brokerBinding;
    this.#mode = options.enforcementMode ?? 'prepare_only';
  }

  get enforcementMode(): EnforcementMode {
    return this.#mode;
  }

  #assertLivePath(): void {
    if (!promotionPathAllowed(this.#mode)) {
      deny('fail_closed_unconfigured', 'prepare_only — promotion paths disabled');
    }
  }

  async assertScopeReadable(scope: PromotionScope): Promise<number> {
    this.#assertLivePath();
    const loaded = await this.#store.loadScope(scope);
    if (!loaded.ok) {
      const map: Record<string, PromotionDenyReason> = {
        missing: 'fail_closed_malformed',
        malformed: 'fail_closed_malformed',
        unreachable: 'fail_closed_unreachable',
      };
      deny(map[loaded.reason] ?? 'fail_closed_malformed');
    }
    return loaded.record.generation;
  }

  async assertNoActiveHold(scope: PromotionScope): Promise<void> {
    await this.assertScopeReadable(scope);
    const loaded = await this.#store.loadScope(scope);
    if (!loaded.ok) deny('fail_closed_unreachable');
    if (loaded.record.hold?.active) deny('hold_active');
  }

  async setHold(input: {
    scope: PromotionScope;
    reason: string;
    setBySubject: string;
    nowMs: number;
  }): Promise<number> {
    this.#assertLivePath();
    const result = await this.#store.setHold(input);
    if (!result.ok) deny('fail_closed_unreachable', result.reason);
    await this.#store.appendAudit({
      eventId: `hold-set-${input.scope}-${input.nowMs}`,
      atMs: input.nowMs,
      kind: 'hold.set',
      scope: input.scope,
      detail: {
        reason: input.reason,
        generation: result.generation,
        indefiniteUntilExplicitRelease: true,
      },
    });
    return result.generation;
  }

  async clearHold(input: {
    scope: PromotionScope;
    clearedBySubject: string;
    nowMs: number;
  }): Promise<number> {
    this.#assertLivePath();
    const result = await this.#store.clearHold(input);
    if (!result.ok) {
      if (result.reason === 'unreachable') deny('fail_closed_unreachable');
      deny('fail_closed_malformed', result.reason);
    }
    return result.generation;
  }

  async issueGrantFromSignedApproval(input: {
    grantId: string;
    signedApprovalToken: string;
    nowMs: number;
    grantTtlMs: number;
  }): Promise<{ issuedAtGeneration: number }> {
    this.#assertLivePath();
    const verified = verifyApprovalToken(
      this.#issuer,
      input.signedApprovalToken,
      input.nowMs,
      { brokerBinding: this.#brokerBinding }
    );
    if (!verified.ok) {
      if (verified.reason === 'unconfigured') deny('approval_unconfigured');
      if (verified.reason === 'digest_required') deny('digest_required');
      if (verified.reason === 'binding_mismatch') deny('binding_mismatch');
      if (verified.reason === 'generation_mismatch') deny('generation_conflict');
      deny('approval_invalid', verified.reason);
    }
    const { approval } = verified;
    if (!grantBindingsMatch(approval.binding, this.#brokerBinding)) {
      deny('binding_mismatch');
    }
    if (!artifactMeetsOperationRequirements(approval.scope, approval.artifact)) {
      deny('digest_required');
    }

    const scopeState = await this.#store.loadScope(approval.scope);
    if (!scopeState.ok) deny('fail_closed_malformed', scopeState.reason);
    if (approval.generation !== scopeState.record.generation) {
      deny('generation_conflict', 'approval generation stale vs scope');
    }

    const expiresAtMs = Math.min(approval.expiresAtMs, input.nowMs + input.grantTtlMs);
    const result = await this.#store.issueGrant({
      grantId: input.grantId,
      scope: approval.scope,
      binding: approval.binding,
      artifact: approval.artifact,
      approvalSubject: approval.subject,
      expiresAtMs,
      nowMs: input.nowMs,
    });
    if (!result.ok) {
      if (result.reason === 'hold_active') deny('hold_active');
      if (result.reason === 'unreachable') deny('fail_closed_unreachable');
      deny('fail_closed_malformed', result.reason);
    }
    await this.#store.appendAudit({
      eventId: `grant-issue-${input.grantId}`,
      atMs: input.nowMs,
      kind: 'grant.issue',
      scope: approval.scope,
      detail: { grantId: input.grantId, jti: approval.jti },
    });
    return { issuedAtGeneration: result.issuedAtGeneration };
  }

  async issueGrantFromWorkerApprovalRef(_input: {
    grantId: string;
    approvalRef: string;
    scope: PromotionScope;
    artifact: ArtifactBinding;
    nowMs: number;
  }): Promise<never> {
    approvalRefIsUntrustedWorkerHint(_input.approvalRef);
    deny('approval_invalid', 'worker-supplied approval_ref is not proof of consent');
  }

  async consumeGrant(input: {
    grantId: string;
    scope: PromotionScope;
    binding: GrantBinding;
    artifact: ArtifactBinding;
    idempotencyKey: string;
    nowMs: number;
  }): Promise<PromotionAuthorizationResult> {
    this.#assertLivePath();
    if (!grantBindingsMatch(input.binding, this.#brokerBinding)) {
      deny('binding_mismatch');
    }
    const parsed = parseArtifactBinding(input.artifact);
    if (parsed === 'malformed') deny('fail_closed_malformed', 'artifact');
    if (!artifactMeetsOperationRequirements(input.scope, parsed)) {
      deny('digest_required');
    }
    const result = await this.#store.consumeGrant({
      ...input,
      artifact: parsed,
    });
    if (!result.ok) {
      const reasonMap: Record<string, PromotionDenyReason> = {
        hold_active: 'hold_active',
        hold_blocks_replay: 'hold_blocks_replay',
        expired: 'grant_expired',
        missing: 'grant_missing',
        already_consumed: 'grant_already_consumed',
        stale_generation: 'grant_stale_generation',
        artifact_mismatch: 'artifact_mismatch',
        binding_mismatch: 'binding_mismatch',
        unreachable: 'fail_closed_unreachable',
        malformed: 'fail_closed_malformed',
        scope_mismatch: 'artifact_mismatch',
      };
      deny(reasonMap[result.reason] ?? 'fail_closed_malformed', result.reason);
    }
    if (!result.replay) {
      await this.#store.appendAudit({
        eventId: `grant-consume-${input.grantId}-${input.idempotencyKey}`,
        atMs: input.nowMs,
        kind: 'grant.consume',
        scope: input.scope,
        detail: {
          grantId: input.grantId,
          idempotencyKey: input.idempotencyKey,
          providerMutationPermitted: result.providerMutationPermitted,
        },
      });
    }
    return {
      consumedAtMs: result.consumedAtMs,
      replayStatusOnly: result.replay,
      providerMutationPermitted: result.providerMutationPermitted,
    };
  }

  async authorizePromotionAttempt(input: {
    scope: PromotionScope;
    binding: GrantBinding;
    artifact: ArtifactBinding;
    grantId: string;
    idempotencyKey: string;
    nowMs: number;
  }): Promise<PromotionAuthorizationResult> {
    await this.assertNoActiveHold(input.scope);
    return this.consumeGrant(input);
  }

  async evaluateMergeGateStaleCheck(input: {
    scope: PromotionScope;
    mergeGroupCheckPassedAtMs: number;
    nowMs: number;
  }): Promise<MergeGateObservation> {
    const loaded = await this.#store.loadScope(input.scope);
    const hold = loaded.ok ? loaded.record.hold : null;
    const staleRelativeToHold =
      hold?.active === true && hold.setAtMs > input.mergeGroupCheckPassedAtMs;
    return {
      checkPassedAtMs: input.mergeGroupCheckPassedAtMs,
      staleRelativeToHold,
      mergeAllowedByHoldState: !hold?.active,
    };
  }

  describeConsumeThenHoldRace(input: {
    consumeAtMs: number;
    holdAtMs: number;
  }): ConsumeThenHoldRaceNote | null {
    if (input.holdAtMs <= input.consumeAtMs) return null;
    return {
      grantConsumed: true,
      holdPlacedAfterConsumeMs: input.holdAtMs,
      externalMutationStartedAfterConsume: true,
      inFlightOperationMayStillComplete: true,
    };
  }

  /** Holds do not auto-expire when wall clock advances. */
  async holdStillActiveAfterTimeAdvance(input: {
    scope: PromotionScope;
    holdSetAtMs: number;
    nowMs: number;
  }): Promise<boolean> {
    const loaded = await this.#store.loadScope(input.scope);
    if (!loaded.ok) return false;
    return loaded.record.hold?.active === true && input.nowMs > input.holdSetAtMs;
  }
}

export { artifactsMatch };
