import { beforeEach, describe, expect, mock, test } from 'bun:test';
import {
  builtUnitDays,
  createUnitDayConversation,
  createUnitFromMap,
  loadUnitMap,
  resolveUnitDay,
} from './lesson-unit.server';

const db = {
  lessonPlanUnit: { create: mock() },
  lessonPlanConversation: {
    create: mock(),
    update: mock(),
    findFirst: mock(),
    findMany: mock(),
  },
} as any;

const ctx = { membershipId: 'teacher-1', organizationId: 'org-1' };

const unitBlock = [
  '```yawp-unit',
  JSON.stringify({
    title: 'Writing the literary analysis paragraph',
    endsWith: 'One analysis paragraph',
    days: [
      {
        day: 1,
        title: 'What a claim is',
        objective: 'Tell a claim from a summary',
        students: 'Sort ten sentences',
      },
      {
        day: 2,
        title: 'Evidence that earns its place',
        objective: 'Choose the quote that proves it',
        students: 'Match claims to quotes',
      },
    ],
  }),
  '```',
].join('\n');

beforeEach(() => {
  db.lessonPlanUnit.create.mockReset().mockResolvedValue({ id: 'unit-1' });
  db.lessonPlanConversation.create.mockReset();
  db.lessonPlanConversation.update.mockReset().mockResolvedValue({});
  db.lessonPlanConversation.findFirst.mockReset();
  db.lessonPlanConversation.findMany.mockReset();
});

describe('createUnitFromMap', () => {
  test('turns the conversation that wrote a map into a unit', async () => {
    const unitId = await createUnitFromMap({
      db,
      conversationId: 'conv-1',
      reply: `Here is the arc.\n\n${unitBlock}`,
      ctx,
      alreadyInUnit: false,
    });

    expect(unitId).toBe('unit-1');
    // Titled off the map, so the library can list the unit without parsing a
    // message to find out what it is.
    expect(db.lessonPlanUnit.create.mock.calls[0][0].data).toMatchObject({
      membershipId: 'teacher-1',
      organizationId: 'org-1',
      title: 'Writing the literary analysis paragraph',
    });
    // Null unitDay: this conversation is the map, not one of the days.
    expect(db.lessonPlanConversation.update.mock.calls[0][0].data).toEqual({
      unitId: 'unit-1',
      unitDay: null,
    });
  });

  test('ignores a reply with no map in it', async () => {
    const unitId = await createUnitFromMap({
      db,
      conversationId: 'conv-1',
      reply: '## Warm-up\n\nFour minutes of writing.',
      ctx,
      alreadyInUnit: false,
    });
    expect(unitId).toBeNull();
    expect(db.lessonPlanUnit.create).not.toHaveBeenCalled();
  });

  test('does not spawn a second unit when the teacher revises the map', async () => {
    // Otherwise a revised map orphans the days already hanging off the first.
    const unitId = await createUnitFromMap({
      db,
      conversationId: 'conv-1',
      reply: `Revised.\n\n${unitBlock}`,
      ctx,
      alreadyInUnit: true,
    });
    expect(unitId).toBeNull();
    expect(db.lessonPlanUnit.create).not.toHaveBeenCalled();
  });
});

describe('resolveUnitDay', () => {
  test('finds the unit without writing anything', async () => {
    // Read-only on purpose: the lesson can still fail at the model, and a row
    // created up front would leave an empty day the board calls built.
    db.lessonPlanConversation.findFirst
      .mockResolvedValueOnce({ unitId: 'unit-1' })
      .mockResolvedValueOnce(null);

    const target = await resolveUnitDay({
      db,
      ctx,
      fromConversationId: 'map-conv',
      day: 2,
    });

    expect(target).toEqual({ unitId: 'unit-1', conversationId: null });
    expect(db.lessonPlanConversation.create).not.toHaveBeenCalled();
  });

  test('points at a day that already exists rather than a second copy', async () => {
    // Clicking day 2 twice means "show me day 2", not "make another one".
    db.lessonPlanConversation.findFirst
      .mockResolvedValueOnce({ unitId: 'unit-1' })
      .mockResolvedValueOnce({ id: 'day-2-existing' });

    expect(
      await resolveUnitDay({ db, ctx, fromConversationId: 'map-conv', day: 2 })
    ).toEqual({ unitId: 'unit-1', conversationId: 'day-2-existing' });
  });

  test('places no day when the conversation is not part of a unit', async () => {
    db.lessonPlanConversation.findFirst.mockResolvedValueOnce({ unitId: null });

    expect(
      await resolveUnitDay({ db, ctx, fromConversationId: 'loose', day: 2 })
    ).toBeNull();
  });

  test('will not reach into another teacher’s conversation', async () => {
    db.lessonPlanConversation.findFirst.mockResolvedValueOnce(null);

    expect(
      await resolveUnitDay({ db, ctx, fromConversationId: 'theirs', day: 1 })
    ).toBeNull();
    const where = db.lessonPlanConversation.findFirst.mock.calls[0][0].where;
    expect(where.membershipId).toBe('teacher-1');
  });
});

describe('createUnitDayConversation', () => {
  test('names the day off the map before the lesson exists', async () => {
    db.lessonPlanConversation.create.mockResolvedValue({ id: 'day-2' });

    const created = await createUnitDayConversation({
      db,
      ctx,
      unitId: 'unit-1',
      day: 2,
      title: 'Evidence that earns its place',
    });

    expect(created.id).toBe('day-2');
    expect(
      db.lessonPlanConversation.create.mock.calls[0][0].data
    ).toMatchObject({
      unitId: 'unit-1',
      unitDay: 2,
      title: 'Day 2 — Evidence that earns its place',
    });
  });
});

describe('loadUnitMap', () => {
  test('finds the map through the unit rather than one transcript', async () => {
    // A day lives in its own conversation now, so it cannot scan its own
    // history for the map the way it could when they shared a thread.
    db.lessonPlanConversation.findFirst.mockResolvedValue({
      messages: [{ content: `Here is the arc.\n\n${unitBlock}` }],
    });

    const map = await loadUnitMap({ db, unitId: 'unit-1' });

    expect(map?.title).toBe('Writing the literary analysis paragraph');
    expect(map?.days).toHaveLength(2);
    const where = db.lessonPlanConversation.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ unitId: 'unit-1', unitDay: null });
  });

  test('returns nothing when the unit has no readable map', async () => {
    db.lessonPlanConversation.findFirst.mockResolvedValue({ messages: [] });
    expect(await loadUnitMap({ db, unitId: 'unit-1' })).toBeNull();
  });
});

describe('builtUnitDays', () => {
  test('maps each built day to the lesson it lives in', async () => {
    db.lessonPlanConversation.findMany.mockResolvedValue([
      { id: 'day-1-conv', unitDay: 1 },
      { id: 'day-3-conv', unitDay: 3 },
    ]);

    const built = await builtUnitDays({ db, unitId: 'unit-1' });

    expect(built.get(1)).toBe('day-1-conv');
    expect(built.get(3)).toBe('day-3-conv');
    // Day 2 has not been built, so the board still offers to build it.
    expect(built.has(2)).toBe(false);
  });
});
