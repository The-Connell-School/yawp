import type { Prisma, PrismaClient } from '@app/prisma';
import { prepareWorkspaceEvaluationRun } from '~/domain/ai-evaluation/grading-workspace-actions.server';
import type { AssignmentTypeEvaluationExecution } from '~/domain/ai-evaluation/assignment-type-evaluation-suite.server';
import { response } from './internal-admin-write.server';

export const INTERNAL_EVALUATION_RUN_BUDGET_MS = 45_000;
export const INTERNAL_EVALUATION_RUN_MAX_CASES = 8;
// App Runner's request ceiling. Recovery is lazy on the next run request; a
// crashed process cannot retain a database lock or strand the running guard.
export const INTERNAL_EVALUATION_RESERVATION_MS = 120_000;
const action = 'grading-workspace.runs.post';
const json = (value: unknown) => JSON.parse(JSON.stringify(value));
const pendingMessage =
  'An evaluation run request is waiting for another write; retry after it completes.';
const budgetMessage =
  'Evaluation run exceeded its 45-second time budget; reduce the case count or input size and retry.';

type StoredResponse = {
  status: number;
  body: { error: string } | { run: unknown };
};
function failure(error: unknown, signal: AbortSignal): StoredResponse {
  if (signal.aborted) return { status: 422, body: { error: budgetMessage } };
  const message = error instanceof Error ? error.message : '';
  if (/lock timeout/i.test(message))
    return { status: 409, body: { error: pendingMessage } };
  if (/statement timeout/i.test(message))
    return {
      status: 422,
      body: {
        error:
          'Evaluation run database time budget exceeded; retry the request.',
      },
    };
  return {
    status: 500,
    body: { error: 'The grading workspace request could not complete' },
  };
}
const replay = (stored: StoredResponse) =>
  response(stored.body, stored.status === 201 ? 200 : stored.status);

/** Two short transactions around provider execution. Before-audit rows also
 * reserve the scoped request durably; after-audit rows finalize its response.
 * Both transitions occur under the same parent and scoped advisory locks.
 */
