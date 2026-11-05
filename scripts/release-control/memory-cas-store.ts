import type { GrantRecord, PromotionScope, ScopeRecord } from './types';
import type {
  ClearHoldInput,
  IssueGrantInput,
  ScopeLoadResult,
  SetHoldInput,
} from './store';
import { artifactsMatch } from './artifact';
import { grantBindingsMatch } from './grant-binding';
import {
  canTransition,
  deriveOperationId,
  isTerminalOperationState,
  operationLogicalKey,
  type PromotionOperation,
} from './operation';
import type {
  DurablePromotionCasStore,
  TransactConsumeWithAuditInput,
  TransactConsumeWithAuditResult,
  TransitionOperationInput,
  TransitionOperationResult,
} from './cas-store';

export const MEMORY_STORE_CAS_LIMITATION =
  'single-process mutex only; simulates DynamoDB CAS but does not prove distributed safety';

type StoreMode = 'healthy' | 'unreachable';

function defaultScope(scope: PromotionScope, nowMs: number): ScopeRecord {
  return { scope, generation: 0, hold: null, updatedAtMs: nowMs };
}

export class MemoryPromotionCasStore implements DurablePromotionCasStore {
  readonly #mode: StoreMode;
  #lock: Promise<void> = Promise.resolve();
  readonly #scopes = new Map<PromotionScope, ScopeRecord>();
  readonly #grants = new Map<string, GrantRecord>();
  readonly #operations = new Map<string, PromotionOperation>();
  readonly #logicalIndex = new Map<string, string>();
  readonly audits: import('./types').AuditEvent[] = [];

  constructor(options?: { mode?: StoreMode; seed?: Partial<Record<PromotionScope, ScopeRecord>> }) {
    this.#mode = options?.mode ?? 'healthy';
    if (options?.seed) {
      for (const [scope, record] of Object.entries(options.seed) as [
        PromotionScope,
        ScopeRecord,
      ][]) {
        this.#scopes.set(scope, record);
      }
    }
  }

  seedScope(scope: PromotionScope, record: ScopeRecord): void {
    this.#scopes.set(scope, record);
  }

  async #withLock<T>(fn: () => T | Promise<T>): Promise<T> {
    if (this.#mode === 'unreachable') throw new Error('store unreachable');
    let release!: () => void;
    const wait = new Promise<void>((r) => {
      release = r;
    });
    const prev = this.#lock;
    this.#lock = prev.then(() => wait);
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  async loadScope(scope: PromotionScope): Promise<ScopeLoadResult> {
    if (this.#mode === 'unreachable') return { ok: false, reason: 'unreachable' };
    const record = this.#scopes.get(scope);
    if (!record) return { ok: false, reason: 'missing' };
    if (record.generation < 0) return { ok: false, reason: 'malformed' };
    return { ok: true, record };
  }

  async loadGrant(grantId: string) {
    if (this.#mode === 'unreachable') return 'unreachable';
    const grant = this.#grants.get(grantId);
    if (!grant) return 'missing';
    if (!grant.binding) return 'malformed';
    return grant;
  }

  async loadOperation(operationId: string) {
    return this.#operations.get(operationId) ?? 'missing';
  }

  async findUnresolvedOperationByLogicalKey(logicalKey: string) {
    const opId = this.#logicalIndex.get(logicalKey);
    if (!opId) return 'missing';
    const op = this.#operations.get(opId);
    if (!op || isTerminalOperationState(op.state)) return 'missing';
    return op;
  }

  async setHold(input: SetHoldInput) {
    return this.#withLock(() => {
      if (this.#mode === 'unreachable') return { ok: false as const, reason: 'unreachable' as const };
      const current = this.#scopes.get(input.scope) ?? defaultScope(input.scope, input.nowMs);
      const nextGeneration = current.generation + 1;
      this.#scopes.set(input.scope, {
        scope: input.scope,
        generation: nextGeneration,
        hold: {
          active: true,
          indefiniteUntilExplicitRelease: true,
          reason: input.reason,
          setAtMs: input.nowMs,
          setBySubject: input.setBySubject,
          generationWhenSet: nextGeneration,
        },
        updatedAtMs: input.nowMs,
      });
      return { ok: true as const, generation: nextGeneration };
    });
  }

