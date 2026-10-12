import { createHash } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '~/utils/db.server';

const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const platformApiAuditQuerySchema = z
  .object({
    since: daySchema,
    until: daySchema,
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.string().max(500).optional(),
  })
  .strict();

const digest = (value: string) => createHash('sha256').update(value).digest();

export function parsePlatformApiAuditRange(query: {
  since: string;
  until: string;
}) {
  const since = new Date(`${query.since}T00:00:00.000Z`);
  const until = new Date(`${query.until}T00:00:00.000Z`);
  until.setUTCDate(until.getUTCDate() + 1);
  if (!(since < until)) throw new Error('Invalid range');
  const maxSpanMs = 366 * 24 * 60 * 60 * 1000;
  if (until.getTime() - since.getTime() > maxSpanMs) throw new Error('Range too large');
  return { since, until };
}

export function splitStoredEndpoint(value: string) {
  const space = value.indexOf(' ');
  if (space <= 0) return { method: 'UNKNOWN', endpoint: value };
  return { method: value.slice(0, space), endpoint: value.slice(space + 1) };
}

export function formatPlatformApiAuditRow(row: {
  id: string;
  createdAt: Date;
  actorEmail: string;
  keyId: string;
  endpoint: string;
  result: string;
  requestHash: string;
}) {
  const { method, endpoint } = splitStoredEndpoint(row.endpoint);
  return {
    id: row.id,
    keyId: row.keyId,
    actor: row.actorEmail,
    method,
    endpoint,
    result: row.result,
    timestamp: row.createdAt.toISOString(),
  };
}

export async function listPlatformApiAudit(input: {
  since: Date;
  until: Date;
  limit: number;
  cursor?: string;
}) {
  const binding = digest(
    JSON.stringify([input.since.toISOString(), input.until.toISOString()])
  ).toString('base64url');
  let afterId: string | undefined;
  if (input.cursor) {
    const decoded = z
      .object({ id: z.string().min(1).max(64), binding: z.literal(binding) })
      .strict()
      .parse(JSON.parse(Buffer.from(input.cursor, 'base64url').toString()));
    afterId = decoded.id;
  }

  const rows = await prisma.internalPlatformApiAudit.findMany({
    where: {
      createdAt: { gte: input.since, lt: input.until },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: input.limit + 1,
    ...(afterId ? { cursor: { id: afterId }, skip: 1 } : {}),
    select: {
      id: true,
      createdAt: true,
      actorEmail: true,
      keyId: true,
      endpoint: true,
      result: true,
      requestHash: true,
    },
  });

  const page = rows.slice(0, input.limit);
  const events = page.map(formatPlatformApiAuditRow);
  const last = page[page.length - 1];
  const nextCursor =
    rows.length > input.limit && last
      ? Buffer.from(JSON.stringify({ id: last.id, binding })).toString('base64url')
      : null;
  return { events, nextCursor };
}
