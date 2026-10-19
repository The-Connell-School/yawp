import type { Prisma, PrismaClient } from '@app/prisma';
import { z } from 'zod';
import { authorizeInternalApiRequest } from './internal-platform-auth.server';
import {
  response,
  requestHash,
  writeAuditRows,
  readBoundedBody,
  reasonSchema,
} from './internal-admin-write.server';
import {
  identifier,
  auditRead,
  type AssignmentTypeReadAudit,
} from './internal-assignment-types.server';
import * as domain from '~/domain/assignment-types/assignment-type-module-writes.server';

// The editor supports arbitrary variant keys (including dbq and leq).
const variants = z.record(z.string(), z.string()).transform((value) =>
  Object.fromEntries(
    Object.entries(value)
      .map(([k, v]) => [k, v.trim()])
      .filter(([, v]) => v.length > 0)
  )
);
const moduleSchema = z
  .object({
    reason: reasonSchema,
    title: z.string().min(1),
    description: z.string().nullable().optional(),
    isSelfGuided: z.boolean().optional(),
    tutorInstructions: z.string().nullable().optional(),
    tutorInstructionsVariantsJson: variants.optional(),
    rubricAlignmentJson: z
      .record(
        z.string(),
        z.enum(['primary', 'supporting', 'preparatory', 'not-applicable'])
      )
      .optional(),
  })
  .strict();
const stepSchema = z
  .object({
    reason: reasonSchema,
    title: z.string().min(1),
    prompt: z.string().min(1),
    answerKey: z.string().max(20000).nullable().optional(),
    nextButtonLabel: z.string().trim().max(80).transform(v => v || null).nullable().optional(),
    tutorInstructions: z.string().nullable().optional(),
    tutorInstructionsVariantsJson: variants.optional(),
    showChatButton: z.boolean().optional(),
    showNextButton: z.boolean().optional(),
    buttons: z
      .array(
        z
          .object({
            label: z.string().min(1),
            action: z.enum(['advance', 'response']),
          })
          .strict()
      )
      .optional(),
  })
  .strict();
const patchModuleSchema = moduleSchema
  .partial()
  .refine((v) => Object.keys(v).some(key => key !== 'reason'));
const patchStepSchema = stepSchema
  .partial()
  .refine((v) => Object.keys(v).some(key => key !== 'reason'));