export async function startInternalEvaluationRun(args: {
  db: Pick<PrismaClient, '$transaction'>;
  request: Request;
  assignmentTypeId: string;
  value: { promptVersion: string; suiteId: string; reason?: string };
  auth: { actorEmail: string; keyId: string };
  endpoint: string;
  hash: string;
  key: string;
  execute: (
    input: Omit<AssignmentTypeEvaluationExecution, 'evaluationCase'> & {
      signal?: AbortSignal;
    }
  ) => Promise<string>;
  budgetMs?: number;
}): Promise<Response> {
  const {
    db,
    request,
    assignmentTypeId: id,
    value,
    auth,
    endpoint,
    hash,
    key,
  } = args;
  const controller = new AbortController();
  const { signal } = controller;
  const timer = setTimeout(
    () => controller.abort(),
    Math.min(
      args.budgetMs ?? INTERNAL_EVALUATION_RUN_BUDGET_MS,
      INTERNAL_EVALUATION_RUN_BUDGET_MS
    )
  );
  const scope = JSON.stringify([
    action,
    endpoint,
    auth.actorEmail,
    auth.keyId,
    key,
  ]);
  const transaction = <T>(work: (tx: Prisma.TransactionClient) => Promise<T>) =>
    db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT set_config('lock_timeout', '5s', true), set_config('statement_timeout', '10s', true)`;
        await tx.$queryRaw`SELECT id FROM "AssignmentType" WHERE id = ${id} FOR UPDATE`;
        await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${scope},0))`;
        return work(tx);
      },
      { isolationLevel: 'ReadCommitted', timeout: 20_000, maxWait: 2000 }
    );
  const detail = (tx: Prisma.TransactionClient, runId: string) =>
    tx.assignmentTypeEvaluationRun.findFirst({
      where: { id: runId, assignmentTypeId: id },
      include: { results: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
    });
  const lookup = (tx: Prisma.TransactionClient, stage: 'before' | 'after') =>
    tx.internalPlatformApiAudit.findFirst({
      where: {
        endpoint,
        action: `${action}.${stage}`,
        result: stage,
        actorEmail: auth.actorEmail,
        keyId: auth.keyId,
        metadata: { path: ['idempotencyKey'], equals: key },
      },
      orderBy: { createdAt: 'desc' },
    });
  type Reservation = NonNullable<Awaited<ReturnType<typeof lookup>>>;
  const finalize = async (
    tx: Prisma.TransactionClient,
    reservation: Reservation,
    stored: StoredResponse
  ) => {
    const metadata = reservation.metadata as Record<string, unknown>;
    await tx.internalPlatformApiAudit.createMany({
      data: [
        {
          actorEmail: reservation.actorEmail,
          keyId: reservation.keyId,
          endpoint: reservation.endpoint,
          requestHash: reservation.requestHash,
          action: `${action}.after`,
          result: 'after',
          targetId: reservation.targetId,
          metadata: json({
            after: await detail(tx, reservation.targetId!),
            idempotencyKey: metadata.idempotencyKey,
            reason: metadata.reason ?? null,
            state: 'completed',
            response: stored,
          }),
        },
      ],
    });
  };
  const expire = async (
    tx: Prisma.TransactionClient,
    reservation: Reservation
  ) => {
    const run = await detail(tx, reservation.targetId!);
    if (run?.status === 'running')
      await tx.assignmentTypeEvaluationRun.update({
        where: { id: run.id },
        data: {
          status: 'failed',
          failedCases: run.totalCases,
          completedAt: new Date(),
        },
      });
    const stored: StoredResponse = {
      status: 422,
      body: { error: budgetMessage },
    };
    await finalize(tx, reservation, stored);
    return stored;
  };
  const expired = (reservation: Reservation) => {
    const expiresAt = (reservation.metadata as Record<string, unknown>)
      ?.expiresAt;
    return typeof expiresAt === 'string' && Date.parse(expiresAt) <= Date.now();
  };
  try {
    const preparation = await transaction(async (tx) => {
      if (!(await tx.assignmentType.findUnique({ where: { id } })))
        return response({ error: 'Assignment type not found' }, 404);
      // Read finalized rows first, including records written by the previous API.
      const completed = await lookup(tx, 'after');
      const reservation = completed ?? (await lookup(tx, 'before'));
      if (reservation) {
        if (reservation.requestHash !== hash)
          return response(
            {
              error:
                'Idempotency-Key was already used with a different request',
            },
            409
          );
        if (completed) {
          const stored = (completed.metadata as Record<string, unknown>)
            ?.response as StoredResponse | undefined;
          if (stored) return replay(stored);
          const existing = await detail(tx, completed.targetId!);
          return existing
            ? response({ run: existing })
            : response(
                { error: 'Idempotency-Key could not be replayed safely' },
                409
              );
        }
        return expired(reservation)
          ? replay(await expire(tx, reservation))
          : response({ error: pendingMessage }, 409);
      }
      // A new key must also be able to recover an expired artifact from a dead
      // request, otherwise the domain's one-running-run guard would strand it.
      const running = await tx.assignmentTypeEvaluationRun.findFirst({
        where: { assignmentTypeId: id, status: 'running' },
      });
      if (running) {
        const abandoned = await tx.internalPlatformApiAudit.findFirst({
          where: {
            action: `${action}.before`,
            result: 'before',
            targetId: running.id,
          },
          orderBy: { createdAt: 'desc' },
        });
        if (abandoned && expired(abandoned)) await expire(tx, abandoned);
      }
      const suite = await tx.assignmentTypeEvaluation.findFirst({
        where: { id: value.suiteId, assignmentTypeId: id, archivedAt: null },
      });
      if (!suite) return response({ error: 'Evaluation suite not found' }, 404);
      const prompt = await tx.assignmentTypePromptVersion.findFirst({
        where: {
          assignmentTypeId: id,
          ...(/^\d+$/.test(value.promptVersion)
            ? { version: Number(value.promptVersion) }
            : { id: value.promptVersion }),
        },
      });
      if (!prompt) return response({ error: 'Prompt version not found' }, 404);
      const prepared = await prepareWorkspaceEvaluationRun(
        {
          intent: 'runSuite',
          assignmentTypeId: id,
          promptVersionId: prompt.id,
        },
        request,
        tx,
        {
          maxCases: INTERNAL_EVALUATION_RUN_MAX_CASES,
          signal,
          execute: async ({ evaluationCase: _case, ...completion }) => {
            signal.throwIfAborted();
            let onAbort!: () => void;
            const aborted = new Promise<never>((_, reject) => {
              onAbort = () => reject(new Error(budgetMessage));
              signal.addEventListener('abort', onAbort, { once: true });
            });
            try {
              return await Promise.race([
                args.execute({ ...completion, signal }),
                aborted,
              ]);
            } finally {
              signal.removeEventListener('abort', onAbort);
            }
          },
        }
      );
      if (!('execute' in prepared))
        return response(
          {
            error:
              'message' in prepared.data
                ? prepared.data.message
                : 'Invalid grading workspace request',
          },
          prepared.init?.status ?? 400
        );
      signal.throwIfAborted();
      await tx.internalPlatformApiAudit.createMany({
        data: [
          {
            actorEmail: auth.actorEmail,
            keyId: auth.keyId,
            endpoint,
            requestHash: hash,
            action: `${action}.before`,
            result: 'before',
            targetId: prepared.run.id,
            metadata: json({
              before: null,
              idempotencyKey: key,
              reason: value.reason ?? null,
              state: 'pending',
              expiresAt: new Date(
                Date.now() + INTERNAL_EVALUATION_RESERVATION_MS
              ).toISOString(),
            }),
          },
        ],
      });
      return prepared;
    });
    if (preparation instanceof Response) return preparation;

    // No transaction client is used by execute: all inputs were captured above.
    let result: Awaited<ReturnType<typeof preparation.execute>> | undefined;
    let errorResponse: StoredResponse | undefined;
    try {
      result = await preparation.execute();
    } catch (error) {
      errorResponse = failure(error, signal);
    }
    const finish = (failed?: StoredResponse) =>
      transaction(async (tx) => {
        const completed = await lookup(tx, 'after');
        if (completed)
          return replay(
            (completed.metadata as Record<string, unknown>)
              .response as StoredResponse
          );
        const reservation = await lookup(tx, 'before');
        if (!reservation) throw new Error('Missing evaluation run reservation');
        const failedResponse =
          failed ?? (signal.aborted ? failure(null, signal) : undefined);
        if (failedResponse) await preparation.fail(tx);
        else await preparation.complete(tx, result!);
        const stored: StoredResponse = failedResponse ?? {
          status: 201,
          body: { run: await detail(tx, preparation.run.id) },
        };
        await finalize(tx, reservation, stored);
        return response(stored.body, stored.status);
      });
    try {
      return await finish(errorResponse);
    } catch (error) {
      // A database error rolls back Tx2. Retry only the failure transition in a
      // fresh short transaction; never issue queries in an aborted transaction.
      return await finish(failure(error, signal));
    }
  } catch (error) {
    const stored = failure(error, signal);
    return response(stored.body, stored.status);
  } finally {
    clearTimeout(timer);
  }
}
