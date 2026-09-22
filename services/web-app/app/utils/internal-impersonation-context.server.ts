import { AsyncLocalStorage } from 'node:async_hooks';
import type { Prisma, PrismaClient } from '@app/prisma';
import { withImpersonationTransaction, type ImpersonationAttribution, type ImpersonationOperation } from './internal-impersonation-writes.server';

type Database = InstanceType<typeof PrismaClient>;
type Scope = {
  identity: ImpersonationAttribution;
  operation: ImpersonationOperation;
  revalidate: () => Promise<ImpersonationAttribution>;
  finished: boolean;
};
const context = new AsyncLocalStorage<{ scope: Scope; tx?: Prisma.TransactionClient; transaction?: { open: boolean } }>();
const readMethods = new Set<PropertyKey>([
  'aggregate',
  'count',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'findUnique',
  'findUniqueOrThrow',
  'groupBy',
]);

export const getImpersonationAttribution = () => context.getStore()?.scope.identity ?? null;

export async function runWithImpersonation<T>(
  identity: ImpersonationAttribution, operation: ImpersonationOperation,
  revalidate: Scope['revalidate'], work: () => Promise<T>,
) {
  if (context.getStore()) throw new Error('Cannot replace an active impersonation context');
  const scope: Scope = { identity: Object.freeze({ ...identity }), operation: Object.freeze({ ...operation }), revalidate, finished: false };
  try { return await context.run({ scope }, work); }
  finally { scope.finished = true; }
}

/** Lazy operations preserve Prisma's array-transaction API; nothing runs before await. */
class AttributedQuery<T> implements PromiseLike<T> {
  readonly [Symbol.toStringTag] = 'PrismaPromise';
  private result?: Promise<T>;
  constructor(
    readonly scope: Scope,
    readonly auditCoverage: boolean,
    readonly execute: (tx: Prisma.TransactionClient) => Promise<T>,
    private run: () => Promise<T>,
  ) {}
  then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null): Promise<TResult1 | TResult2> {
    return (this.result ??= this.run()).then(onfulfilled, onrejected);
  }
  catch<TResult = never>(onrejected: (reason: unknown) => TResult | PromiseLike<TResult>) { return this.then(undefined, onrejected); }
  finally(onfinally: () => void) { return (this.result ??= this.run()).finally(onfinally); }
}

export function createAttributedPrisma(base: Database): Database {
  async function transaction<T>(
    scope: Scope,
    work: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: { isolationLevel?: string; timeout?: number; maxWait?: number; auditCoverage?: boolean },
  ) {
    // Descendant async work retains provenance after the HTTP response. It must
    // regain live authorization rather than inheriting a completed transaction.
    const identity = scope.finished ? await scope.revalidate() : scope.identity;
    if (identity.id !== scope.identity.id || identity.actorId !== scope.identity.actorId
      || identity.userId !== scope.identity.userId || identity.organizationId !== scope.identity.organizationId
      || identity.membershipId !== scope.identity.membershipId || identity.expiresAt !== scope.identity.expiresAt) {
      throw new Error('Impersonation context changed');
    }
    return withImpersonationTransaction(base, identity, {
      ...scope.operation, ...(scope.finished && !scope.operation.jobId ? { jobId: `tail-${scope.operation.requestId}` } : {}),
    }, async tx => {
      const transaction = { open: true };
      try { return await context.run({ scope, tx, transaction }, () => work(tx)); }
      finally { transaction.open = false; }
    }, options);
  }
  const models = new Map<PropertyKey, unknown>();
  const proxy: Database = new Proxy(base, {
    get(target, property) {
      const state = context.getStore();
      const value = Reflect.get(target, property);
      if (!state && typeof value === 'function') {
        return (...args: unknown[]) => context.getStore()
          ? Reflect.apply(Reflect.get(proxy, property), proxy, args)
          : Reflect.apply(value, target, args);
      }
      if (state && property === '$transaction') return (work: unknown, options?: { isolationLevel?: string; timeout?: number; maxWait?: number }) => {
        const active = context.getStore();
        if (!active) return Reflect.apply(value, target, [work, options]);
        if (active.tx && active.transaction?.open) throw new Error('Nested root transactions require an explicit transaction client');
        if (typeof work === 'function') return transaction(active.scope, tx => work(tx), { ...options, auditCoverage: true });
        if (!Array.isArray(work) || work.some(query => !(query instanceof AttributedQuery) || query.scope !== active.scope)) {
          throw new Error('Transaction contains queries outside this impersonation context');
        }
        const auditCoverage = work.some(query => query.auditCoverage);
        return transaction(active.scope, async tx => {
          const results = [];
          for (const query of work as AttributedQuery<unknown>[]) results.push(await query.execute(tx));
          return results;
        }, { ...options, auditCoverage });
      };
      const makeQuery = (model: PropertyKey | null, method: PropertyKey, args: unknown[], auditCoverage = true) => {
        const active = context.getStore();
        if (!active) return Reflect.apply(value, target, args);
        const execute = async (tx: Prisma.TransactionClient) => {
          const receiver = model === null ? tx : Reflect.get(tx, model);
          return Reflect.apply(Reflect.get(receiver, method), receiver, args);
        };
        if (active.tx && active.transaction?.open) return execute(active.tx);
        return new AttributedQuery(active.scope, auditCoverage, execute, () => transaction(active.scope, execute, { auditCoverage }));
      };
      if (state && typeof property === 'string' && property.startsWith('$')) {
        if (['$queryRaw', '$executeRaw', '$queryRawUnsafe', '$executeRawUnsafe'].includes(property)) {
          return (...args: unknown[]) => makeQuery(null, property, args);
        }
        throw new Error('Database administration is unavailable during impersonation');
      }
      if (!value || typeof value !== 'object') return value;
      // Model proxies consult the current scope at method invocation, not when
      // a caller happens to retrieve or cache the delegate.
      if (!models.has(property)) models.set(property, new Proxy(value, {
        get(delegate, method) {
          const fn = Reflect.get(delegate, method);
          if (typeof fn !== 'function') return fn;
          return (...args: unknown[]) => {
            const current = context.getStore();
            if (!current) return Reflect.apply(fn, delegate, args);
            const execute = async (tx: Prisma.TransactionClient) => {
              const receiver = Reflect.get(tx, property);
              return Reflect.apply(Reflect.get(receiver, method), receiver, args);
            };
            if (current.tx && current.transaction?.open) return execute(current.tx);
            const auditCoverage = !readMethods.has(method);
            return new AttributedQuery(current.scope, auditCoverage, execute, () => transaction(current.scope, execute, { auditCoverage }));
          };
        },
      }));
      return models.get(property);
    },
  });
  return proxy;
}
