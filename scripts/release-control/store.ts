import type {
  ArtifactBinding,
  AuditEvent,
  GrantRecord,
  PromotionScope,
  ScopeRecord,
} from './types';

export type ScopeLoadResult =
  | { ok: true; record: ScopeRecord }
  | { ok: false; reason: 'missing' | 'malformed' | 'unreachable' };

export type SetHoldInput = {
  scope: PromotionScope;
  permanent: boolean;
  reason: string;
  setBySubject: string;
  nowMs: number;
  /** When true, allows clearing a permanent hold (trusted admin only). */
  forceClearPermanent?: boolean;
};

export type ClearHoldInput = {
  scope: PromotionScope;
  clearedBySubject: string;
  nowMs: number;
  forceClearPermanent?: boolean;
};

export type IssueGrantInput = {
  grantId: string;
  scope: PromotionScope;
  artifact: ArtifactBinding;
  approvalSubject: string;
  expiresAtMs: number;
  nowMs: number;
};

export type ConsumeGrantInput = {
  grantId: string;
  scope: PromotionScope;
  artifact: ArtifactBinding;
  idempotencyKey: string;
  nowMs: number;
};

export type ConsumeGrantResult =
  | {
      ok: true;
      replay: boolean;
      consumedAtMs: number;
      /** Scope generation observed at consume — grants must match this. */
      generationAtConsume: number;
    }
  | {
      ok: false;
      reason:
        | 'unreachable'
        | 'malformed'
        | 'missing'
        | 'hold_active'
        | 'expired'
        | 'already_consumed'
        | 'stale_generation'
        | 'artifact_mismatch'
        | 'scope_mismatch';
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
          | 'hold_permanent'
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
