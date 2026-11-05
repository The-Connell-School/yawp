import type { PromotionScope } from './types';
import type { PromotionOperation } from './operation';
import type {
  ClearHoldInput,
  ConsumeGrantInput,
  ConsumeGrantResult,
  IssueGrantInput,
  ScopeLoadResult,
  SetHoldInput,
} from './store';
import type { AuditEvent, GrantRecord } from './types';

export type CasCompareVersion = {
  generation?: number;
  operationState?: PromotionOperation['state'];
  operationUpdatedAtMs?: number;
};

export type TransactConsumeWithAuditInput = ConsumeGrantInput & {
  audit: AuditEvent;
  operation: PromotionOperation;
};

export type TransactConsumeWithAuditResult =
  | (Extract<ConsumeGrantResult, { ok: true }> & { auditDurablyAppended: true })
  | Extract<ConsumeGrantResult, { ok: false }>;

export type TransitionOperationInput = {
  operationId: string;
  expected: CasCompareVersion;
  nextState: PromotionOperation['state'];
  nowMs: number;
  markProviderSubmitAttempted?: boolean;
};

export type TransitionOperationResult =
  | { ok: true; operation: PromotionOperation }
  | { ok: false; reason: 'not_found' | 'cas_conflict' | 'invalid_transition' | 'hold_active' };

export interface DurablePromotionCasStore {
  loadScope(scope: PromotionScope): Promise<ScopeLoadResult>;
  loadGrant(grantId: string): Promise<GrantRecord | 'missing' | 'malformed' | 'unreachable'>;
  loadOperation(operationId: string): Promise<PromotionOperation | 'missing'>;
  findUnresolvedOperationByLogicalKey(logicalKey: string): Promise<PromotionOperation | 'missing'>;
  appendAudit(event: AuditEvent): Promise<'ok' | 'unreachable'>;

  setHold(input: SetHoldInput): Promise<
    | { ok: true; generation: number }
    | { ok: false; reason: 'unreachable' | 'malformed' | 'generation_conflict' }
  >;
  clearHold(input: ClearHoldInput): Promise<
    | { ok: true; generation: number }
    | { ok: false; reason: 'unreachable' | 'malformed' | 'no_hold' | 'generation_conflict' }
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

  transactConsumeWithAudit(input: TransactConsumeWithAuditInput): Promise<TransactConsumeWithAuditResult>;
  transitionOperation(input: TransitionOperationInput): Promise<TransitionOperationResult>;
}
