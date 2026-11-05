import { parseArtifactBinding, artifactsMatch } from './artifact';
import {
  verifyApprovalToken,
  type ApprovalIssuer,
  approvalRefIsUntrustedWorkerHint,
} from './approval-verifier';
import { PromotionDeniedError, type PromotionDenyReason } from './errors';
import type { ArtifactBinding, PromotionScope } from './types';
import type { PromotionStore } from './store';

export type PromotionControlOptions = {
  store: PromotionStore;
  approvalIssuer: ApprovalIssuer;
  /** When false, every path fails closed (prepare-only default). */
  enforcementEnabled?: boolean;
};

export type MergeGateObservation = {
  /** Simulated required-check completion time. */
  checkPassedAtMs: number;
  /** When a hold was placed after the check, the check is stale for merge. */
  staleRelativeToHold: boolean;
  /** Library opinion: merge_group success alone does not linearize with hold state. */
  mergeAllowedByHoldState: boolean;
};

export type ConsumeThenHoldRaceNote = {
  grantConsumed: true;
  holdPlacedAfterConsumeMs: number;
  externalMutationStartedAfterConsume: true;
  /**
   * Honest semantics: consume only prevents *new* promotions that re-read state;
   * it does not revoke in-flight provider operations already past the gate.
   */
  inFlightOperationMayStillComplete: true;
};

function deny(reason: PromotionDenyReason, detail?: string): never {
  throw new PromotionDeniedError(reason, detail);
}

export class PromotionControl {
  readonly #store: PromotionStore;
  readonly #issuer: ApprovalIssuer;
  readonly #enforcementEnabled: boolean;

  constructor(options: PromotionControlOptions) {
    this.#store = options.store;
    this.#issuer = options.approvalIssuer;
    this.#enforcementEnabled = options.enforcementEnabled ?? false;
  }

  async assertScopeReadable(scope: PromotionScope): Promise<number> {
    if (!this.#enforcementEnabled) {
      deny('fail_closed_unconfigured', 'enforcement disabled (prepare-only)');
    }
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
    const generation = await this.assertScopeReadable(scope);
    const loaded = await this.#store.loadScope(scope);
    if (!loaded.ok) deny('fail_closed_unreachable');
    if (loaded.record.hold?.active) deny('hold_active');
    void generation;
  }

  async setHold(input: {
    scope: PromotionScope;
    permanent: boolean;
    reason: string;
    setBySubject: string;
    nowMs: number;
  }): Promise<number> {
    const result = await this.#store.setHold(input);
    if (!result.ok) deny('fail_closed_unreachable', result.reason);
    await this.#store.appendAudit({
      eventId: `hold-set-${input.scope}-${input.nowMs}`,
      atMs: input.nowMs,
      kind: 'hold.set',
      scope: input.scope,
      detail: {
        permanent: input.permanent,
        reason: input.reason,
        generation: result.generation,
      },
    });
    return result.generation;
  }

  async clearHold(input: {
    scope: PromotionScope;
    clearedBySubject: string;
    nowMs: number;
    forceClearPermanent?: boolean;
  }): Promise<number> {
    const result = await this.#store.clearHold(input);
    if (!result.ok) {
      if (result.reason === 'hold_permanent') deny('hold_permanent');
      if (result.reason === 'unreachable') deny('fail_closed_unreachable');
      deny('fail_closed_malformed', result.reason);
    }
    return result.generation;
  }

  /**
   * Issue grant only with a verified signed approval — never a raw approval_ref.
   */
  async issueGrantFromSignedApproval(input: {
    grantId: string;
    signedApprovalToken: string;
    nowMs: number;
    grantTtlMs: number;
  }): Promise<{ issuedAtGeneration: number }> {
    const verified = verifyApprovalToken(this.#issuer, input.signedApprovalToken, input.nowMs);
    if (!verified.ok) {
      if (verified.reason === 'unconfigured') deny('approval_unconfigured');
      deny('approval_invalid', verified.reason);
    }
    const { approval } = verified;
    const expiresAtMs = Math.min(approval.expiresAtMs, input.nowMs + input.grantTtlMs);
    const result = await this.#store.issueGrant({
      grantId: input.grantId,
      scope: approval.scope,
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

  /** Workers calling with approval_ref alone — always rejected. */
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
    artifact: ArtifactBinding;
    idempotencyKey: string;
    nowMs: number;
  }) {
    const parsed = parseArtifactBinding(input.artifact);
    if (parsed === 'malformed') deny('fail_closed_malformed', 'artifact');
    const result = await this.#store.consumeGrant({
      ...input,
      artifact: parsed,
    });
    if (!result.ok) {
      const reasonMap: Record<string, PromotionDenyReason> = {
        hold_active: 'hold_active',
        expired: 'grant_expired',
        missing: 'grant_missing',
        already_consumed: 'grant_already_consumed',
        stale_generation: 'grant_stale_generation',
        artifact_mismatch: 'artifact_mismatch',
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
        },
      });
    }
    return result;
  }

  /**
   * Promotion-time gate: re-read hold + optional grant consume in one logical step
   * before calling AWS/GitHub mutators.
   */
  async authorizePromotionAttempt(input: {
    scope: PromotionScope;
    artifact: ArtifactBinding;
    grantId: string;
    idempotencyKey: string;
    nowMs: number;
  }) {
    await this.assertNoActiveHold(input.scope);
    return this.consumeGrant(input);
  }

  evaluateMergeGateStaleCheck(input: {
    scope: PromotionScope;
    mergeGroupCheckPassedAtMs: number;
    nowMs: number;
  }): Promise<MergeGateObservation> {
    return this.#evaluateMergeGateStaleCheck(input);
  }

  async #evaluateMergeGateStaleCheck(input: {
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
}

export { artifactsMatch };
