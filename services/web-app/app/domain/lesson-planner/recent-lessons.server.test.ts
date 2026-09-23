import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { loadRecentLessons, readMyLesson } from './recent-lessons.server';

const db = {
  lessonPlanConversation: {
    findMany: mock(),
    findFirst: mock(),
  },
} as any;

const PLAN =
  '# Evidence that earns its place\n\n## Objective\n\nChoose the quote that proves the claim.\n\n## Closing (5 min)\n\nExit ticket.';

beforeEach(() => {
  db.lessonPlanConversation.findMany.mockReset();
  db.lessonPlanConversation.findFirst.mockReset();
});

describe('loadRecentLessons', () => {
  test('offers only conversations that actually produced a lesson', async () => {
    // A conversation that stopped at "which class?" has no objective to build
    // an exit ticket against, so offering it would be a dead end.
    db.lessonPlanConversation.findMany.mockResolvedValue([
      {
        id: 'plan-1',
        title: 'Evidence that earns its place',
        packetTitle: null,
        messages: [{ content: PLAN }],
      },
      {
        id: 'plan-2',
        title: 'Help me plan a lesson.',
        packetTitle: null,
        messages: [{ content: 'Which class is this for?' }],
      },
    ]);

    const lessons = await loadRecentLessons({
      db,
      membershipId: 'teacher-1',
    });

    expect(lessons).toEqual([
      { id: 'plan-1', title: 'Evidence that earns its place' },
    ]);
  });

  test('prefers the name the teacher gave the lesson', async () => {
    db.lessonPlanConversation.findMany.mockResolvedValue([
      {
        id: 'plan-1',
        title: 'Evidence that earns its place',
        packetTitle: 'Tuesday — quotes',
        messages: [{ content: PLAN }],
      },
    ]);

    const [lesson] = await loadRecentLessons({ db, membershipId: 'teacher-1' });
    expect(lesson?.title).toBe('Tuesday — quotes');
  });

  test('reads only this teacher’s live lessons, never the one in progress or a unit map', async () => {
    db.lessonPlanConversation.findMany.mockResolvedValue([]);

    await loadRecentLessons({
      db,
      membershipId: 'teacher-1',
      excludeConversationId: 'plan-now',
    });

    const where = db.lessonPlanConversation.findMany.mock.calls[0][0].where;
    expect(where.membershipId).toBe('teacher-1');
    expect(where.deletedAt).toBeNull();
    expect(where.id).toEqual({ not: 'plan-now' });
    // A unit's map has no single objective; its days are lessons of their own.
    expect(where.NOT).toEqual({ unitId: { not: null }, unitDay: null });
  });

  test('caps how many it offers', async () => {
    db.lessonPlanConversation.findMany.mockResolvedValue(
      Array.from({ length: 9 }, (_unused, index) => ({
        id: `plan-${index}`,
        title: `Lesson ${index}`,
        packetTitle: null,
        messages: [{ content: PLAN }],
      }))
    );

    const lessons = await loadRecentLessons({
      db,
      membershipId: 'teacher-1',
      limit: 4,
    });
    expect(lessons).toHaveLength(4);
  });
});

describe('readMyLesson', () => {
  test('returns the latest plan in the lesson and what it has filed', async () => {
    db.lessonPlanConversation.findFirst.mockResolvedValue({
      id: 'plan-1',
      title: 'Evidence that earns its place',
      packetTitle: null,
      messages: [
        { role: 'assistant', content: 'Here is the deck you asked for.' },
        { role: 'assistant', content: PLAN },
        { role: 'user', content: 'Plan a lesson on quotes.' },
      ],
      materials: [{ kind: 'handout', title: 'Diagnose & Repair' }],
    });

    const lesson = await readMyLesson({
      db,
      membershipId: 'teacher-1',
      lessonId: 'plan-1',
    });

    expect(lesson).toEqual({
      id: 'plan-1',
      title: 'Evidence that earns its place',
      plan: PLAN,
      materials: [{ kind: 'handout', title: 'Diagnose & Repair' }],
    });
  });

  test('never reaches another teacher’s lesson', async () => {
    db.lessonPlanConversation.findFirst.mockResolvedValue(null);

    const lesson = await readMyLesson({
      db,
      membershipId: 'teacher-1',
      lessonId: 'someone-elses',
    });

    expect(lesson).toEqual({ error: expect.any(String) });
    const where = db.lessonPlanConversation.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({
      id: 'someone-elses',
      membershipId: 'teacher-1',
      deletedAt: null,
    });
  });

  test('says so when the lesson never got as far as a plan', async () => {
    db.lessonPlanConversation.findFirst.mockResolvedValue({
      id: 'plan-2',
      title: 'New lesson',
      packetTitle: null,
      messages: [{ role: 'assistant', content: 'Which class is this for?' }],
      materials: [],
    });

    const lesson = await readMyLesson({
      db,
      membershipId: 'teacher-1',
      lessonId: 'plan-2',
    });
    expect(lesson).toEqual({ error: expect.any(String) });
  });
});
