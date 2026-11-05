import type { AuditEvent, GrantRecord, PromotionScope } from './types';
import type { ClearHoldInput, IssueGrantInput, ScopeLoadResult, SetHoldInput } from './store';

type HoldResult =
  | { ok: true; generation: number }
  | { ok: false; reason: 'unreachable' | 'malformed' | 'generation_conflict' | 'no_hold' };

type IssueResult =
  | { ok: true; issuedAtGeneration: number }
  | {
      ok: false;
      reason: 'unreachable' | 'malformed' | 'hold_active' | 'generation_conflict' | 'duplicate_grant';
    };

/** Grant/hold/scope persistence for PromotionControl (consume via ReconciliationBroker). */
export interface PromotionGrantStore {
  loadScope(scope: PromotionScope): Promise<ScopeLoadResult>;
  loadGrant(grantId: string): Promise<GrantRecord | 'missing' | 'malformed' | 'unreachable'>;
  setHold(input: SetHoldInput): Promise<HoldResult>;
  clearHold(input: ClearHoldInput): Promise<HoldResult>;
  issueGrant(input: IssueGrantInput): Promise<IssueResult>;
  appendAudit(event: AuditEvent): Promise<'ok' | 'unreachable'>;
}