const idSchema = z.string().regex(identifier);
const schemas = {
  createModule: moduleSchema,
  updateModule: patchModuleSchema,
  deleteModule: z.object({ reason: reasonSchema }).strict(),
  reorderModules: z.object({ reason: reasonSchema, moduleIds: z.array(idSchema) }).strict(),
  createStep: stepSchema,
  updateStep: patchStepSchema,
  deleteStep: z.object({ reason: reasonSchema }).strict(),
  reorderSteps: z.object({ reason: reasonSchema, stepIds: z.array(idSchema) }).strict(),
};
type Operation = keyof typeof schemas;
const methods: Record<Operation, string> = {
  createModule: 'POST',
  updateModule: 'PATCH',
  deleteModule: 'DELETE',
  reorderModules: 'PUT',
  createStep: 'POST',
  updateStep: 'PATCH',
  deleteStep: 'DELETE',
  reorderSteps: 'PUT',
};
const actions: Record<Operation, string> = {
  createModule: 'assignment-type.module.create',
  updateModule: 'assignment-type.module.update',
  deleteModule: 'assignment-type.module.delete',
  reorderModules: 'assignment-type.module.reorder',
  createStep: 'assignment-type.step.create',
  updateStep: 'assignment-type.step.update',
  deleteStep: 'assignment-type.step.delete',
  reorderSteps: 'assignment-type.step.reorder',
};
const fullModuleSelect = {
  id: true,
  title: true,
  description: true,
  position: true,
  isSelfGuided: true,
  tutorInstructions: true,
  tutorInstructionsVariantsJson: true,
  rubricAlignmentJson: true,
  instructions: {
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      title: true,
      prompt: true,
      answerKey: true,
      nextButtonLabel: true,
      position: true,
      tutorInstructions: true,
      tutorInstructionsVariantsJson: true,
      showChatButton: true,
      showNextButton: true,
      buttons: {
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
        select: { id: true, label: true, action: true, position: true },
      },
    },
  },
} satisfies Prisma.AssignmentModuleSelect;
type Module = Prisma.AssignmentModuleGetPayload<{
  select: typeof fullModuleSelect;
}>;
function mapModule(row: Module) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    position: row.position,
    isSelfGuided: row.isSelfGuided,
    tutorInstructions: row.tutorInstructions,
    tutorInstructionsVariantsJson: row.tutorInstructionsVariantsJson,
    rubricAlignmentJson: row.rubricAlignmentJson,
    instructionCount: row.instructions.length,
    instructions: row.instructions.map((s) => ({
      id: s.id,
      title: s.title,
      prompt: s.prompt,
      answerKey: s.answerKey,
      nextButtonLabel: s.nextButtonLabel,
      position: s.position,
      tutorInstructions: s.tutorInstructions,
      tutorInstructionsVariantsJson: s.tutorInstructionsVariantsJson,
      showChatButton: s.showChatButton,
      showNextButton: s.showNextButton,
      buttonCount: s.buttons.length,
      buttons: s.buttons.map((b) => ({
        id: b.id,
        label: b.label,
        action: b.action,
        position: b.position,
      })),
    })),
  };
}
function moduleRow(tx: Prisma.TransactionClient, id: string, moduleId: string) {
  return tx.assignmentModule.findFirst({
    where: { id: moduleId, assignmentTypeId: id, deletedAt: null },
    select: fullModuleSelect,
  });
}
async function moduleRows(tx: Prisma.TransactionClient, id: string) {
  return tx.assignmentModule.findMany({
    where: { assignmentTypeId: id, deletedAt: null },
    select: fullModuleSelect,
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
  });
}
function exactSet(ids: string[], actual: string[], field: string) {
  const wanted = new Set(ids);
  if (
    wanted.size !== ids.length ||
    ids.length !== actual.length ||
    actual.some((id) => !wanted.has(id))
  )
    throw response(
      {
        error: `${field} must contain exactly ${field === 'moduleIds' ? 'the non-deleted module IDs for this assignment type' : 'the step IDs for this module'}, with no duplicates`,
      },
      400
    );
}
const appended = (rows: { position: number }[]) =>
  Math.max(-1, ...rows.map((r) => r.position)) + 1;

