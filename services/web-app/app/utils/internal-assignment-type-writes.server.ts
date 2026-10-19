import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient } from '@app/prisma';
import { z } from 'zod';
import { authorizeInternalApiRequest } from './internal-platform-auth.server';
import {
  response,
  requestHash,
  writeAuditRows,
} from './internal-admin-write.server';
import {
  detailSelect,
  identifier,
  mapDetail,
  releaseKey,
  releasesFor,
  type AssignmentTypeDetailRow,
} from './internal-assignment-types.server';
import { resolveAdminRubricPickerSelection } from '~/domain/rubrics/admin-rubric-picker.server';
import {
  createAssignmentType,
  updateAssignmentType,
  archiveAssignmentType,
  restoreAssignmentType,
  replaceAssignmentTypeImage,
  removeAssignmentTypeImage,
} from '~/domain/assignment-types/assignment-type-admin-writes.server';

const fields = {
  title: z.string().trim().min(1).max(200),
  description: z.string().nullable().optional(),
  tutorInstructions: z.string().trim().nullable().optional(),
  // Exactly the admin rubric picker's string value; omission preserves the selection.
  rubricSelection: z.string().optional(),
  gradingInstructionsOverride: z.string().trim().nullable().optional(),
  allowsImageUploads: z.boolean().optional(),
  collaborationSupported: z.boolean().optional(),
};
const createSchema = z.object(fields).strict();
const patchSchema = createSchema
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0);
const emptySchema = z.object({}).strict();
const imageSchema = z
  .object({
    contentType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
    dataBase64: z.string().min(1),
    altText: z.string().optional(),
  })
  .strict();
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

type Operation =
  | 'create'
  | 'update'
  | 'archive'
  | 'restore'
  | 'replaceImage'
  | 'removeImage';
const methods: Record<Operation, string> = {
  create: 'POST',
  update: 'PATCH',
  archive: 'POST',
  restore: 'POST',
  replaceImage: 'PUT',
  removeImage: 'DELETE',
};
const actions: Record<Operation, string> = {
  create: 'assignment-type.create',
  update: 'assignment-type.update',
  archive: 'assignment-type.archive',
  restore: 'assignment-type.restore',
  replaceImage: 'assignment-type.image.replace',
  removeImage: 'assignment-type.image.remove',
};

function decodeImage(data: z.infer<typeof imageSchema>) {
  const padding = data.dataBase64.endsWith('==')
    ? 2
    : data.dataBase64.endsWith('=')
      ? 1
      : 0;
  const decodedSize = Math.floor(data.dataBase64.length / 4) * 3 - padding;
  if (
    decodedSize > MAX_IMAGE_BYTES ||
    data.dataBase64.length > 4 * Math.ceil(MAX_IMAGE_BYTES / 3)
  ) {
    throw response({ error: 'Image exceeds 5 MiB limit' }, 413);
  }
  const unpadded = data.dataBase64.slice(0, data.dataBase64.length - padding);
  if (data.dataBase64.length % 4 !== 0 || /[^A-Za-z0-9+/]/.test(unpadded)) {
    throw response({ error: 'Invalid image base64' }, 400);
  }
  const blob = Buffer.from(data.dataBase64, 'base64');
  if (blob.length > MAX_IMAGE_BYTES)
    throw response({ error: 'Image exceeds 5 MiB limit' }, 413);
  if (blob.toString('base64') !== data.dataBase64)
    throw response({ error: 'Invalid image base64' }, 400);
  const matches = {
    'image/png': blob
      .subarray(0, 8)
      .equals(Buffer.from('89504e470d0a1a0a', 'hex')),
    'image/jpeg': blob.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex')),
    'image/gif': ['GIF87a', 'GIF89a'].includes(
      blob.subarray(0, 6).toString('ascii')
    ),
    'image/webp':
      blob.length >= 12 &&
      blob.subarray(0, 4).toString('ascii') === 'RIFF' &&
      blob.subarray(8, 12).toString('ascii') === 'WEBP',
  };
  if (!matches[data.contentType])
    throw response(
      { error: 'Image content type does not match magic bytes' },
      400
    );
  return {
    contentType: data.contentType,
    blob,
    ...(data.altText !== undefined ? { altText: data.altText } : {}),
  };
}

async function detail(tx: Prisma.TransactionClient, id: string) {
  return tx.assignmentType.findUnique({ where: { id }, select: detailSelect });
}
async function payload(
  tx: Prisma.TransactionClient,
  row: AssignmentTypeDetailRow
) {
  return {
    assignmentType: mapDetail(row, await releasesFor(tx, [releaseKey(row)])),
  };
}
async function snapshot(
  tx: Prisma.TransactionClient,
  row: AssignmentTypeDetailRow | null
) {
  if (!row) return null;
  const image = row.image
    ? await tx.assignmentTypeImage.findUnique({
        where: { id: row.image.id },
        select: { blob: true, contentType: true },
      })
    : null;
  return {
    ...mapDetail(row, new Map()),
    gradingPromptConfigJson: row.gradingPromptConfigJson,
    scoringScaleJson: row.scoringScaleJson,
    rubricJson: row.rubricJson,
    gradingOutputSchemaJson: row.gradingOutputSchemaJson,
    gradingCalibrationNotes: row.gradingCalibrationNotes,
    image: row.image
      ? {
          id: row.image.id,
          altText: row.image.altText,
          contentType: row.image.contentType,
          ...(image
            ? {
                size: image.blob.length,
                sha256: createHash('sha256').update(image.blob).digest('hex'),
              }
            : {}),
        }
      : null,
  };
}

