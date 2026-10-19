import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient } from '@app/prisma';
import { z } from 'zod';
import { authorizeInternalApiRequest } from './internal-platform-auth.server';
import {
  auditRead,
  identifier,
  type AssignmentTypeReadAudit,
} from './internal-assignment-types.server';
import {
  readBoundedBody,
  reasonSchema,
  requestHash,
  response,
  writeAuditRows,
} from './internal-admin-write.server';
import * as domain from '~/domain/teacher-trainings/teacher-training-admin.server';
import {
  createTeacherTrainingMedia,
  matchesImage,
  MAX_RESOURCE_BYTES,
  resourceContentTypes,
  type UploadSession,
  type TeacherTrainingMedia,
} from '~/domain/teacher-trainings/teacher-training-media.server';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const title = z.string().trim().min(1).max(200);
const description = z.string().max(5000).nullable().optional();
const idSchema = z.string().regex(identifier);
const empty = z.object({ reason: reasonSchema }).strict();
const training = z
  .object({ reason: reasonSchema, title, description })
  .strict();
const module = training
  .extend({
    videoDuration: z
      .number()
      .int()
      .min(0)
      .max(2147483647)
      .nullable()
      .optional(),
  })
  .strict();
const patch = <T extends z.ZodRawShape>(schema: z.ZodObject<T>) =>
  schema
    .partial()
    .strict()
    .refine((v) => Object.keys(v).some((k) => k !== 'reason'));
const uploadFields = {
  reason: reasonSchema,
  name: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .refine((v) => !/[\x00-\x1f\x7f/\\]/.test(v)),
  size: z.number().int().positive(),
};
const completion = z
  .object({
    reason: reasonSchema,
    uploadId: z.string().min(1).max(2048),
    parts: z
      .array(
        z
          .object({
            partNumber: z.number().int().min(1).max(128),
            etag: z.string().min(1).max(200),
          })
          .strict()
      )
      .min(1)
      .max(128),
  })
  .strict();