export function createInternalAssignmentTypeModuleHandlers(input: {
  db: Pick<PrismaClient, '$transaction'>;
  authenticate?: typeof authorizeInternalApiRequest;
  auditRead?: AssignmentTypeReadAudit;
}) {
  const authenticate = input.authenticate ?? authorizeInternalApiRequest;
  async function handle(
    operation: Operation | 'detail',
    request: Request,
    id?: string,
    moduleId?: string,
    stepId?: string
  ) {
    const read = operation === 'detail';
    if (request.method !== (read ? 'GET' : methods[operation]))
      return response({ error: 'Method not allowed' }, 405);
    let body: string;
    try {
      body = await readBoundedBody(request, 256 * 1024);
    } catch (error) {
      if (error instanceof Response) return error;
      throw error;
    }
    const auth = await authenticate(request, {
      body,
      requiredScope: read ? 'management:read' : 'management:write',
    });
    if (auth instanceof Response) return auth;
    if (auth.mode !== 'hmac') return response({ error: 'Unauthorized' }, 401);
    if (!id || !identifier.test(id))
      return response({ error: 'Invalid assignment type' }, 400);
    const needsModule = !['createModule', 'reorderModules'].includes(operation);
    if (needsModule && (!moduleId || !identifier.test(moduleId)))
      return response({ error: 'Invalid module' }, 400);
    if (
      ['updateStep', 'deleteStep'].includes(operation) &&
      (!stepId || !identifier.test(stepId))
    )
      return response({ error: 'Invalid step' }, 400);
    let raw: unknown;
    try {
      raw = JSON.parse(body || '{}');
    } catch {
      return response({ error: 'Invalid JSON' }, 400);
    }
    const validated = read ? null : schemas[operation].safeParse(raw);
    if (validated && !validated.success)
      return response({ error: 'Invalid assignment type module request' }, 400);
    const reason = validated?.success ? validated.data.reason ?? null : null;
    const create = operation === 'createModule' || operation === 'createStep';
    const idempotencyKey = create
      ? request.headers.get('idempotency-key')?.trim() || null
      : null;
    const endpoint = `${request.method} ${new URL(request.url).pathname.replace(/\/$/, '')}`;
    const hash = requestHash(body);
    try {
      return await input.db.$transaction(
        async (tx) => {
          if (!read)
            await tx.$queryRaw`SELECT id FROM "AssignmentType" WHERE id = ${id} FOR UPDATE`;
          if (
            !(await tx.assignmentType.findUnique({
              where: { id },
              select: { id: true },
            }))
          )
            return response({ error: 'Assignment type not found' }, 404);
          if (!read && operation.includes('Step'))
            await tx.$queryRaw`SELECT id FROM "AssignmentModule" WHERE id = ${moduleId!} FOR UPDATE`;
          const before = needsModule
            ? await moduleRow(tx, id, moduleId!)
            : null;
          if (needsModule && !before)
            return response({ error: 'Module not found' }, 404);
          if (read) {
            await auditRead(
              request,
              auth,
              input.auditRead,
              'assignment-types.module.detail.success'
            );
            return response({ module: mapModule(before!) });
          }
          const step = stepId
            ? before?.instructions.find((s) => s.id === stepId)
            : undefined;
          if (['updateStep', 'deleteStep'].includes(operation) && !step)
            return response({ error: 'Step not found' }, 404);
          if (idempotencyKey) {
            const scope = JSON.stringify([
              actions[operation],
              endpoint,
              auth.actorEmail,
              auth.keyId,
              idempotencyKey,
            ]);
            await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${scope}, 0))`;
            const previous = await tx.internalPlatformApiAudit.findFirst({
              where: {
                endpoint,
                action: `${actions[operation]}.after`,
                result: 'after',
                actorEmail: auth.actorEmail,
                keyId: auth.keyId,
                metadata: { path: ['idempotencyKey'], equals: idempotencyKey },
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
              const existing =
                operation === 'createModule' && previous.targetId
                  ? await moduleRow(tx, id, previous.targetId)
                  : previous.targetId &&
                      before?.instructions.some(
                        (s) => s.id === previous.targetId
                      )
                    ? before
                    : null;
              if (!existing)
                return response(
                  { error: 'Idempotency-Key could not be replayed safely' },
                  409
                );
              return response({ module: mapModule(existing) });
            }
          }
          let targetId = stepId ?? moduleId ?? id;
          let beforeSnapshot: unknown = before ? mapModule(before) : null;
          let afterSnapshot: unknown;
          let result: unknown;
          if (operation === 'reorderModules') {
            const rows = await moduleRows(tx, id);
            const { moduleIds } = schemas.reorderModules.parse(raw);
            exactSet(
              moduleIds,
              rows.map((m) => m.id),
              'moduleIds'
            );
            beforeSnapshot = rows.map(mapModule);
            await domain.reorderModules(tx, moduleIds);
            const modules = (await moduleRows(tx, id)).map(mapModule);
            targetId = id;
            afterSnapshot = modules;
            result = { modules };
          } else if (operation === 'deleteModule') {
            const deleted = await domain.deleteModule(tx, moduleId!);
            // Full authored snapshot plus deletion marker; live reads omit this row.
            afterSnapshot = {
              ...mapModule(before!),
              deletedAt: deleted.deletedAt!.toISOString(),
            };
            result = { deleted: { id: moduleId } };
          } else {
            if (operation === 'createModule') {
              const { reason: _reason, ...fields } = schemas.createModule.parse(raw);
              const created = await domain.createModule(
                tx,
                id,
                {
                  ...fields,
                  description: fields.description || null,
                  tutorInstructions: fields.tutorInstructions || null,
                },
                appended(await moduleRows(tx, id))
              );
              targetId = created.id;
              moduleId = created.id;
            } else if (operation === 'updateModule') {
              const { reason: _reason, ...fields } = schemas.updateModule.parse(raw);
              await domain.updateModule(tx, moduleId!, {
                ...fields,
                ...(fields.description !== undefined
                  ? { description: fields.description || null }
                  : {}),
                ...(fields.tutorInstructions !== undefined
                  ? { tutorInstructions: fields.tutorInstructions || null }
                  : {}),
              });
            } else if (operation === 'createStep') {
              const { reason: _reason, ...fields } = schemas.createStep.parse(raw);
              const created = await domain.createStep(
                tx,
                moduleId!,
                {
                  ...fields,
                  tutorInstructions: fields.tutorInstructions || null,
                  showChatButton: fields.showChatButton ?? false,
                  showNextButton: fields.showNextButton ?? false,
                  buttons: fields.buttons ?? [],
                },
                appended(before!.instructions)
              );
              targetId = created.id;
            } else if (operation === 'updateStep') {
              const { reason: _reason, ...fields } = schemas.updateStep.parse(raw);
              await domain.updateStep(tx, stepId!, {
                ...fields,
                ...(fields.tutorInstructions !== undefined
                  ? { tutorInstructions: fields.tutorInstructions || null }
                  : {}),
              });
            } else if (operation === 'deleteStep')
              await domain.deleteStep(tx, stepId!);
            else {
              const { stepIds } = schemas.reorderSteps.parse(raw);
              exactSet(
                stepIds,
                before!.instructions.map((s) => s.id),
                'stepIds'
              );
              targetId = moduleId!;
              await domain.reorderSteps(tx, stepIds);
            }
            const after = await moduleRow(tx, id, moduleId!);
            if (!after) throw new Error('Module disappeared during write');
            afterSnapshot = mapModule(after);
            result =
              operation === 'deleteStep'
                ? { deleted: { id: stepId } }
                : operation === 'reorderSteps'
                  ? { steps: mapModule(after).instructions }
                  : { module: afterSnapshot };
          }
          await writeAuditRows(tx, {
            auth,
            endpoint,
            hash,
            action: actions[operation],
            targetId,
            before: beforeSnapshot,
            after: afterSnapshot,
            idempotencyKey,
            reason,
          });
          return response(result, create ? 201 : 200);
        },
        { isolationLevel: 'ReadCommitted' }
      );
    } catch (error) {
      if (error instanceof Response)
        return error.headers.get('content-type')?.includes('application/json')
          ? error
          : response({ error: await error.text() }, error.status);
      throw error;
    }
  }
  return {
    detail: (request: Request, id?: string, moduleId?: string) =>
      handle('detail', request, id, moduleId),
    createModule: (request: Request, id?: string) =>
      handle('createModule', request, id),
    updateModule: (request: Request, id?: string, moduleId?: string) =>
      handle('updateModule', request, id, moduleId),
    deleteModule: (request: Request, id?: string, moduleId?: string) =>
      handle('deleteModule', request, id, moduleId),
    reorderModules: (request: Request, id?: string) =>
      handle('reorderModules', request, id),
    createStep: (request: Request, id?: string, moduleId?: string) =>
      handle('createStep', request, id, moduleId),
    updateStep: (
      request: Request,
      id?: string,
      moduleId?: string,
      stepId?: string
    ) => handle('updateStep', request, id, moduleId, stepId),
    deleteStep: (
      request: Request,
      id?: string,
      moduleId?: string,
      stepId?: string
    ) => handle('deleteStep', request, id, moduleId, stepId),
    reorderSteps: (request: Request, id?: string, moduleId?: string) =>
      handle('reorderSteps', request, id, moduleId),
  };
}