export function createInternalAssignmentTypeWriteHandlers(input: {
  db: Pick<PrismaClient, '$transaction'>;
  authenticate?: typeof authorizeInternalApiRequest;
}) {
  const authenticate = input.authenticate ?? authorizeInternalApiRequest;
  async function handle(operation: Operation, request: Request, id?: string) {
    if (request.method !== methods[operation])
      return response({ error: 'Method not allowed' }, 405);
    const body = await request.text();
    const auth = await authenticate(request, {
      body,
      requiredScope: 'management:write',
    });
    if (auth instanceof Response) return auth;
    if (auth.mode !== 'hmac') return response({ error: 'Unauthorized' }, 401);
    if (operation !== 'create' && (!id || !identifier.test(id)))
      return response({ error: 'Invalid assignment type' }, 400);
    let raw: unknown;
    try {
      raw = JSON.parse(body || '{}');
    } catch {
      return response({ error: 'Invalid JSON' }, 400);
    }
    const schema =
      operation === 'create'
        ? createSchema
        : operation === 'update'
          ? patchSchema
          : operation === 'replaceImage'
            ? imageSchema
            : emptySchema;
    if (!schema.safeParse(raw).success)
      return response({ error: 'Invalid assignment type request' }, 400);
    const hash = requestHash(body);
    const idempotencyKey =
      operation === 'create'
        ? request.headers.get('idempotency-key')?.trim() || null
        : null;
    const endpoint =
      operation === 'create'
        ? 'POST /api/internal/v1/admin/assignment-types'
        : `${request.method} ${new URL(request.url).pathname}`;
    try {
      const image =
        operation === 'replaceImage'
          ? decodeImage(imageSchema.parse(raw))
          : undefined;
      return await input.db.$transaction(
        async (tx) => {
          if (idempotencyKey) {
            const scope = JSON.stringify([
              'assignment-type.create',
              auth.actorEmail,
              auth.keyId,
              idempotencyKey,
            ]);
            await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${scope}, 0))`;
            const previous = await tx.internalPlatformApiAudit.findFirst({
              where: {
                endpoint: 'POST /api/internal/v1/admin/assignment-types',
                result: 'after',
                action: 'assignment-type.create.after',
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
              const existing = previous.targetId
                ? await detail(tx, previous.targetId)
                : null;
              if (!existing)
                return response(
                  { error: 'Idempotency-Key could not be replayed safely' },
                  409
                );
              return response(await payload(tx, existing));
            }
          }
          if (operation !== 'create')
            await tx.$queryRaw`SELECT id FROM "AssignmentType" WHERE id = ${id!} FOR UPDATE`;
          const before = operation === 'create' ? null : await detail(tx, id!);
          if (operation !== 'create' && !before)
            return response({ error: 'Assignment type not found' }, 404);
          const beforeSnapshot = await snapshot(tx, before);
          let targetId = id!;
          if (operation === 'create' || operation === 'update') {
            const parsed =
              operation === 'create'
                ? createSchema.parse(raw)
                : patchSchema.parse(raw);
            const { rubricSelection: pickerValue, ...fields } = parsed;
            const rubricSelection =
              pickerValue === undefined
                ? undefined
                : await resolveAdminRubricPickerSelection(pickerValue, tx);
            const data = {
              ...fields,
              ...(fields.tutorInstructions !== undefined
                ? { tutorInstructions: fields.tutorInstructions || null }
                : {}),
              ...(rubricSelection ? { rubricSelection } : {}),
            };
            if (operation === 'create') {
              const created = await createAssignmentType(tx, {
                description: null,
                tutorInstructions: null,
                ...data,
                title: fields.title!,
              });
              targetId = created.id;
            } else await updateAssignmentType(tx, targetId, before!, data);
          } else if (operation === 'archive') {
            // Preserve the original timestamp on repeat calls; all no-ops remain audited.
            await archiveAssignmentType(
              tx,
              targetId,
              before!.archivedAt ?? new Date()
            );
          } else if (operation === 'restore')
            await restoreAssignmentType(tx, targetId);
          else if (operation === 'replaceImage')
            await replaceAssignmentTypeImage(tx, targetId, image!);
          else await removeAssignmentTypeImage(tx, targetId);
          const after = await detail(tx, targetId);
          if (!after)
            throw new Error('Assignment type disappeared during write');
          await writeAuditRows(tx, {
            auth,
            endpoint,
            hash,
            action: actions[operation],
            targetId,
            before: beforeSnapshot,
            after: await snapshot(tx, after),
            idempotencyKey,
          });
          return response(
            await payload(tx, after),
            operation === 'create' ? 201 : 200
          );
        },
        { isolationLevel: 'ReadCommitted' }
      );
    } catch (error) {
      if (error instanceof Response) {
        // Picker/domain failures carry plain text; API validation failures carry JSON.
        if (error.headers.get('content-type')?.includes('application/json'))
          return error;
        return response({ error: await error.text() }, error.status);
      }
      throw error;
    }
  }
  return {
    create: (request: Request) => handle('create', request),
    update: (request: Request, id: string | undefined) =>
      handle('update', request, id),
    archive: (request: Request, id: string | undefined) =>
      handle('archive', request, id),
    restore: (request: Request, id: string | undefined) =>
      handle('restore', request, id),
    replaceImage: (request: Request, id: string | undefined) =>
      handle('replaceImage', request, id),
    removeImage: (request: Request, id: string | undefined) =>
      handle('removeImage', request, id),
  };
}
