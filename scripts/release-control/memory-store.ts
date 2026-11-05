import type { GrantRecord, PromotionScope, ScopeRecord } from './types';
import type {
  ClearHoldInput,
  ConsumeGrantInput,
  ConsumeGrantResult,
  IssueGrantInput,
  PromotionStore,
  ScopeLoadResult,
  SetHoldInput,
} from './store';
import { artifactsMatch } from './artifact';

type StoreMode = 'healthy' | 'unreachable';

function defaultScope(scope: PromotionScope, nowMs: number): ScopeRecord {
  return {
    scope,
    generation: 0,
    hold: null,
    updatedAtMs: nowMs,
  };
}

/**
 * In-process store with mutex — simulates conditional DynamoDB updates for tests.
 */
export class MemoryPromotionStore implements PromotionStore {
  readonly #mode: StoreMode;
  #lock: Promise<void> = Promise.resolve();
  readonly #scopes = new Map<PromotionScope, ScopeRecord>();
  readonly #grants = new Map<string, GrantRecord>();
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

  /** Test helper — production table bootstrap creates scope rows explicitly. */
  seedScope(scope: PromotionScope, record: ScopeRecord): void {
    this.#scopes.set(scope, record);
  }

  async #withLock<T>(fn: () => T | Promise<T>): Promise<T> {
    if (this.#mode === 'unreachable') {
      throw new Error('store unreachable');
    }
    let release!: () => void;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
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
    if (this.#mode === 'unreachable') {
      return { ok: false, reason: 'unreachable' };
    }
    const record = this.#scopes.get(scope);
    if (!record) return { ok: false, reason: 'missing' };
    if (typeof record.generation !== 'number' || record.generation < 0) {
      return { ok: false, reason: 'malformed' };
    }
    return { ok: true, record };
  }

  async loadGrant(
    grantId: string
  ): Promise<GrantRecord | 'missing' | 'malformed' | 'unreachable'> {
    if (this.#mode === 'unreachable') return 'unreachable';
    const grant = this.#grants.get(grantId);
    if (!grant) return 'missing';
    if (!grant.grantId || !grant.scope) return 'malformed';
    return grant;
  }

  async setHold(input: SetHoldInput) {
    return this.#withLock(() => {
      if (this.#mode === 'unreachable') {
        return { ok: false as const, reason: 'unreachable' as const };
      }
      const current = this.#scopes.get(input.scope) ?? defaultScope(input.scope, input.nowMs);
      const nextGeneration = current.generation + 1;
      const record: ScopeRecord = {
        scope: input.scope,
        generation: nextGeneration,
        hold: {
          active: true,
          permanent: input.permanent,
          reason: input.reason,
          setAtMs: input.nowMs,
          setBySubject: input.setBySubject,
          generationWhenSet: nextGeneration,
        },
        updatedAtMs: input.nowMs,
      };
      this.#scopes.set(input.scope, record);
      return { ok: true as const, generation: nextGeneration };
    });
  }

  async clearHold(input: ClearHoldInput) {
    return this.#withLock(() => {
      if (this.#mode === 'unreachable') {
        return { ok: false as const, reason: 'unreachable' as const };
      }
      const current = this.#scopes.get(input.scope);
      if (!current?.hold) {
        return { ok: false as const, reason: 'no_hold' as const };
      }
      if (current.hold.permanent && !input.forceClearPermanent) {
        return { ok: false as const, reason: 'hold_permanent' as const };
      }
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
      if (this.#mode === 'unreachable') {
        return { ok: false as const, reason: 'unreachable' as const };
      }
      if (this.#grants.has(input.grantId)) {
        return { ok: false as const, reason: 'duplicate_grant' as const };
      }
      const scopeLoad = this.#scopes.get(input.scope) ?? defaultScope(input.scope, input.nowMs);
      if (scopeLoad.hold?.active) {
        return { ok: false as const, reason: 'hold_active' as const };
      }
      const issuedAtGeneration = scopeLoad.generation;
      const grant: GrantRecord = {
        grantId: input.grantId,
        scope: input.scope,
        artifact: input.artifact,
        issuedAtGeneration,
        expiresAtMs: input.expiresAtMs,
        issuedAtMs: input.nowMs,
        approvalSubject: input.approvalSubject,
      };
      this.#grants.set(input.grantId, grant);
      return { ok: true as const, issuedAtGeneration };
    });
  }

  async consumeGrant(input: ConsumeGrantInput): Promise<ConsumeGrantResult> {
    return this.#withLock(() => {
      if (this.#mode === 'unreachable') {
        return { ok: false, reason: 'unreachable' };
      }
      const scopeRec =
        this.#scopes.get(input.scope) ?? defaultScope(input.scope, input.nowMs);
      if (scopeRec.hold?.active) {
        return { ok: false, reason: 'hold_active' };
      }
      const grant = this.#grants.get(input.grantId);
      if (!grant) return { ok: false, reason: 'missing' };
      if (grant.scope !== input.scope) {
        return { ok: false, reason: 'scope_mismatch' };
      }
      if (grant.expiresAtMs <= input.nowMs) {
        return { ok: false, reason: 'expired' };
      }
      if (grant.consume) {
        if (grant.consume.idempotencyKey === input.idempotencyKey) {
          return {
            ok: true,
            replay: true,
            consumedAtMs: grant.consume.consumedAtMs,
            generationAtConsume: grant.issuedAtGeneration,
          };
        }
        return { ok: false, reason: 'already_consumed' };
      }
      if (grant.issuedAtGeneration !== scopeRec.generation) {
        return { ok: false, reason: 'stale_generation' };
      }
      if (!artifactsMatch(grant.artifact, input.artifact)) {
        return { ok: false, reason: 'artifact_mismatch' };
      }
      grant.consume = {
        consumedAtMs: input.nowMs,
        idempotencyKey: input.idempotencyKey,
      };
      this.#grants.set(input.grantId, grant);
      return {
        ok: true,
        replay: false,
        consumedAtMs: input.nowMs,
        generationAtConsume: scopeRec.generation,
      };
    });
  }

  async appendAudit(event: import('./types').AuditEvent) {
    if (this.#mode === 'unreachable') return 'unreachable';
    this.audits.push(event);
    return 'ok';
  }
}
