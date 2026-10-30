/**
 * The unit as a container: one map, and one real lesson per day built from it.
 *
 * Before this, a unit lived entirely inside the conversation that wrote its
 * map. Building day 3 appended a whole lesson to that thread, so by day six the
 * packet was eight lessons deep in one undifferentiated stack and the library
 * showed a single row. A day is a whole lesson — its own plan, packet, deck and
 * handouts — so it gets its own conversation, and the unit is what holds them
 * together.
 *
 * `unitDay` distinguishes the parts: null on a unit-linked conversation means
 * the map, a number means that day's lesson.
 */
import { prisma } from '~/utils/db.server';
import { readUnitPlan, UNIT_PLAN_FENCE, type UnitPlan } from './unit-plan';

export type UnitScope = { membershipId: string; organizationId: string };

/** Prisma's client and its transaction client both satisfy what we call here. */
type Db = Pick<typeof prisma, 'lessonPlanUnit' | 'lessonPlanConversation'>;

/**
 * Attach a conversation to a new unit when its reply lays out a map.
 *
 * Only fires for a conversation not already part of a unit: a teacher revising
 * the map should not spawn a second unit alongside the one their days already
 * hang off. Returns the unit id when one was created, so the caller can tell
 * the client a unit now exists.
 */
export async function createUnitFromMap({
  db,
  conversationId,
  reply,
  ctx,
  alreadyInUnit,
}: {
  db: Db;
  conversationId: string;
  reply: string;
  ctx: UnitScope;
  alreadyInUnit: boolean;
}): Promise<string | null> {
  if (alreadyInUnit) return null;
  const outcome = readUnitPlan(reply);
  if (outcome.kind !== 'unit') return null;

  const unit = await db.lessonPlanUnit.create({
    data: {
      membershipId: ctx.membershipId,
      organizationId: ctx.organizationId,
      title: outcome.unit.title,
    },
    select: { id: true },
  });
  await db.lessonPlanConversation.update({
    where: { id: conversationId },
    // unitDay stays null: this conversation is the map, not a day.
    data: { unitId: unit.id, unitDay: null },
  });
  return unit.id;
}

/**
 * Where a "build this day" click should land, without writing anything.
 *
 * Read-only on purpose: the lesson itself can still fail at the model, and
 * creating the day's conversation up front left an empty day behind that the
 * board then advertised as built. The row is created at persist time instead,
 * once there is actually a lesson to put in it.
 *
 * Returns null when the day cannot be placed in a unit at all, and the caller
 * falls back to ordinary behaviour rather than inventing a container.
 */
export async function resolveUnitDay({
  db,
  ctx,
  fromConversationId,
  day,
}: {
  db: Db;
  ctx: UnitScope;
  /** The conversation the button was clicked in — the map, normally. */
  fromConversationId: string;
  day: number;
}): Promise<{ unitId: string; conversationId: string | null } | null> {
  const source = await db.lessonPlanConversation.findFirst({
    where: {
      id: fromConversationId,
      membershipId: ctx.membershipId,
      deletedAt: null,
    },
    select: { unitId: true },
  });
  if (!source?.unitId) return null;

  // Clicking day 2 twice means "show me day 2", not "build me another one".
  const existing = await db.lessonPlanConversation.findFirst({
    where: { unitId: source.unitId, unitDay: day, deletedAt: null },
    select: { id: true },
  });
  return { unitId: source.unitId, conversationId: existing?.id ?? null };
}

/** The day's own conversation, created once there is a lesson to put in it. */
export async function createUnitDayConversation({
  db,
  ctx,
  unitId,
  day,
  title,
}: {
  db: Db;
  ctx: UnitScope;
  unitId: string;
  day: number;
  /** The day's own title from the map, so the lesson is named before it exists. */
  title: string;
}): Promise<{ id: string }> {
  return db.lessonPlanConversation.create({
    data: {
      membershipId: ctx.membershipId,
      organizationId: ctx.organizationId,
      title: `Day ${day} — ${title}`.slice(0, 120),
      unitId,
      unitDay: day,
    },
    select: { id: true },
  });
}

/**
 * The unit's map, found through the unit rather than by scanning one thread.
 *
 * A day lives in its own conversation now, so it cannot look at its own history
 * to find out what unit it belongs to — that was how this worked when the map
 * and its days shared a transcript.
 */
export async function loadUnitMap({
  db,
  unitId,
}: {
  db: Db;
  unitId: string;
}): Promise<UnitPlan | null> {
  const mapConversation = await db.lessonPlanConversation.findFirst({
    where: { unitId, unitDay: null, deletedAt: null },
    select: {
      messages: {
        where: {
          role: 'assistant',
          content: { contains: `\`\`\`${UNIT_PLAN_FENCE}` },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 1,
        select: { content: true },
      },
    },
  });
  const content = mapConversation?.messages[0]?.content;
  if (!content) return null;
  const outcome = readUnitPlan(content);
  return outcome.kind === 'unit' ? outcome.unit : null;
}

/** Which days of a unit already have a lesson, so the board can say so. */
export async function builtUnitDays({
  db,
  unitId,
}: {
  db: Db;
  unitId: string;
}): Promise<Map<number, string>> {
  const days = await db.lessonPlanConversation.findMany({
    where: { unitId, unitDay: { not: null }, deletedAt: null },
    select: { id: true, unitDay: true },
    orderBy: { unitDay: 'asc' },
  });
  return new Map(
    days
      .filter(
        (row): row is { id: string; unitDay: number } => row.unitDay !== null
      )
      .map((row) => [row.unitDay, row.id])
  );
}
