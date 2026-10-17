import { createHash, randomUUID } from 'node:crypto';
import type { Prisma } from '@app/prisma';
import { prisma } from '~/utils/db.server';
import { lessonPlanMonthWindow } from '~/utils/lesson-planner/month-window';

export type MonthlyFeature = 'lesson-planner' | 'reporter';
const LEASE_MS = 300_000;
const prefix = (org: string, feature: MonthlyFeature) =>
  `free_tier.monthly.v1:${org}:${feature}:`;
type Operation = {
  period: string;
  fingerprint: string;
  status: 'reserved' | 'completed' | 'failed';
  token: string;
  expiresAt: string;
  conversationId?: string;
  payload?: Record<string, unknown>;
};
export type Reservation = {
  kind: 'reserved';
  name: string;
  organizationId: string;
  feature: MonthlyFeature;
  operation: Operation;
};
type Result =
  | Reservation
  | { kind: 'replay'; payload: Record<string, unknown> }
  | { kind: 'pending' | 'conflict' | 'exhausted' };
const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const period = (now: Date) => lessonPlanMonthWindow(now).gte.toISOString();

async function lock(
  db: Prisma.TransactionClient,
  organizationId: string,
  feature: MonthlyFeature
) {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${prefix(organizationId, feature)}))`;
}
async function rows(
  db: Prisma.TransactionClient,
  organizationId: string,
  feature: MonthlyFeature
) {
  return (
    await db.setting.findMany({
      where: { name: { startsWith: prefix(organizationId, feature) } },
      select: { value: true },
    })
  ).map((row) => JSON.parse(row.value) as Operation);
}
async function usage(
  db: Prisma.TransactionClient,
  organizationId: string,
  feature: MonthlyFeature,
  now: Date
) {
  const operations = await rows(db, organizationId, feature);
  const counted = operations.filter(
    (op) =>
      op.period === period(now) &&
      (op.status === 'completed' ||
        (op.status === 'reserved' && +new Date(op.expiresAt) > +now))
  );
  // I5 records created before this consumer are still charged. Completed ledger
  // rows survive deletion and exclude their conversations from the legacy count.
  const legacy =
    feature === 'lesson-planner'
      ? await db.lessonPlanConversation.count({
          where: {
            organizationId,
            createdAt: lessonPlanMonthWindow(now),
            id: {
              notIn: operations
                .filter((op) => op.status === 'completed' && op.conversationId)
                .map((op) => op.conversationId!),
            },
          },
        })
      : 0;
  return counted.length + legacy;
}
export async function readMonthlyUsage(
  organizationId: string,
  feature: MonthlyFeature,
  now = new Date()
) {
  return prisma.$transaction(async (db) => {
    await lock(db, organizationId, feature);
    return usage(db, organizationId, feature, now);
  });
}

/** Read an existing key before resolving a unit day that an earlier attempt created. */
export async function replayMonthlyOperation(input: {
  organizationId: string;
  membershipId: string;
  feature: MonthlyFeature;
  requestId: string;
  input: unknown;
}) {
  const name =
    prefix(input.organizationId, input.feature) +
    digest(`${input.membershipId}:${input.requestId}`);
  const row = await prisma.setting.findUnique({
    where: { name },
    select: { value: true },
  });
  if (!row) return null;
  const op = JSON.parse(row.value) as Operation;
  if (op.fingerprint !== digest(JSON.stringify(input.input)))
    return { kind: 'conflict' as const };
  if (op.status === 'completed')
    return { kind: 'replay' as const, payload: op.payload! };
  return null;
}

/** Reserve before provider work, using the DB lock shared by all app processes. */
export async function beginMonthlyOperation(input: {
  organizationId: string;
  membershipId: string;
  feature: MonthlyFeature;
  cap: number;
  requestId: string;
  input: unknown;
  now?: Date;
}): Promise<Result> {
  const now = input.now ?? new Date();
  const name =
    prefix(input.organizationId, input.feature) +
    digest(`${input.membershipId}:${input.requestId}`);
  const fingerprint = digest(JSON.stringify(input.input));
  return prisma.$transaction(async (db) => {
    await lock(db, input.organizationId, input.feature);
    const row = await db.setting.findUnique({
      where: { name },
      select: { value: true },
    });
    const previous: Operation | null = row ? JSON.parse(row.value) : null;
    if (previous && previous.fingerprint !== fingerprint)
      return { kind: 'conflict' };
    if (previous?.status === 'completed')
      return { kind: 'replay', payload: previous.payload! };
    if (previous?.status === 'reserved' && +new Date(previous.expiresAt) > +now)
      return { kind: 'pending' };
    if (
      (await usage(db, input.organizationId, input.feature, now)) >= input.cap
    )
      return { kind: 'exhausted' };
    const operation: Operation = {
      period: period(now),
      fingerprint,
      status: 'reserved',
      token: randomUUID(),
      expiresAt: new Date(+now + LEASE_MS).toISOString(),
    };
    const value = JSON.stringify(operation);
    await db.setting.upsert({
      where: { name },
      create: { name, value, valueType: 'json' },
      update: { value },
    });
    return {
      kind: 'reserved',
      name,
      organizationId: input.organizationId,
      feature: input.feature,
      operation,
    };
  });
}

/** Called in the SAME transaction as messages/draft writes, so outcomes cannot diverge. */
export async function finishMonthlyOperation(
  db: Prisma.TransactionClient,
  reservation: Reservation,
  payload: Record<string, unknown>,
  now?: Date
) {
  await lock(db, reservation.organizationId, reservation.feature);
  if (+new Date(reservation.operation.expiresAt) <= +(now ?? new Date()))
    throw new Error('Monthly reservation expired');
  const operation: Operation = {
    ...reservation.operation,
    status: 'completed',
    payload,
    ...(typeof payload.conversationId === 'string'
      ? { conversationId: payload.conversationId }
      : {}),
  };
  const result = await db.setting.updateMany({
    where: {
      name: reservation.name,
      value: JSON.stringify(reservation.operation),
    },
    data: { value: JSON.stringify(operation) },
  });
  if (result.count !== 1) throw new Error('Monthly reservation replaced');
}
export async function failMonthlyOperation(reservation: Reservation) {
  await prisma.$transaction(async (db) => {
    await lock(db, reservation.organizationId, reservation.feature);
    await db.setting.updateMany({
      where: {
        name: reservation.name,
        value: JSON.stringify(reservation.operation),
      },
      data: {
        value: JSON.stringify({ ...reservation.operation, status: 'failed' }),
      },
    });
  });
}

export function monthlyOperationResponse(result: Exclude<Result, Reservation>) {
  if (result.kind === 'replay') return Response.json(result.payload);
  if (result.kind === 'exhausted')
    return Response.json(
      {
        error:
          'You have used all your monthly uses. Need more? Talk to us, or come back next month.',
      },
      { status: 403 }
    );
  return Response.json(
    {
      error:
        result.kind === 'pending'
          ? 'This request is still being prepared. Please try again shortly.'
          : 'Use a new request ID for a different request.',
    },
    { status: 409 }
  );
}
