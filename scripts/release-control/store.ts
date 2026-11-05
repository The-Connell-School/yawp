import type { ArtifactBinding, AuditEvent, GrantRecord, PromotionScope } from './types';
import type { GrantBinding } from './grant-binding';

export type ScopeLoadResult =
  | { ok: true; record: import('./types').ScopeRecord }
  | { ok: false; reason: 'missing' | 'malformed' | 'unreachable' };

export type SetHoldInput = {
  scope: PromotionScope;
  reason: string;
  setBySubject: string;
  nowMs: number;
};

export type ClearHoldInput = {
  scope: PromotionScope;
  clearedBySubject: string;
  nowMs: number;
};

export type IssueGrantInput = {
  grantId: string;
  scope: PromotionScope;
  binding: GrantBinding;
  artifact: ArtifactBinding;
  approvalSubject: string;
  expiresAtMs: number;
  nowMs: number;
};

export type ConsumeGrantInput = {
  grantId: string;
  scope: PromotionScope;
  binding: GrantBinding;
  artifact: ArtifactBinding;
  idempotencyKey: string;
  nowMs: number;
};

export type ConsumeGrantResult =
  | {
      ok: true;
      replay: boolean;
      consumedAtMs: number;
      generationAtConsume: number;
      providerMutationPermitted: boolean;
    }
  | {
      ok: false;
      reason:
        | 'unreachable'
        | 'malformed'
        | 'missing'
        | 'hold_active'
        | 'hold_blocks_replay'
        | 'expired'
        | 'already_consumed'
        | 'stale_generation'
        | 'artifact_mismatch'
        | 'scope_mismatch'
        | 'binding_mismatch'
        | 'unresolved_operation'
        | 'operation_duplicate'
        | 'audit_not_durable';
    };

export type { AuditEvent, GrantRecord };
