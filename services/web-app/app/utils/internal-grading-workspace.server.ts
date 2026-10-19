import type { Prisma, PrismaClient } from '@app/prisma';
import { z } from 'zod';
import { authorizeInternalApiRequest } from './internal-platform-auth.server';
import {
  response,
  readBoundedBody,
  requestHash,
  reasonSchema,
  writeAuditRows,
} from './internal-admin-write.server';
import {
  identifier,
  auditRead,
  type AssignmentTypeReadAudit,
} from './internal-assignment-types.server';
import {
  executeGradingWorkspaceAction,
  WorkspaceActionSchema,
  updateWorkspaceEvaluationCase,
  parseCopyableExpectedOutput,
  MAX_EVALUATION_GROUP_CASES,
} from '~/domain/ai-evaluation/grading-workspace-actions.server';
import { resolveAssignmentTypeGradingConfig } from '~/domain/assignment-types/assignment-type-grading-config.server';
import {
  gradingConfigWithPromptVersion,
  createEvaluationSuiteVersion,
} from '~/domain/ai-evaluation/prompt-version-control.server';
import { runGradingAssistantScratchEvaluation } from '~/domain/ai-evaluation/grading-assistant-scratch-evaluation.server';
import { gradingAssistantBenchmarkV1 } from '~/domain/ai-evaluation/grading-assistant-benchmark.v1';
import {
  buildStaticThesisGradingConfig,
  runLiveGradingAssistantBenchmarkCase,
} from '~/domain/ai-evaluation/grading-assistant-benchmark-run.server';
import { getLLMCompletion } from './getLLMCompletion';
import { computeIpHash } from './ai-usage-log.server';
import { AP_HISTORY_ASSIGNMENT_TYPE_KEY } from '~/domain/ap-history/schema';
import { randomUUID } from 'node:crypto';

const text = (max: number) => z.string().trim().min(1).max(max);
const ref = z.string().regex(identifier);
const promptRef = ref.refine(
  (v) =>
    !/^\d+$/.test(v) ||
    (Number.isSafeInteger(Number(v)) &&
      Number(v) >= 1 &&
      Number(v) <= 2147483647)
);
const expectedOutput = z
  .object({
    categories: z
      .array(
        z
          .object({
            key: text(120),
            score: z.number().finite(),
            comment: text(2000),
          })
          .strict()
      )
      .min(1),
    overallComment: text(4000),
  })
  .strict();
const suiteCase = z
  .object({ name: text(160), sample: text(50000), expectedOutput })
  .strict();
const schemas = {
  promptVersions: z
    .object({ sourcePromptVersion: ref.optional(), reason: reasonSchema })
    .strict(),
  promptVersion: z
    .object({
      systemMessageTemplate: text(30000).optional(),
      userMessageTemplate: text(50000).optional(),
      reason: reasonSchema,
    })
    .strict()
    .refine(
      (v) =>
        v.systemMessageTemplate !== undefined ||
        v.userMessageTemplate !== undefined
    ),
  // Promotion currently has one environment and no regression-acceptance policy.
  publish: z
    .object({
      acceptedRegressions: z.array(z.never()).max(0),
      environment: z.literal('production'),
      reason: reasonSchema,
    })
    .strict(),
  suites: z
    .object({
      name: text(160),
      check: text(4000),
      cases: z.array(suiteCase).min(1).max(8),
      reason: reasonSchema,
    })
    .strict(),
  suite: z
    .object({
      name: text(160),
      check: text(4000),
      cases: z
        .array(suiteCase.extend({ id: ref }))
        .min(1)
        .max(MAX_EVALUATION_GROUP_CASES),
      reason: reasonSchema,
    })
    .strict()
    .refine((v) => new Set(v.cases.map((c) => c.id)).size === v.cases.length),
  cases: z
    .object({
      name: text(160),
      sample: text(50000),
      rubricCategoryKey: text(120),
      check: text(4000).optional(),
      // Grouped cases must remain saveable by the admin group editor.
      expectedOutput,
      reason: reasonSchema,
    })
    .strict(),
  case: z
    .object({
      name: text(160).optional(),
      sample: text(50000).optional(),
      check: text(4000).optional(),
      expectedOutput: expectedOutput.optional(),
      reason: reasonSchema,
    })
    .strict(),
  scratch: z
    .object({
      promptVersion: ref,
      sampleSubmission: text(50000),
      check: text(4000),
      reason: reasonSchema,
    })
    .strict(),
  runs: z
    .object({ promptVersion: promptRef, suiteId: ref, reason: reasonSchema })
    .strict(),
  benchmarkRun: z.object({ reason: reasonSchema }).strict(),
};
export type GradingWorkspaceResource =
  | keyof typeof schemas
  | 'run'
  | 'benchmarkCases';
