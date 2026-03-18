import { randomUUID } from 'node:crypto';
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { Prisma } from '@app/prisma';
import {
  getAuditContext,
  withAuditContext,
  type AuditRequestContext,
} from './audit-context.server';
import {
  redactAuditPayload,
  serializeAuditError,
} from './audit-format.server';
import { persistAuditEvent } from './audit-repository.server';

export { redactAuditPayload } from './audit-format.server';

type RouteHandlerArgs = ActionFunctionArgs | LoaderFunctionArgs;
type RouteHandler<TArgs extends RouteHandlerArgs, TResult> = (
  args: TArgs
) => Promise<TResult> | TResult;

type AuditEventInput = {
  createdAt?: Date;
  source?: string;
  eventType: string;
  requestId?: string | null;
  traceId?: string | null;
  route?: string | null;
  path?: string | null;
  method?: string | null;
  statusCode?: number | null;
  durationMs?: number | null;
  success?: boolean | null;
  userId?: string | null;
  profileId?: string | null;
  sessionId?: string | null;
  editorSessionId?: string | null;
  documentId?: string | null;
  organizationId?: string | null;
  classId?: string | null;
  payload?: unknown;
  metadata?: unknown;
};

function toInputJsonValue(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}

function getStatusCode(result: unknown) {
  if (result instanceof Response) {
    return result.status;
  }

  if (
    result &&
    typeof result === 'object' &&
    'init' in result &&
    result.init &&
    typeof result.init === 'object' &&
    'status' in result.init &&
    typeof result.init.status === 'number'
  ) {
    return result.init.status;
  }

  if (
    result &&
    typeof result === 'object' &&
    'status' in result &&
    typeof result.status === 'number'
  ) {
    return result.status;
  }

  return 200;
}

function buildInitialAuditContext(request: Request): AuditRequestContext {
  const url = new URL(request.url);
  const requestId = request.headers.get('x-request-id') ?? randomUUID();
  const traceId = request.headers.get('x-trace-id') ?? requestId;
  return {
    requestId,
    traceId,
    route: url.pathname,
    path: url.pathname,
    method: request.method,
    sessionId: null,
    userId: null,
    profileId: null,
    organizationId: null,
    classId: null,
    documentId: null,
    editorSessionId: null,
  };
}

export function recordAuditEvent(input: AuditEventInput) {
  const context = getAuditContext();
  return persistAuditEvent({
    createdAt: input.createdAt ?? new Date(),
    source: input.source ?? 'server',
    eventType: input.eventType,
    requestId: input.requestId ?? context?.requestId ?? null,
    traceId: input.traceId ?? context?.traceId ?? null,
    route: input.route ?? context?.route ?? null,
    path: input.path ?? context?.path ?? null,
    method: input.method ?? context?.method ?? null,
    statusCode: input.statusCode ?? null,
    durationMs: input.durationMs ?? null,
    success: input.success ?? null,
    userId: input.userId ?? context?.userId ?? null,
    profileId: input.profileId ?? context?.profileId ?? null,
    sessionId: input.sessionId ?? context?.sessionId ?? null,
    editorSessionId: input.editorSessionId ?? context?.editorSessionId ?? null,
    documentId: input.documentId ?? context?.documentId ?? null,
    organizationId: input.organizationId ?? context?.organizationId ?? null,
    classId: input.classId ?? context?.classId ?? null,
    payload: toInputJsonValue(redactAuditPayload(input.payload)),
    metadata: toInputJsonValue(redactAuditPayload(input.metadata)),
  });
}

function createRouteAuditWrapper<TArgs extends RouteHandlerArgs, TResult>(
  handler: RouteHandler<TArgs, TResult>
) {
  return async (args: TArgs) => {
    const context = buildInitialAuditContext(args.request);

    return withAuditContext(context, async () => {
      const startedAt = Date.now();

      try {
        const result = await handler(args);
        const statusCode = getStatusCode(result);
        if (statusCode >= 500) {
          await recordAuditEvent({
            eventType: 'api.request.completed',
            statusCode,
            success: false,
            durationMs: Date.now() - startedAt,
          });
        }
        return result;
      } catch (error) {
        const statusCode =
          error instanceof Response
            ? error.status
            : typeof error === 'object' &&
                error &&
                'status' in error &&
                typeof (error as { status?: unknown }).status === 'number'
              ? (error as { status: number }).status
              : 500;

        if (statusCode >= 500) {
          await recordAuditEvent({
            eventType: 'api.request.completed',
            statusCode,
            success: false,
            durationMs: Date.now() - startedAt,
            payload: {
              error: serializeAuditError(error),
            },
          });
        }
        throw error;
      }
    });
  };
}

export function auditAction<TResult>(
  handler: RouteHandler<ActionFunctionArgs, TResult>
) {
  return createRouteAuditWrapper(handler);
}

export function auditLoader<TResult>(
  handler: RouteHandler<LoaderFunctionArgs, TResult>
) {
  return createRouteAuditWrapper(handler);
}