  async clearHold(input: ClearHoldInput) {
    return this.#withLock(() => {
      if (this.#mode === 'unreachable') return { ok: false as const, reason: 'unreachable' as const };
      const current = this.#scopes.get(input.scope);
      if (!current?.hold) return { ok: false as const, reason: 'no_hold' as const };
      const nextGeneration = current.generation + 1;
      this.#scopes.set(input.scope, {
        ...current,
        generation: nextGeneration,
        hold: null,
        updatedAtMs: input.nowMs,
      });
      return { ok: true as const, generation: nextGeneration };
    });
  }

  async issueGrant(input: IssueGrantInput) {
    return this.#withLock(() => {
      if (this.#mode === 'unreachable') return { ok: false as const, reason: 'unreachable' as const };
      if (input.binding.operation !== input.scope) return { ok: false as const, reason: 'malformed' as const };
      if (this.#grants.has(input.grantId)) return { ok: false as const, reason: 'duplicate_grant' as const };
      const scopeLoad = this.#scopes.get(input.scope) ?? defaultScope(input.scope, input.nowMs);
      if (scopeLoad.hold?.active) return { ok: false as const, reason: 'hold_active' as const };
      const grant: GrantRecord = {
        grantId: input.grantId,
        scope: input.scope,
        binding: input.binding,
        artifact: input.artifact,
        issuedAtGeneration: scopeLoad.generation,
        expiresAtMs: input.expiresAtMs,
        issuedAtMs: input.nowMs,
        approvalSubject: input.approvalSubject,
      };
      this.#grants.set(input.grantId, grant);
      return { ok: true as const, issuedAtGeneration: scopeLoad.generation };
    });
  }

  async transactConsumeWithAudit(
    input: TransactConsumeWithAuditInput
  ): Promise<TransactConsumeWithAuditResult> {
    return this.#withLock(() => this.#transactConsumeWithAuditLocked(input));
  }

  #transactConsumeWithAuditLocked(
    input: TransactConsumeWithAuditInput
  ): TransactConsumeWithAuditResult {
    if (this.#mode === 'unreachable') return { ok: false, reason: 'unreachable' };

    const logicalKey = operationLogicalKey({
      scope: input.scope,
      binding: input.binding,
      artifact: input.artifact,
      idempotencyKey: input.idempotencyKey,
    });
    const unresolved = this.#logicalIndex.get(logicalKey);
    if (unresolved) {
      const existing = this.#operations.get(unresolved);
      if (
        existing &&
        !isTerminalOperationState(existing.state) &&
        (existing.grantId !== input.grantId || existing.idempotencyKey !== input.idempotencyKey)
      ) {
        return { ok: false, reason: 'unresolved_operation' };
      }
    }

    const scopeRec = this.#scopes.get(input.scope) ?? defaultScope(input.scope, input.nowMs);
    if (scopeRec.hold?.active) return { ok: false, reason: 'hold_active' };

    const grant = this.#grants.get(input.grantId);
    if (!grant) return { ok: false, reason: 'missing' };
    if (grant.scope !== input.scope) return { ok: false, reason: 'scope_mismatch' };
    if (!grantBindingsMatch(grant.binding, input.binding)) return { ok: false, reason: 'binding_mismatch' };
    if (grant.expiresAtMs <= input.nowMs) return { ok: false, reason: 'expired' };

    const opId = input.operation.operationId;
    const existingOp = this.#operations.get(opId);
    if (existingOp) {
      if (existingOp.idempotencyKey !== input.idempotencyKey) {
        return { ok: false, reason: 'already_consumed' };
      }
      if (scopeRec.hold?.active) return { ok: false, reason: 'hold_blocks_replay' };
      return {
        ok: true,
        replay: true,
        consumedAtMs: existingOp.updatedAtMs,
        generationAtConsume: existingOp.generationAtOpen,
        providerMutationPermitted: false,
        auditDurablyAppended: true,
      };
    }

    if (grant.consume) {
      if (grant.consume.idempotencyKey !== input.idempotencyKey) {
        return { ok: false, reason: 'already_consumed' };
      }
    } else {
      if (grant.issuedAtGeneration !== scopeRec.generation) {
        return { ok: false, reason: 'stale_generation' };
      }
      if (!artifactsMatch(grant.artifact, input.artifact)) {
        return { ok: false, reason: 'artifact_mismatch' };
      }
      grant.consume = {
        consumedAtMs: input.nowMs,
        idempotencyKey: input.idempotencyKey,
        generationAtConsume: scopeRec.generation,
      };
      this.#grants.set(input.grantId, grant);
    }

    if (this.#operations.has(opId)) return { ok: false, reason: 'operation_duplicate' };

    this.#operations.set(opId, input.operation);
    this.#logicalIndex.set(logicalKey, opId);
    this.audits.push(input.audit);

    return {
      ok: true,
      replay: false,
      consumedAtMs: input.nowMs,
      generationAtConsume: scopeRec.generation,
      providerMutationPermitted: true,
      auditDurablyAppended: true,
    };
  }

  async transitionOperation(input: TransitionOperationInput): Promise<TransitionOperationResult> {
    return this.#withLock(() => {
      const op = this.#operations.get(input.operationId);
      if (!op) return { ok: false, reason: 'not_found' };
      if (
        input.expected.operationState !== undefined &&
        op.state !== input.expected.operationState
      ) {
        return { ok: false, reason: 'cas_conflict' };
      }
      if (
        input.expected.operationUpdatedAtMs !== undefined &&
        op.updatedAtMs !== input.expected.operationUpdatedAtMs
      ) {
        return { ok: false, reason: 'cas_conflict' };
      }
      const scopeRec = this.#scopes.get(op.scope);
      if (scopeRec?.hold?.active && input.nextState === 'submitting' && op.state === 'claimed') {
        return { ok: false, reason: 'hold_active' };
      }
      if (!canTransition(op.state, input.nextState)) {
        return { ok: false, reason: 'invalid_transition' };
      }
      if (input.markProviderSubmitAttempted && op.providerSubmitAttempted) {
        return { ok: false, reason: 'cas_conflict' };
      }
      const updated: PromotionOperation = {
        ...op,
        state: input.nextState,
        updatedAtMs: input.nowMs,
        providerSubmitAttempted:
          op.providerSubmitAttempted || Boolean(input.markProviderSubmitAttempted),
      };
      this.#operations.set(input.operationId, updated);
      return { ok: true, operation: updated };
    });
  }

  async appendAudit(event: import('./types').AuditEvent) {
    if (this.#mode === 'unreachable') return 'unreachable' as const;
    return this.#withLock(() => {
      this.audits.push(event);
      return 'ok' as const;
    });
  }
}