const schemas = {
  create: training,
  update: patch(training),
  delete: empty,
  replaceImage: z
    .object({
      reason: reasonSchema,
      contentType: z.enum(['image/png', 'image/jpeg']),
      dataBase64: z.string().min(1),
      altText: z.string().max(300).nullable().optional(),
    })
    .strict(),
  removeImage: empty,
  createModule: module,
  updateModule: patch(module),
  deleteModule: empty,
  reorderModules: z
    .object({ reason: reasonSchema, moduleIds: z.array(idSchema) })
    .strict(),
  startVideo: z
    .object({
      ...uploadFields,
      size: uploadFields.size.max(2 * 1024 ** 3),
      contentType: z.enum(['video/mp4', 'video/quicktime']),
    })
    .strict(),
  completeVideo: completion,
  deleteVideo: empty,
  startResource: z
    .object({
      ...uploadFields,
      size: uploadFields.size.max(MAX_RESOURCE_BYTES),
      contentType: z.enum(resourceContentTypes),
    })
    .strict(),
  completeResource: completion,
  deleteResource: empty,
};
export type TrainingOperation = keyof typeof schemas | 'list' | 'detail';
export const trainingMethods: Record<TrainingOperation, string> = {
  list: 'GET',
  detail: 'GET',
  create: 'POST',
  update: 'PATCH',
  delete: 'DELETE',
  replaceImage: 'PUT',
  removeImage: 'DELETE',
  createModule: 'POST',
  updateModule: 'PATCH',
  deleteModule: 'DELETE',
  reorderModules: 'PUT',
  startVideo: 'POST',
  completeVideo: 'POST',
  deleteVideo: 'DELETE',
  startResource: 'POST',
  completeResource: 'POST',
  deleteResource: 'DELETE',
};
const actions: Record<keyof typeof schemas, string> = {
  create: 'teacher-training.create',
  update: 'teacher-training.update',
  delete: 'teacher-training.delete',
  replaceImage: 'teacher-training.image.replace',
  removeImage: 'teacher-training.image.remove',
  createModule: 'teacher-training.module.create',
  updateModule: 'teacher-training.module.update',
  deleteModule: 'teacher-training.module.delete',
  reorderModules: 'teacher-training.module.reorder',
  startVideo: 'teacher-training.video.upload',
  completeVideo: 'teacher-training.video.complete',
  deleteVideo: 'teacher-training.video.delete',
  startResource: 'teacher-training.resource.upload',
  completeResource: 'teacher-training.resource.complete',
  deleteResource: 'teacher-training.resource.delete',
};
const include = {
  image: true,
  resources: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
  teacherTrainingModules: {
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
    include: { resources: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
  },
} satisfies Prisma.TeacherTrainingInclude;
type TrainingRow = Prisma.TeacherTrainingGetPayload<{
  include: typeof include;
}>;
const iso = (v: Date) => v.toISOString();
const binary = (v: Uint8Array) => ({
  size: v.byteLength,
  sha256: createHash('sha256').update(v).digest('hex'),
});
function mapTraining(row: TrainingRow, audit = false) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    position: row.position,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    moduleCount: row.teacherTrainingModules.length,
    totalLength: row.teacherTrainingModules.reduce(
      (n, m) => n + (m.videoDuration ?? 0),
      0
    ),
    image: row.image
      ? {
          id: row.image.id,
          contentType: row.image.contentType,
          altText: row.image.altText,
          ...(audit ? binary(row.image.blob) : {}),
        }
      : null,
    modules: row.teacherTrainingModules.map((m) => ({
      id: m.id,
      title: m.title,
      description: m.description,
      position: m.position,
      videoS3Key: m.videoS3Key,
      videoDuration: m.videoDuration,
      deletedAt: m.deletedAt ? iso(m.deletedAt) : null,
      createdAt: iso(m.createdAt),
      updatedAt: iso(m.updatedAt),
      resources: m.resources.map((r) => ({
        id: r.id,
        name: r.name,
        contentType: r.contentType,
        byteLength: r.blob.byteLength,
        createdAt: iso(r.createdAt),
        updatedAt: iso(r.updatedAt),
        ...(audit ? { sha256: binary(r.blob).sha256 } : {}),
      })),
    })),
    resources: row.resources.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      url: r.url,
    })),
  };
}
function detail(db: Prisma.TransactionClient | PrismaClient, id: string) {
  return db.teacherTraining.findUnique({ where: { id }, include });
}
function decodeImage(value: z.infer<typeof schemas.replaceImage>) {
  if (value.dataBase64.length > 4 * Math.ceil(MAX_IMAGE_BYTES / 3))
    throw response({ error: 'Image exceeds 5 MiB limit' }, 413);
  const padding = value.dataBase64.endsWith('==')
    ? 2
    : value.dataBase64.endsWith('=')
      ? 1
      : 0;
  const unpadded = value.dataBase64.slice(0, value.dataBase64.length - padding);
  if (value.dataBase64.length % 4 !== 0 || /[^A-Za-z0-9+/]/.test(unpadded))
    throw response({ error: 'Invalid image base64' }, 400);
  const blob = Buffer.from(value.dataBase64, 'base64');
  if (blob.length > MAX_IMAGE_BYTES)
    throw response({ error: 'Image exceeds 5 MiB limit' }, 413);
  if (
    blob.toString('base64') !== value.dataBase64 ||
    !matchesImage(blob, value.contentType)
  )
    throw response(
      { error: 'Image content type does not match magic bytes' },
      400
    );
  return {
    blob,
    contentType: value.contentType,
    ...(value.altText !== undefined ? { altText: value.altText } : {}),
  };
}
const notFound = () =>
  response(
    { error: 'Teacher training, module, resource or upload not found' },
    404
  );
const conflict = () =>
  response({ error: 'Idempotency-Key could not be replayed safely' }, 409);

