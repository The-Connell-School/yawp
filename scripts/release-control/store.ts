import type {
  ArtifactBinding,
  AuditEvent,
  GrantRecord,
  PromotionScope,
  ScopeRecord,
} from './types';
import type { GrantBinding } from './grant-binding';

export type ScopeLoadResult =
  | { ok: true; record: ScopeRecord }
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
      /**
       * True only on first successful consume (not replay). Replay returns false
       * so callers must not invoke provider mutation again.
       */
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
        | 'binding_mismatch';
    };

export interface PromotionStore {
  loadScope(scope: PromotionScope): Promise<ScopeLoadResult>;
  loadGrant(grantId: string): Promise<GrantRecord | 'missing' | 'malformed' | 'unreachable'>;

  setHold(input: SetHoldInput): Promise<
    | { ok: true; generation: number }
    | { ok: false; reason: 'unreachable' | 'malformed' | 'generation_conflict' }
  >;

  clearHold(input: ClearHoldInput): Promise<
    | { ok: true; generation: number }
    | {
        ok: false;
        reason:
          | 'unreachable'
          | 'malformed'
          | 'no_hold'
          | 'generation_conflict';
      }
  >;

  issueGrant(input: IssueGrantInput): Promise<
    | { ok: true; issuedAtGeneration: number }
    | {
        ok: false;
        reason:
          | 'unreachable'
          | 'malformed'
          | 'hold_active'
          | 'generation_conflict'
          | 'duplicate_grant';
      }
  >;

  consumeGrant(input: ConsumeGrantInput): Promise<ConsumeGrantResult>;

  appendAudit(event: AuditEvent): Promise<'ok' | 'unreachable'>;
}