const allowed: Record<GradingWorkspaceResource, string[]> = {
  promptVersions: ['GET', 'POST'],
  promptVersion: ['GET', 'PATCH', 'DELETE'],
  publish: ['POST'],
  suites: ['GET', 'POST'],
  suite: ['PATCH', 'DELETE'],
  cases: ['POST'],
  case: ['PATCH', 'DELETE'],
  scratch: ['POST'],
  runs: ['GET', 'POST'],
  run: ['GET'],
  benchmarkCases: ['GET'],
  benchmarkRun: ['POST'],
};
// Production App Runner and CloudFront allow 120s (infra/main.tf). Reserve
// ample time for body/auth, lock acquisition, rollback, audits, and the response.
export const INTERNAL_EVALUATION_RUN_BUDGET_MS = 45_000;
export const INTERNAL_EVALUATION_RUN_MAX_CASES = 8;
const json = (v: unknown) => JSON.parse(JSON.stringify(v));

export function createInternalGradingWorkspaceHandlers(input: {
  db: Pick<PrismaClient, '$transaction'>;
  authenticate?: typeof authorizeInternalApiRequest;
  auditRead?: AssignmentTypeReadAudit;
  /** May shorten the fixed production budget for deterministic timeout tests. */
  runBudgetMs?: number;
  execute?: (input: {
    signal?: AbortSignal;
    purpose: string;
    system: string;
    messages: Array<{ role: 'user'; content: string }>;
    maxTokens: number;
    temperature?: number;
  }) => Promise<string>;
}) {
  return {
    async handle(
      resource: GradingWorkspaceResource,
      request: Request,
      id?: string,
      child?: string,
      caseId?: string
    ): Promise<Response> {
      if (!allowed[resource].includes(request.method))
        return response({ error: 'Method not allowed' }, 405);
      const read = request.method === 'GET';
      let body: Uint8Array;
      try {
        body = await readBoundedBody(request, 256 * 1024);
      } catch (e) {
        if (e instanceof Response) return e;
        throw e;
      }
      const auth = await (input.authenticate ?? authorizeInternalApiRequest)(
        request,
        { body, requiredScope: read ? 'management:read' : 'management:write' }
      );
      if (auth instanceof Response) return auth;
      if (auth.mode !== 'hmac') return response({ error: 'Unauthorized' }, 401);
      const benchmark = resource.startsWith('benchmark');
      if (!benchmark && (!id || !identifier.test(id)))
        return response({ error: 'Invalid assignment type' }, 400);
      if (
        [
          'promptVersion',
          'publish',
          'suite',
          'cases',
          'case',
          'run',
          'benchmarkRun',
        ].includes(resource) &&
        (!child || !identifier.test(child))
      )
        return response({ error: 'Invalid resource' }, 400);
      if (resource === 'case' && (!caseId || !identifier.test(caseId)))
        return response({ error: 'Invalid case' }, 400);
      let value: any = {};
      try {
        const decoded = new TextDecoder('utf-8', {
          fatal: true,
          ignoreBOM: true,
        }).decode(body);
        value = JSON.parse(decoded || '{}');
      } catch {
        return response({ error: 'Invalid JSON' }, 400);
      }
      if (!read) {
        const schema =
          request.method === 'DELETE'
            ? z.object({ reason: reasonSchema }).strict()
            : schemas[resource as keyof typeof schemas];
        const parsed = schema?.safeParse(value);
        if (!parsed?.success)
          return response({ error: 'Invalid grading workspace request' }, 400);
        value = parsed.data;
      }
      if (
        child &&
        /^\d+$/.test(child) &&
        ['promptVersion', 'publish'].includes(resource) &&
        (!Number.isSafeInteger(Number(child)) ||
          Number(child) < 1 ||
          Number(child) > 2147483647)
      )
        return response({ error: 'Invalid prompt version' }, 400);
      const query = new URL(request.url).searchParams;
      const filters = z
        .object({
          tag: text(120).optional(),
          strictness: z
            .enum(['beginner', 'intermediate', 'advanced'])
            .optional(),
        })
        .strict()
        .safeParse(Object.fromEntries(query));
      if (
        (resource === 'benchmarkCases' &&
          (!filters.success ||
            [...query.keys()].some((k) => query.getAll(k).length !== 1))) ||
        (resource !== 'benchmarkCases' && query.size)
      )
        return response({ error: 'Invalid query' }, 400);
      const endpoint = `${request.method} ${new URL(request.url).pathname.replace(/\/$/, '')}`;
      const hash = requestHash(body);
      const create =
        !read &&
        ['promptVersions', 'suites', 'cases', 'runs'].includes(resource);
      const key = create
        ? request.headers.get('idempotency-key')?.trim() || null
        : null;
      if (resource === 'runs' && create && !key)
        return response({ error: 'Idempotency-Key is required' }, 400);
      if (
        resource === 'runs' &&
        key &&
        (key.length > 200 || !/^[\x21-\x7e]+$/.test(key))
      )
        return response({ error: 'Invalid Idempotency-Key' }, 400);
      const runController =
        resource === 'runs' && create ? new AbortController() : null;
      const runTimer = runController
        ? setTimeout(
            () => runController.abort(),
            Math.min(
              input.runBudgetMs ?? INTERNAL_EVALUATION_RUN_BUDGET_MS,
              INTERNAL_EVALUATION_RUN_BUDGET_MS
            )
          )
        : null;
      const budgetError = () =>
        response(
          {
            error:
              'Evaluation run exceeded its 45-second time budget; reduce the case count or input size and retry.',
          },
          422
        );
      const action = `grading-workspace.${resource}.${request.method.toLowerCase()}`;
      const execute =
        input.execute ??
        (async ({ purpose, ...completion }) =>
          getLLMCompletion({
            ...completion,
            logPayload: resource === 'scratch' ? 'audit-only' : 'metadata-only',
            model: process.env.AI_MODEL ?? 'claude-sonnet-4-6',
            metadata: {
              feature: 'grading-evaluation',
              kind: purpose,
              assignmentTypeId: id ?? 'static-thesis-default',
            },
            attribution: {
              organizationId: null,
              membershipId: null,
              route: 'api/internal/v1/admin/grading-workspace',
              requestId: randomUUID(),
              ipHash: computeIpHash(request),
            },
          }));
      try {
        return await input.db.$transaction(
          async (tx) => {
            // Driver transaction deadlines alone need not interrupt a blocked
            // Postgres statement. Bound lock/query waits on the server too.
            if (runController)
              await tx.$queryRaw`SELECT set_config('lock_timeout', '5s', true), set_config('statement_timeout', '10s', true)`;
            if (!read) {
              if (benchmark)
                await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`grading-benchmark:${child}`},0))`;
              else
                await tx.$queryRaw`SELECT id FROM "AssignmentType" WHERE id = ${id!} FOR UPDATE`;
            }
            const parent = benchmark
              ? null
              : await tx.assignmentType.findUnique({ where: { id: id! } });
            if (!benchmark && !parent)
              return response({ error: 'Assignment type not found' }, 404);
            const prompt = async (version: string) =>
              tx.assignmentTypePromptVersion.findFirst({
                where: {
                  assignmentTypeId: id!,
                  ...(/^\d+$/.test(version)
                    ? { version: Number(version) }
                    : { id: version }),
                },
              });
            const suite = async (suiteId: string) =>
              tx.assignmentTypeEvaluation.findFirst({
                where: { id: suiteId, assignmentTypeId: id!, archivedAt: null },
                include: {
                  cases: {
                    where: { archivedAt: null },
                    orderBy: [{ position: 'asc' }, { id: 'asc' }],
                  },
                },
              });
            const runDetail = (runId: string) =>
              tx.assignmentTypeEvaluationRun.findFirst({
                where: { id: runId, assignmentTypeId: id! },
                include: {
                  results: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
                },
              });
            async function invoke(fields: unknown) {
              // Reuse admin validation and behavior inside the API's transaction; nested
              // domain transactions join it, so domain changes and audits roll back together.
              const db = new Proxy(tx, {
                get(target, prop) {
                  return prop === '$transaction'
                    ? (fn: (db: Prisma.TransactionClient) => unknown) => fn(tx)
                    : Reflect.get(target, prop);
                },
              }) as PrismaClient;
              const result = await executeGradingWorkspaceAction(
                WorkspaceActionSchema.parse(fields),
                request,
                db,
                resource === 'runs'
                  ? {
                      maxCases: INTERNAL_EVALUATION_RUN_MAX_CASES,
                      signal: runController!.signal,
                      execute: async ({
                        evaluationCase: _evaluationCase,
                        ...completion
                      }) => {
                        const signal = runController!.signal;
                        signal.throwIfAborted();
                        // Race also bounds injected providers that ignore AbortSignal.
                        let onAbort: () => void;
                        const aborted = new Promise<never>((_, reject) => {
                          onAbort = () =>
                            reject(
                              new Error('Evaluation run time budget exceeded')
                            );
                          signal.addEventListener('abort', onAbort, {
                            once: true,
                          });
                        });
                        try {
                          return await Promise.race([
                            execute({ ...completion, signal }),
                            aborted,
                          ]);
                        } finally {
                          signal.removeEventListener('abort', onAbort!);
                        }
                      },
                    }
                  : undefined
              );
              if (runController?.signal.aborted) throw budgetError();
              if (!result.data.success)
                throw response(
                  {
                    error:
                      'message' in result.data
                        ? result.data.message
                        : 'Invalid grading workspace request',
                  },
                  result.init?.status ?? 400
                );
              return result.data;
            }
            if (read) {
              let result: unknown;
              if (resource === 'promptVersions')
                result = {
                  promptVersions: await tx.assignmentTypePromptVersion.findMany(
                    {
                      where: { assignmentTypeId: id! },
                      orderBy: { version: 'desc' },
                    }
                  ),
                };
              else if (resource === 'promptVersion') {
                const row = await prompt(child!);
                if (!row)
                  return response({ error: 'Prompt version not found' }, 404);
                result = { promptVersion: row };
              } else if (resource === 'suites')
                result = {
                  suites: await tx.assignmentTypeEvaluation.findMany({
                    where: { assignmentTypeId: id!, archivedAt: null },
                    include: {
                      cases: {
                        where: { archivedAt: null },
                        orderBy: [{ position: 'asc' }, { id: 'asc' }],
                      },
                    },
                    orderBy: [{ position: 'asc' }, { id: 'asc' }],
                  }),
                };
              else if (resource === 'runs')
                result = {
                  runs: await tx.assignmentTypeEvaluationRun.findMany({
                    where: { assignmentTypeId: id! },
                    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                    take: 100,
                  }),
                };
              else if (resource === 'run') {
                const run = await tx.assignmentTypeEvaluationRun.findFirst({
                  where: { id: child!, assignmentTypeId: id! },
                  include: {
                    results: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
                  },
                });
                if (!run)
                  return response({ error: 'Evaluation run not found' }, 404);
                result = { run };
              } else {
                const f = filters.success ? filters.data : {};
                result = {
                  cases: gradingAssistantBenchmarkV1.cases.filter(
                    (c) =>
                      (!f.tag || c.tags.includes(f.tag)) &&
                      (!f.strictness || c.input.strictness === f.strictness)
                  ),
                };
              }
              await auditRead(
                request,
                auth,
                input.auditRead,
                `grading-workspace.${resource}.success`
              );
              return response(result);
            }
            if (key) {
              const scope = JSON.stringify([
                action,
                endpoint,
                auth.actorEmail,
                auth.keyId,
                key,
              ]);
              await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${scope},0))`;
              const previous = await tx.internalPlatformApiAudit.findFirst({
                where: {
                  endpoint,
                  action: `${action}.after`,
                  result: 'after',
                  actorEmail: auth.actorEmail,
                  keyId: auth.keyId,
                  metadata: { path: ['idempotencyKey'], equals: key },
                },
                orderBy: { createdAt: 'desc' },
              });
              if (previous) {
                if (previous.requestHash !== hash)
                  return response(
                    {
                      error:
                        'Idempotency-Key was already used with a different request',
                    },
                    409
                  );
                const owner = resource === 'cases' ? await suite(child!) : null;
                const existing =
                  resource === 'runs'
                    ? await runDetail(previous.targetId!)
                    : resource === 'promptVersions'
                      ? await prompt(previous.targetId!)
                      : resource === 'cases'
                        ? owner?.cases.find((c) => c.id === previous.targetId)
                        : await suite(previous.targetId!);
                if (!existing)
                  return response(
                    { error: 'Idempotency-Key could not be replayed safely' },
                    409
                  );
                return response(
                  resource === 'runs'
                    ? { run: existing }
                    : resource === 'promptVersions'
                      ? { promptVersion: existing }
                      : resource === 'cases'
                        ? { case: existing }
                        : { suite: existing }
                );
              }
            }
            let before: unknown = null,
              after: unknown = null,
              result: unknown,
              targetId = child ?? id!;
            if (resource === 'runs') {
              const owner = await suite(value.suiteId);
              if (!owner)
                return response({ error: 'Evaluation suite not found' }, 404);
              const row = await prompt(value.promptVersion);
              if (!row)
                return response({ error: 'Prompt version not found' }, 404);
              // Admin promotion requires the full current assignment type snapshot,
              // including other active groups and legacy cases, never a partial run.
              const started = await invoke({
                intent: 'runSuite',
                assignmentTypeId: id,
                promptVersionId: row.id,
              });
              targetId = 'runId' in started ? String(started.runId) : '';
              after = await runDetail(targetId);
              result = { run: after };
            } else if (
              resource === 'promptVersion' &&
              request.method === 'DELETE'
            ) {
              const row = await prompt(child!);
              if (!row)
                return response({ error: 'Prompt version not found' }, 404);
              if (
                row.status !== 'draft' ||
                row.version === parent!.gradingAssistantVersion
              )
                return response(
                  {
                    error:
                      'Only inactive draft prompt versions can be discarded',
                  },
                  409
                );
              before = row;
              targetId = row.id;
              // No admin discard action exists. FK SetNull retains historical runs.
              await tx.assignmentTypePromptVersion.delete({
                where: { id: row.id },
              });
              result = { deleted: { id: row.id } };
            } else if (resource === 'suite' && request.method === 'DELETE') {
              const row = await suite(child!);
              if (!row)
                return response({ error: 'Evaluation suite not found' }, 404);
              before = row;
              const archivedAt = new Date();
              await tx.assignmentTypeEvaluation.updateMany({
                where: { id: row.id, assignmentTypeId: id!, archivedAt: null },
                data: { archivedAt },
              });
              await tx.assignmentTypeEvaluationCase.updateMany({
                where: {
                  evaluationId: row.id,
                  assignmentTypeId: id!,
                  archivedAt: null,
                },
                data: { archivedAt },
              });
              await createEvaluationSuiteVersion(tx, id!);
              after = {
                ...row,
                archivedAt,
                cases: row.cases.map((c) => ({ ...c, archivedAt })),
              };
              result = { deleted: { id: row.id } };
            } else if (resource === 'promptVersions') {
              const source = value.sourcePromptVersion
                ? await prompt(value.sourcePromptVersion)
                : null;
              if (value.sourcePromptVersion && !source)
                return response({ error: 'Prompt version not found' }, 404);
              const created = await invoke({
                intent: 'createPromptDraft',
                assignmentTypeId: id,
                sourcePromptVersionId: source?.id,
              });
              targetId =
                'promptVersionId' in created
                  ? String(created.promptVersionId)
                  : '';
              after = await prompt(targetId);
              result = { promptVersion: after };
            } else if (resource === 'promptVersion' || resource === 'publish') {
              const row = await prompt(child!);
              if (!row || row.status !== 'draft')
                return response(
                  { error: 'Editable prompt draft not found' },
                  404
                );
              before =
                resource === 'publish'
                  ? {
                      promptVersions:
                        await tx.assignmentTypePromptVersion.findMany({
                          where: { assignmentTypeId: id! },
                        }),
                      assignmentType: parent,
                    }
                  : row;
              await invoke({
                intent:
                  resource === 'publish'
                    ? 'promotePromptDraft'
                    : 'updatePromptDraft',
                assignmentTypeId: id,
                promptVersionId: row.id,
                ...(resource === 'promptVersion'
                  ? {
                      systemMessageTemplate:
                        value.systemMessageTemplate ??
                        row.systemMessageTemplate,
                      userMessageTemplate:
                        value.userMessageTemplate ?? row.userMessageTemplate,
                    }
                  : {}),
              });
              targetId = row.id;
              after = await prompt(row.id);
              result = { promptVersion: after };
              // Publishing dual-writes the legacy assignment config in the shared action.
              if (resource === 'publish') {
                after = {
                  promptVersions: await tx.assignmentTypePromptVersion.findMany(
                    { where: { assignmentTypeId: id! } }
                  ),
                  assignmentType: await tx.assignmentType.findUnique({
                    where: { id: id! },
                  }),
                };
              }
            } else if (resource === 'suites' || resource === 'suite') {
              if (resource === 'suite') {
                before = await suite(child!);
                if (!before)
                  return response({ error: 'Evaluation suite not found' }, 404);
              }
              const saved = await invoke({
                intent:
                  resource === 'suites'
                    ? 'createEvaluation'
                    : 'updateEvaluation',
                assignmentTypeId: id,
                ...(resource === 'suite' ? { evaluationId: child } : {}),
                title: value.name,
                description: value.check,
                casesJson: JSON.stringify(
                  value.cases.map((c: any) => ({
                    ...(c.id ? { id: c.id } : {}),
                    title: c.name,
                    documentText: c.sample,
                    expectedOutput: c.expectedOutput,
                  }))
                ),
              });
              targetId =
                resource === 'suites' && 'evaluationId' in saved
                  ? String(saved.evaluationId)
                  : child!;
              after = await suite(targetId);
              result = { suite: after };
            } else if (resource === 'cases') {
              const owner = await suite(child!);
              if (!owner)
                return response({ error: 'Evaluation suite not found' }, 404);
              // The parent lock serializes the count with other case creates.
              // Replay has already returned above, even when the group is full.
              if (owner.cases.length >= MAX_EVALUATION_GROUP_CASES)
                return response(
                  {
                    error: `Evaluation groups support at most ${MAX_EVALUATION_GROUP_CASES} active cases.`,
                  },
                  409
                );
              const saved = await invoke({
                intent: 'createCase',
                assignmentTypeId: id,
                evaluationId: child,
                title: value.name,
                documentText: value.sample,
                criterion: value.check ?? owner.description,
                rubricCategoryKey: value.rubricCategoryKey,
                expectedOutput: value.expectedOutput,
              });
              targetId = 'caseId' in saved ? String(saved.caseId) : '';
              after = (await suite(child!))?.cases.find(
                (c) => c.id === targetId
              );
              result = { case: after };
            } else if (resource === 'case') {
              const owner = await suite(child!);
              const row = owner?.cases.find((c) => c.id === caseId);
              if (!row)
                return response({ error: 'Evaluation case not found' }, 404);
              before = row;
              targetId = row.id;
              if (request.method === 'PATCH') {
                if (
                  !['name', 'sample', 'check', 'expectedOutput'].some(
                    (k) => value[k] !== undefined
                  )
                )
                  return response(
                    { error: 'Provide at least one case field' },
                    400
                  );
                if (value.expectedOutput) {
                  const config = await resolveAssignmentTypeGradingConfig({
                    assignmentTypeId: id!,
                    assignmentTypeKind: parent!.kind,
                    assignmentTypeTitle: parent!.title,
                  });
                  if (
                    !parseCopyableExpectedOutput({
                      value: value.expectedOutput,
                      rubricCategoryKeys: new Set(
                        config.rubricCategories.map((c) => c.key)
                      ),
                      minScore: config.minScore,
                      maxScore: config.maxScore,
                    })
                  )
                    return response(
                      {
                        error:
                          'Expected output must include the full rubric and valid scores.',
                      },
                      400
                    );
                }
                const updated = await updateWorkspaceEvaluationCase(
                  tx,
                  { id: row.id, assignmentTypeId: id!, evaluationId: child! },
                  {
                    title: value.name,
                    documentText: value.sample,
                    criterion: value.check,
                    ...(value.expectedOutput
                      ? { expectedOutputJson: value.expectedOutput }
                      : {}),
                  }
                );
                if (updated.count !== 1)
                  throw response({ error: 'Evaluation case not found' }, 404);
                await createEvaluationSuiteVersion(tx, id!);
                after = (await suite(child!))?.cases.find(
                  (c) => c.id === caseId
                );
                result = { case: after };
              } else {
                await invoke({
                  intent: 'archiveCase',
                  assignmentTypeId: id,
                  caseId,
                });
                after = {
                  ...row,
                  archivedAt: await tx.assignmentTypeEvaluationCase
                    .findUnique({
                      where: { id: row.id },
                      select: { archivedAt: true },
                    })
                    .then((r) => r?.archivedAt),
                };
                result = { deleted: { id: row.id } };
              }
            } else if (resource === 'scratch') {
              const row = await prompt(value.promptVersion);
              if (!row)
                return response({ error: 'Prompt version not found' }, 404);
              if (parent?.systemKey === AP_HISTORY_ASSIGNMENT_TYPE_KEY)
                return response(
                  {
                    error:
                      'AP History scratch tests require an assignment snapshot.',
                  },
                  400
                );
              const config = await resolveAssignmentTypeGradingConfig({
                assignmentTypeId: id!,
                assignmentTypeKind: parent!.kind,
                assignmentTypeTitle: parent!.title,
              });
              const evaluation = await runGradingAssistantScratchEvaluation({
                gradingConfig: gradingConfigWithPromptVersion(config, row),
                documentText: value.sampleSubmission,
                criterion: value.check,
                studentFirstName: 'Jordan',
                strictnessLevel: 'intermediate',
                execute,
              });
              result = {
                categoryScores: evaluation.gradingOutput?.categories ?? [],
                checkResult: evaluation.criterion,
                responseContract: evaluation.responseContract,
                status: evaluation.status,
              };
              after = { status: evaluation.status, promptVersionId: row.id };
            } else {
              const benchmarkCase = gradingAssistantBenchmarkV1.cases.find(
                (c) => c.id === child
              );
              if (!benchmarkCase)
                return response({ error: 'Benchmark case not found' }, 404);
              const caseResult = await runLiveGradingAssistantBenchmarkCase({
                suite: gradingAssistantBenchmarkV1,
                benchmarkCase,
                gradingConfig: buildStaticThesisGradingConfig(),
                execute,
              });
              result = { caseResult };
              after = { status: caseResult.status };
              targetId = child!;
            }
            if (runController?.signal.aborted) throw budgetError();
            await writeAuditRows(tx, {
              auth,
              endpoint,
              hash,
              action,
              targetId,
              before: json(before),
              after: json(after),
              idempotencyKey: key,
              reason: value.reason ?? null,
            });
            return response(result, create ? 201 : 200);
          },
          {
            isolationLevel: 'ReadCommitted',
            timeout: runController ? 55000 : 120000,
            maxWait: 2000,
          }
        );
      } catch (error) {
        if (runController?.signal.aborted) return budgetError();
        if (runController && error instanceof Error) {
          if (/lock timeout/i.test(error.message))
            return response(
              {
                error:
                  'An evaluation run request is waiting for another write; retry after it completes.',
              },
              409
            );
          if (/statement timeout/i.test(error.message))
            return response(
              {
                error:
                  'Evaluation run database time budget exceeded; retry the request.',
              },
              422
            );
        }
        if (error instanceof Response)
          return response(
            {
              error: error.headers
                .get('content-type')
                ?.includes('application/json')
                ? (await error.json()).error
                : await error.text(),
            },
            error.status
          );
        return response(
          { error: 'The grading workspace request could not complete' },
          500
        );
      } finally {
        if (runTimer !== null) clearTimeout(runTimer);
      }
    },
  };
}
