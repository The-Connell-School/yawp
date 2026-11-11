import { describe, expect, mock, test } from 'bun:test';

const prisma = {
  lessonPlanMaterial: { findMany: mock((_input: any): any => []), updateMany: mock((_input: any): any => ({ count: 0 })) },
  // The stack's order is read from the same rows, through stack-order.server.
  lessonPlanMessage: { findMany: mock(async (_input: any) => []) },
};
mock.module('~/utils/db.server', () => ({ prisma }));
const { classKeyFor, setStepWriting, titleWithMinutes } = await import('./stack-actions.server');

describe('stack actions — the small rules', () => {
  test('a step keeps its minutes in its title for the old page', () => {
    expect(titleWithMinutes('Hook activity (15 min)', 10)).toBe('Hook activity (10 min)');
    expect(titleWithMinutes('Frame — Historical context', 4)).toBe('Frame — Historical context (4 min)');
  });

  test('tomorrow is keyed by the class, however its label is typed', () => {
    expect(classKeyFor({ lessonClassLabel: 'English 10 · Period 3' })).toBe('label:english 10 period 3');
    expect(classKeyFor({ lessonClassLabel: 'english 10 - period 3' })).toBe('label:english 10 period 3');
    expect(classKeyFor({ classId: 'c1', lessonClassLabel: 'x' })).toBe('class:c1');
    expect(classKeyFor({})).toBe('any');
  });
});

describe("setStepWriting: the teacher's call on writing (Nov 4 follow-up)", () => {
  test('saves the call and hands back the row as it was, for Undo', async () => {
    const row = { id: 'pre', conversationId: 'plan-1', title: 'Pre-writing', writing: null, sourceCreatedAt: new Date(0), position: null };
    prisma.lessonPlanMaterial.findMany.mockReset().mockResolvedValue([row]);
    prisma.lessonPlanMaterial.updateMany.mockReset().mockResolvedValue({ count: 1 });
    const undo = await setStepWriting('plan-1', 'pre', false);
    expect(prisma.lessonPlanMaterial.findMany.mock.calls[0][0].select.writing).toBe(true);
    expect(prisma.lessonPlanMaterial.updateMany.mock.calls[0][0]).toEqual({
      where: { id: 'pre', conversationId: 'plan-1' },
      data: { writing: false },
    });
    expect(undo as unknown).toEqual({ rows: [row], order: ['m:pre'], carryOverIds: [] });
  });

  test('null hands the step back to Yawp!; a step not in the lesson changes nothing', async () => {
    prisma.lessonPlanMaterial.findMany.mockReset().mockResolvedValue([{ id: 'pre', conversationId: 'plan-1', sourceCreatedAt: new Date(0), position: null }]);
    prisma.lessonPlanMaterial.updateMany.mockReset().mockResolvedValue({ count: 1 });
    await setStepWriting('plan-1', 'pre', null);
    expect(prisma.lessonPlanMaterial.updateMany.mock.calls[0][0].data).toEqual({ writing: null });
    prisma.lessonPlanMaterial.findMany.mockReset().mockResolvedValue([]);
    prisma.lessonPlanMaterial.updateMany.mockReset();
    expect(await setStepWriting('plan-1', 'gone', false)).toBeNull();
    expect(prisma.lessonPlanMaterial.updateMany).not.toHaveBeenCalled();
  });
});
