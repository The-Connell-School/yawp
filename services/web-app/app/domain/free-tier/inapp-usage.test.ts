import { describe, test, expect } from 'bun:test';
import { buildFreeAccountUsage } from './inapp-usage';

const basis = {
  seatCap: 35,
  lessonPlanCap: 5,
  assignmentCaps: { class_starter: 12, prewriting: 3, thesis_statement: 3 },
};
describe('free account presentation counts', () => {
  test('zero, partial and exhausted lifetime assignment counts', () => {
    const usage = buildFreeAccountUsage({
      ...basis,
      students: 12,
      pendingInvites: 2,
      lessonPlans: 2,
      assignmentCounts: { class_starter: 3, prewriting: 9 },
    });
    expect(usage.students).toEqual({ used: 14, total: 35, remaining: 21 });
    expect(usage.assignments.map((a) => a.remaining)).toEqual([9, 0, 3]);
    expect(usage.lessonPlans.remaining).toBe(3);
    expect(usage.warning).toBe('Prewriting: none left');
  });
  test('full seats, all used assignments and lesson-plan exhaustion', () => {
    const usage = buildFreeAccountUsage({
      ...basis,
      students: 36,
      pendingInvites: 0,
      lessonPlans: 5,
      assignmentCounts: basis.assignmentCaps,
    });
    expect(usage.students.remaining).toBe(0);
    expect(usage.allAssignmentsUsed).toBe(true);
    expect(usage.lessonPlans.remaining).toBe(0);
    expect(usage.warning).toBe('Class is full');
  });
  test('does not invent usage or change the supplied caps', () => {
    const usage = buildFreeAccountUsage({
      ...basis,
      students: 0,
      pendingInvites: 0,
      lessonPlans: 0,
      assignmentCounts: {},
    });
    expect(usage.assignments.map((a) => a.total)).toEqual([12, 3, 3]);
    expect(usage.warning).toBeNull();
  });
});
