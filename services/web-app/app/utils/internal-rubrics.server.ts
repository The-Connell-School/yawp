import { createHash, randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@app/prisma';
import { z } from 'zod';
import { validateRubricPromotion } from '~/domain/rubrics/rubric-promotion';
import { parseRubricSchema } from '~/domain/rubrics/rubric-schema';
import { STARTER_RUBRICS } from '~/domain/rubrics/starter-rubrics';
export const rubricPublicationInput = z.object({ requestId: z.string().uuid(), actorId: z.string().min(1).max(200), reason: z.string().trim().min(1).max(2000), source: z.object({ contentId: z.string().uuid(), version: z.number().int().min(1).max(2147483647), fingerprint: z.string().regex(/^[a-f0-9]{64}$/) }).strict(), expectedFingerprint: z.string().regex(/^[a-f0-9]{64}$/).nullable(), schema: z.unknown() }).strict();
const json = (value: unknown): Prisma.InputJsonObject => JSON.parse(JSON.stringify(value));
function canonical(value: any): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
const fingerprint = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
const failure = (message: string, statusCode = 409) => Object.assign(new Error(message), { statusCode });
/** Trusted management boundary. HTTP callers must authenticate and authorize before calling. */
export class InternalRubrics {
  constructor(private db: PrismaClient) {}
  async inspect(name: string) {
    const row = await this.db.rubric.findUnique({ where: { name }, include: { currentRevision: true } });
    if (!row) return null;
    if (row.currentRevision) return { schema: row.currentRevision.schemaJson, fingerprint: row.currentRevision.fingerprint, version: row.currentRevision.version };
    const parsed = parseRubricSchema(row.schemaJson);
    if (!parsed.ok) throw failure('Existing rubric cannot be captured safely');
    const schema = json(parsed.schema);
    return { schema, fingerprint: fingerprint(schema), version: 0 };
  }
  async publish(raw: unknown) {
    const input = rubricPublicationInput.parse(raw);
    const validated = validateRubricPromotion(input.schema);
    if (!validated.ok) throw failure('Rubric validation failed', 400);
    const schema = json(validated.schema), name = validated.schema.name;
    if (STARTER_RUBRICS.some(row => row.name === name)) throw failure('Protected starter rubric requires a new portable name', 403);
    const hash = fingerprint({ ...input, schema });
    return this.db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`rubric-request:${input.requestId}`}, 0))`;
      const replay = await tx.rubricRevision.findUnique({ where: { requestId: input.requestId } });
      if (replay) {
        if (replay.requestHash !== hash) throw failure('Idempotency inputs changed');
        return replay;
      }
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`rubric-name:${name}`}, 0))`;
      await tx.$queryRaw`SELECT id FROM "Rubric" WHERE name=${name} FOR UPDATE`;
      let row = await tx.rubric.findUnique({ where: { name }, include: { currentRevision: true } });
      let current = row?.currentRevision ?? null;
      let legacy: Prisma.InputJsonObject | null = null;
      if (row && !current) {
        const parsed = parseRubricSchema(row.schemaJson);
        if (!parsed.ok) throw failure('Existing rubric cannot be captured safely');
        legacy = json(parsed.schema);
      }
      const existingHash = current?.fingerprint ?? (legacy ? fingerprint(legacy) : null);
      if (existingHash !== input.expectedFingerprint) throw failure('Rubric changed; inspect the current revision');
      const latest = await tx.rubricRevision.findFirst({ where: { rubricName: name }, orderBy: { version: 'desc' } });
      let version = latest?.version ?? 0;
      if (legacy) {
        current = await tx.rubricRevision.create({ data: { id: randomUUID(), rubricName: name, version: ++version, schemaJson: legacy, fingerprint: existingHash!, requestId: randomUUID(), requestHash: hash, createdBy: input.actorId, reason: `Captured before publication: ${input.reason}` } });
        // Capture every existing assignment before moving the default pointer.
        await tx.assignment.updateMany({ where: { rubricRevisionId: null, assignmentType: { rubricId: row!.id } }, data: { rubricRevisionId: current.id } });
      }
      const published = await tx.rubricRevision.create({ data: { id: randomUUID(), rubricName: name, version: ++version, schemaJson: schema, fingerprint: fingerprint(schema), sourceContentId: input.source.contentId, sourceVersion: input.source.version, sourceFingerprint: input.source.fingerprint, requestId: input.requestId, requestHash: hash, createdBy: input.actorId, reason: input.reason } });
      if (row) await tx.rubric.update({ where: { id: row.id }, data: { currentRevisionId: published.id } });
      else await tx.rubric.create({ data: { name, title: validated.schema.title, schemaJson: schema, currentRevisionId: published.id } });
      return published;
    });
  }
}
