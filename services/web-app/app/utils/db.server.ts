import { remember } from '@epic-web/remember';
import { PrismaClient } from '@app/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import chalk from 'chalk';
import { getAuditContext, withAuditSuppressed } from './audit-context.server';
import {
  redactAuditPayload,
  serializeAuditError,
  summarizePrismaResult,
} from './audit-format.server';

export const prismaRaw = remember('prisma.raw', () => {
  const logThreshold = 20;

  const connectionString =
    process.env.E2E_DATABASE_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  const isLocal =
    connectionString.includes('localhost') ||
    connectionString.includes('127.0.0.1');
  const adapter = new PrismaPg({
    connectionString,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });

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
