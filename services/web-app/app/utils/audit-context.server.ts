import { AsyncLocalStorage } from 'node:async_hooks';

export type AuditRequestContext = {
  requestId: string;
  traceId: string;
  route: string;
  path: string;
  method: string;
  sessionId: string | null;
  userId: string | null;
  profileId: string | null;
  organizationId: string | null;
  classId: string | null;
  documentId: string | null;
  editorSessionId: string | null;
  suppressDbAudit?: boolean;
};

const auditContextStorage = new AsyncLocalStorage<AuditRequestContext>();

export function withAuditContext<T>(
  context: AuditRequestContext,
  run: () => Promise<T> | T
) {
  return auditContextStorage.run(context, run);
}

export function getAuditContext() {
  return auditContextStorage.getStore() ?? null;
}

export function updateAuditContext(patch: Partial<AuditRequestContext>) {
  const current = auditContextStorage.getStore();
  if (!current) return;
  Object.assign(current, patch);
}

export function withAuditSuppressed<T>(run: () => Promise<T> | T) {
  const current = auditContextStorage.getStore();
  if (!current) return run();
  return auditContextStorage.run(
    {
      ...current,
      suppressDbAudit: true,
    },
    run
  );
}
