import { artifactsMatch } from './artifact';
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
import type { PromotionGrantStore } from './grant-store';

export type PromotionControlOptions = {
  store: PromotionGrantStore;
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

function deny(reason: PromotionDenyReason, detail?: string): never {
  throw new PromotionDeniedError(reason, detail);
}

export class PromotionControl {
  readonly #store: PromotionGrantStore;
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