export function createInternalTeacherTrainingHandlers(input: {
  db: Pick<PrismaClient, '$transaction' | 'teacherTraining'>;
  authenticate?: typeof authorizeInternalApiRequest;
  auditRead?: AssignmentTypeReadAudit;
  media?: TeacherTrainingMedia;
}) {
  const authenticate = input.authenticate ?? authorizeInternalApiRequest;
  const media = input.media ?? createTeacherTrainingMedia();
  return {
    async handle(
      operation: TrainingOperation,
      request: Request,
      ids: { id?: string; moduleId?: string; resourceId?: string } = {}
    ): Promise<Response> {
      try {
        if (request.method !== trainingMethods[operation])
          return response({ error: 'Method not allowed' }, 405);
        let bytes: Uint8Array;
        try {
          bytes = await readBoundedBody(
            request,
            operation === 'replaceImage' ? 8 * 1024 * 1024 : 256 * 1024
          );
        } catch (error) {
          if (error instanceof Response) return error;
          throw error;
        }
        const read = operation === 'list' || operation === 'detail';
        const auth = await authenticate(request, {
          body: bytes,
          requiredScope: read ? 'management:read' : 'management:write',
        });
        if (auth instanceof Response) return auth;
        if (auth.mode !== 'hmac')
          return response({ error: 'Unauthorized' }, 401);
        const needsModule = [
          'updateModule',
          'deleteModule',
          'startVideo',
          'completeVideo',
          'deleteVideo',
          'startResource',
          'completeResource',
          'deleteResource',
        ].includes(operation);
        if (
          (operation !== 'list' &&
            operation !== 'create' &&
            (!ids.id || !identifier.test(ids.id))) ||
          (needsModule && (!ids.moduleId || !identifier.test(ids.moduleId))) ||
          (operation === 'deleteResource' &&
            (!ids.resourceId || !identifier.test(ids.resourceId)))
        )
          return response({ error: 'Invalid identifier' }, 400);
        const url = new URL(request.url);
        if (read) {
          if (operation === 'detail') {
            if (url.search) return response({ error: 'Invalid query' }, 400);
            const row = await detail(input.db as PrismaClient, ids.id!);
            if (!row) return notFound();
            await auditRead(
              request,
              auth,
              input.auditRead,
              'teacher-trainings.detail.success'
            );
            return response({ teacherTraining: mapTraining(row) });
          }
          const query = z
            .object({
              limit: z.coerce.number().int().min(1).max(100).default(50),
              cursor: idSchema.optional(),
            })
            .strict()
            .safeParse(Object.fromEntries(url.searchParams));
          if (
            !query.success ||
            [...url.searchParams.keys()].some(
              (key) => url.searchParams.getAll(key).length !== 1
            )
          )
            return response({ error: 'Invalid query' }, 400);
          const { limit, cursor } = query.data;
          const rows = await input.db.teacherTraining.findMany({
            where: cursor ? { id: { gt: cursor } } : {},
            take: limit + 1,
            orderBy: { id: 'asc' },
            select: {
              id: true,
              title: true,
              description: true,
              position: true,
              createdAt: true,
              updatedAt: true,
              image: { select: { id: true, contentType: true, altText: true } },
              teacherTrainingModules: { select: { videoDuration: true } },
            },
          });
          const page = rows.slice(0, limit);
          await auditRead(
            request,
            auth,
            input.auditRead,
            'teacher-trainings.list.success'
          );
          return response({
            teacherTrainings: page.map((row) => ({
              id: row.id,
              title: row.title,
              description: row.description,
              position: row.position,
              createdAt: iso(row.createdAt),
              updatedAt: iso(row.updatedAt),
              image: row.image
                ? {
                    id: row.image.id,
                    contentType: row.image.contentType,
                    altText: row.image.altText,
                  }
                : null,
              moduleCount: row.teacherTrainingModules.length,
              totalLength: row.teacherTrainingModules.reduce(
                (n, m) => n + (m.videoDuration ?? 0),
                0
              ),
            })),
            nextCursor: rows.length > limit ? page.at(-1)!.id : null,
          });
        }
        if (url.search) return response({ error: 'Invalid query' }, 400);
        let raw: unknown;
        try {
          raw = JSON.parse(
            new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
              bytes
            ) || '{}'
          );
        } catch {
          return response({ error: 'Invalid JSON' }, 400);
        }
        const validated = schemas[operation].safeParse(raw);
        if (!validated.success)
          return response({ error: 'Invalid teacher training request' }, 400);
        const reason = validated.data.reason ?? null;
        const create = trainingMethods[operation] === 'POST';
        const idempotencyKey = create
          ? request.headers.get('idempotency-key')?.trim() || null
          : null;
        if (
          idempotencyKey &&
          (idempotencyKey.length > 200 ||
            !/^[\x21-\x7e]+$/.test(idempotencyKey))
        )
          return response({ error: 'Invalid Idempotency-Key' }, 400);
        const endpoint = `${request.method} ${url.pathname.replace(/\/$/, '')}`;
        const hash = requestHash(bytes);
        try {
          const image =
            operation === 'replaceImage'
              ? decodeImage(schemas.replaceImage.parse(raw))
              : undefined;
          return await input.db.$transaction(
            async (tx) => {
              if (idempotencyKey) {
                const scope = JSON.stringify([
                  actions[operation],
                  endpoint,
                  auth.actorEmail,
                  auth.keyId,
                  idempotencyKey,
                ]);
                await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${scope}, 0))`;
              }
              if (operation !== 'create')
                await tx.$queryRaw`SELECT id FROM "TeacherTraining" WHERE id = ${ids.id!} FOR UPDATE`;
              const before =
                operation === 'create' ? null : await detail(tx, ids.id!);
              if (operation !== 'create' && !before) return notFound();
              const beforeModule = before?.teacherTrainingModules.find(
                (m) => m.id === ids.moduleId
              );
              if (needsModule && !beforeModule) return notFound();
              if (
                operation === 'deleteResource' &&
                !beforeModule!.resources.some((r) => r.id === ids.resourceId)
              )
                return notFound();
              if (idempotencyKey) {
                const previous = await tx.internalPlatformApiAudit.findFirst({
                  where: {
                    endpoint,
                    action: `${actions[operation]}.after`,
                    result: 'after',
                    actorEmail: auth.actorEmail,
                    keyId: auth.keyId,
                    metadata: {
                      path: ['idempotencyKey'],
                      equals: idempotencyKey,
                    },
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
                  const after = (previous.metadata as any)?.after as
                    | { upload?: UploadSession }
                    | undefined;
                  if (after?.upload) {
                    if (Date.parse(after.upload.expiresAt) <= Date.now())
                      return conflict();
                    const consumed =
                      await tx.internalPlatformApiAudit.findFirst({
                        where: {
                          result: 'after',
                          metadata: {
                            path: ['after', 'completedUploadId'],
                            equals: after.upload.uploadId,
                          },
                        },
                      });
                    if (consumed) return conflict();
                    return response({
                      upload: await media.signUpload(after.upload),
                    });
                  }
                  const row =
                    operation === 'create' && previous.targetId
                      ? await detail(tx, previous.targetId)
                      : before;
                  if (
                    !row ||
                    (operation === 'createModule' &&
                      !row.teacherTrainingModules.some(
                        (m) => m.id === previous.targetId
                      )) ||
                    (operation === 'completeResource' &&
                      !beforeModule!.resources.some(
                        (r) => r.id === previous.targetId
                      ))
                  )
                    return conflict();
                  return response({ teacherTraining: mapTraining(row) });
                }
              }
              const beforeSnapshot = before
                ? { teacherTraining: mapTraining(before, true) }
                : null;
              let targetId = ids.moduleId ?? ids.id!;
              let trainingId = ids.id!;
              let upload: UploadSession | undefined;
              let completedUploadId: string | undefined;
              let deleted: { id: string } | undefined;
              switch (operation) {
                case 'create': {
                  // No parent exists yet; serialize appending the top-level position.
                  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended('teacher-training.create', 0))`;
                  const { reason: _reason, ...fields } =
                    schemas.create.parse(raw);
                  const row = await domain.createTraining(tx, fields);
                  trainingId = row.id;
                  targetId = row.id;
                  break;
                }
                case 'update': {
                  const { reason: _reason, ...fields } =
                    schemas.update.parse(raw);
                  await domain.updateTraining(tx, ids.id!, fields);
                  break;
                }
                case 'delete':
                  await domain.deleteTraining(tx, ids.id!);
                  deleted = { id: ids.id! };
                  break;
                case 'replaceImage':
                  await domain.replaceImage(tx, ids.id!, image!);
                  break;
                case 'removeImage':
                  await domain.removeImage(tx, ids.id!);
                  break;
                case 'createModule': {
                  const { reason: _reason, ...fields } =
                    schemas.createModule.parse(raw);
                  const position =
                    Math.max(
                      -1,
                      ...before!.teacherTrainingModules.map((m) => m.position)
                    ) + 1;
                  const row = await domain.createModule(
                    tx,
                    ids.id!,
                    fields,
                    position
                  );
                  targetId = row.id;
                  break;
                }
                case 'updateModule': {
                  const { reason: _reason, ...fields } =
                    schemas.updateModule.parse(raw);
                  await domain.updateModule(tx, ids.moduleId!, {
                    ...fields,
                    updatedAt: new Date(),
                  });
                  break;
                }
                case 'deleteModule':
                  await domain.deleteModule(tx, ids.moduleId!);
                  deleted = { id: ids.moduleId! };
                  break;
                case 'reorderModules': {
                  const { moduleIds } = schemas.reorderModules.parse(raw);
                  if (
                    new Set(moduleIds).size !== moduleIds.length ||
                    moduleIds.length !==
                      before!.teacherTrainingModules.length ||
                    before!.teacherTrainingModules.some(
                      (m) => !moduleIds.includes(m.id)
                    )
                  )
                    return response(
                      {
                        error:
                          'moduleIds must contain exactly the module IDs for this teacher training, with no duplicates',
                      },
                      400
                    );
                  await domain.reorderModules(tx, moduleIds);
                  break;
                }
                case 'startVideo':
                case 'startResource': {
                  const { reason: _reason, ...fields } =
                    schemas[operation].parse(raw);
                  upload = await media.createUpload({
                    ...fields,
                    kind: operation === 'startVideo' ? 'video' : 'resource',
                    trainingId: ids.id!,
                    moduleId: ids.moduleId!,
                  });
                  break;
                }
                case 'completeVideo':
                case 'completeResource': {
                  const { uploadId, parts } = completion.parse(raw);
                  const previous = await tx.internalPlatformApiAudit.findFirst({
                    where: {
                      action: `${actions[operation === 'completeVideo' ? 'startVideo' : 'startResource']}.after`,
                      result: 'after',
                      targetId: ids.moduleId!,
                      actorEmail: auth.actorEmail,
                      keyId: auth.keyId,
                      metadata: {
                        path: ['after', 'upload', 'uploadId'],
                        equals: uploadId,
                      },
                    },
                    orderBy: { createdAt: 'desc' },
                  });
                  const session = (previous?.metadata as any)?.after?.upload as
                    | UploadSession
                    | undefined;
                  if (
                    !session ||
                    session.trainingId !== ids.id ||
                    session.moduleId !== ids.moduleId
                  )
                    return notFound();
                  if (Date.parse(session.expiresAt) <= Date.now())
                    return response(
                      { error: 'Upload session has expired' },
                      409
                    );
                  if (
                    parts.length !== session.partCount ||
                    new Set(parts.map((p) => p.partNumber)).size !==
                      parts.length ||
                    parts.some((p) => p.partNumber > session.partCount)
                  )
                    return response(
                      {
                        error:
                          'parts must contain every upload part exactly once',
                      },
                      400
                    );
                  const consumed = await tx.internalPlatformApiAudit.findFirst({
                    where: {
                      result: 'after',
                      metadata: {
                        path: ['after', 'completedUploadId'],
                        equals: uploadId,
                      },
                    },
                  });
                  if (consumed)
                    return response(
                      {
                        error:
                          'Upload has already been completed; replay with the original Idempotency-Key',
                      },
                      409
                    );
                  const blob = await media.completeUpload(session, parts);
                  if (operation === 'completeVideo')
                    await domain.updateModule(tx, ids.moduleId!, {
                      videoS3Key: session.key,
                      updatedAt: new Date(),
                    });
                  else {
                    if (!blob)
                      throw new Error(
                        'Resource completion did not return bytes'
                      );
                    const row = await domain.createResource(tx, ids.moduleId!, {
                      name: session.name,
                      contentType: session.contentType,
                      blob,
                    });
                    targetId = row.id;
                  }
                  completedUploadId = uploadId;
                  break;
                }
                case 'deleteVideo':
                  await domain.updateModule(tx, ids.moduleId!, {
                    videoS3Key: null,
                    videoDuration: null,
                    updatedAt: new Date(),
                  });
                  break;
                case 'deleteResource':
                  await domain.deleteResource(tx, ids.resourceId!);
                  targetId = ids.resourceId!;
                  deleted = { id: ids.resourceId! };
                  break;
              }
              if (operation !== 'delete' && !upload)
                await domain.updateTraining(tx, trainingId, {
                  updatedAt: new Date(),
                });
              const after =
                operation === 'delete' ? null : await detail(tx, trainingId);
              const afterSnapshot = {
                teacherTraining: after ? mapTraining(after, true) : null,
                ...(upload ? { upload } : {}),
                ...(completedUploadId ? { completedUploadId } : {}),
                ...(deleted ? { deleted } : {}),
              };
              await writeAuditRows(tx, {
                auth,
                endpoint,
                hash,
                action: actions[operation],
                targetId,
                before: beforeSnapshot,
                after: afterSnapshot,
                reason,
                idempotencyKey,
              });
              if (upload)
                return response(
                  { upload: await media.signUpload(upload) },
                  201
                );
              return response(
                deleted
                  ? { deleted }
                  : { teacherTraining: mapTraining(after!) },
                create ? 201 : 200
              );
            },
            { isolationLevel: 'ReadCommitted', timeout: 30000 }
          );
        } catch (error) {
          if (error instanceof Response)
            return error.headers
              .get('content-type')
              ?.includes('application/json')
              ? error
              : response({ error: await error.text() }, error.status);
          // S3 SDK errors can contain request metadata. Never expose their messages.
          return response({ error: 'Teacher training operation failed' }, 502);
        }
      } catch {
        return response({ error: 'Teacher training operation failed' }, 502);
      }
    },
  };
}
