import { remember } from '@epic-web/remember';
import { PrismaClient } from '@app/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { parse } from 'pg-connection-string';
import chalk from 'chalk';
import { getAuditContext, withAuditSuppressed } from './audit-context.server';
import {
  redactAuditPayload,
  serializeAuditError,
  summarizePrismaResult,
} from './audit-format.server';

/**
 * Prisma resolves the Postgres namespace from `DATABASE_URL` (e.g. `?schema=pr_7`).
 * `DATABASE_SCHEMA` is set on App Runner for PR previews; append the param before the client starts.
 */
function ensureDatabaseUrlIncludesSchemaQueryParam(): void {
  const schema = process.env.DATABASE_SCHEMA?.trim();
  if (!schema) return;

  const base = process.env.DATABASE_URL;
  if (!base) {
    throw new Error('DATABASE_URL is required');
  }
  if (/[?&]schema=/i.test(base)) return;

  const joiner = base.includes('?') ? '&' : '?';
  process.env.DATABASE_URL = `${base}${joiner}schema=${encodeURIComponent(schema)}`;
}

function requireDatabaseUrl(): string {
  const base =
    process.env.E2E_DATABASE_URL || process.env.DATABASE_URL;
  if (!base) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  return base;
}

/** Drop `sslmode` from the URL so `pg` does not merge parsed `ssl` over our option. */
function stripSslModeQuery(connectionString: string): string {
  const u = new URL(connectionString.replace(/^postgresql:/i, 'http:'));
  u.searchParams.delete('sslmode');
  return u.toString().replace(/^http:/, 'postgresql:');
}

function pgPoolConfig() {
  ensureDatabaseUrlIncludesSchemaQueryParam();
  const full = requireDatabaseUrl();
  const requiresTls =
    process.env.DATABASE_SSL_REQUIRE === 'true' ||
    /\.rds\.amazonaws\.com/i.test(full) ||
    /[?&]sslmode=require(?:&|$)/i.test(full) ||
    /[?&]sslmode=verify-ca(?:&|$)/i.test(full) ||
    /[?&]sslmode=verify-full(?:&|$)/i.test(full);

  const connStr = requiresTls ? stripSslModeQuery(full) : full;
  const parsed = parse(connStr) as Record<string, unknown>;
  const { ssl: _drop, schema: _schemaParam, ...rest } = parsed;

  const schema = process.env.DATABASE_SCHEMA?.trim();

  return {
    ...rest,
    connectionTimeoutMillis: 15_000,
    ...(schema ? { options: `-c search_path=${schema}` } : {}),
    ...(requiresTls ? { ssl: { rejectUnauthorized: false } } : {}),
  };
}

export const prismaRaw = remember('prisma.raw', () => {
  const logThreshold = 20;

  const connectionString =
    process.env.E2E_DATABASE_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  const schema = process.env.DATABASE_SCHEMA?.trim();
  const isSimpleLocal =
    !schema &&
    (connectionString.includes('localhost') ||
      connectionString.includes('127.0.0.1'));

  const adapter = isSimpleLocal
    ? new PrismaPg({
        connectionString,
        ssl: false,
      })
    : new PrismaPg(
        pgPoolConfig() as never,
        schema ? { schema } : undefined
      );

  const client = new PrismaClient({
    adapter,
    log: [
      { level: 'query', emit: 'event' },
      { level: 'error', emit: 'stdout' },
      { level: 'warn', emit: 'stdout' },
    ],
  });
  client.$on('query', async (e) => {
    if (e.duration < logThreshold) return;
    const color =
      e.duration < logThreshold * 1.1
        ? 'green'
        : e.duration < logThreshold * 1.2
          ? 'blue'
          : e.duration < logThreshold * 1.3
            ? 'yellow'
            : e.duration < logThreshold * 1.4
              ? 'redBright'
              : 'red';
    const dur = chalk[color](`${e.duration}ms`);
    // eslint-disable-next-line no-console
    console.info(`prisma:query - ${dur} - ${e.query}`);
  });
  return client;
});

export const prisma = remember('prisma', () => {
  return prismaRaw.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const auditContext = getAuditContext();
          if (
            !auditContext ||
            auditContext.suppressDbAudit ||
            model === 'AuditEvent' ||
            model === 'DocumentWriteJournal'
          ) {
            return query(args);
          }

          const startedAt = Date.now();

          try {
            const result = await query(args);
            const resolvedDocumentId =
              auditContext.documentId ??
              (typeof (args as { where?: { id?: unknown } }).where?.id === 'string'
                ? ((args as { where?: { id?: string } }).where?.id ?? null)
                : typeof (args as { data?: { documentId?: unknown } }).data
                        ?.documentId === 'string'
                  ? ((args as { data?: { documentId?: string } }).data?.documentId ??
                    null)
                  : null);

            await withAuditSuppressed(() =>
              prismaRaw.auditEvent.create({
                data: {
                  createdAt: new Date(),
                  source: 'server',
                  eventType: 'db.operation.completed',
                  requestId: auditContext.requestId,
                  traceId: auditContext.traceId,
                  route: auditContext.route,
                  path: auditContext.path,
                  method: auditContext.method,
                  durationMs: Date.now() - startedAt,
                  success: true,
                  userId: auditContext.userId,
                  profileId: auditContext.profileId,
                  sessionId: auditContext.sessionId,
                  editorSessionId: auditContext.editorSessionId,
                  documentId: resolvedDocumentId,
                  organizationId: auditContext.organizationId,
                  classId: auditContext.classId,
                  payload: {
                    model,
                    operation,
                    args: redactAuditPayload(args),
                    result: summarizePrismaResult(result),
                  },
                },
              })
            );

            return result;
          } catch (error) {
            await withAuditSuppressed(() =>
              prismaRaw.auditEvent.create({
                data: {
                  createdAt: new Date(),
                  source: 'server',
                  eventType: 'db.operation.failed',
                  requestId: auditContext.requestId,
                  traceId: auditContext.traceId,
                  route: auditContext.route,
                  path: auditContext.path,
                  method: auditContext.method,
                  durationMs: Date.now() - startedAt,
                  success: false,
                  userId: auditContext.userId,
                  profileId: auditContext.profileId,
                  sessionId: auditContext.sessionId,
                  editorSessionId: auditContext.editorSessionId,
                  documentId: auditContext.documentId,
                  organizationId: auditContext.organizationId,
                  classId: auditContext.classId,
                  payload: {
                    model,
                    operation,
                    args: redactAuditPayload(args),
                    error: serializeAuditError(error),
                  },
                },
              })
            );

            throw error;
          }
        },
      },
    },
  });
});
