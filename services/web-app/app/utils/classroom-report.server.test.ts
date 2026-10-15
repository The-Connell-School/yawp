import { describe, expect, mock, test } from 'bun:test';
import { getClassroomActivityReport } from './classroom-report.server';

describe('classroom activity aggregation', () => {
  test('every query uses active classes owned by the authenticated teacher in the selected organization', async () => {
    const countClasses = mock(async (_args: unknown) => 2);
    const students = mock(async (_args: unknown) => [{ userId: 'one' }, { userId: 'two' }]);
    const assignments = mock(async (_args: unknown) => 2);
    const documents = mock(async (_args: unknown) => 3);
    const tx = { class: { count: countClasses }, orgMembership: { findMany: students }, classAssignment: { count: assignments }, document: { count: documents } };
    const transaction = mock(async (work: (tx: unknown) => unknown, _options: unknown) => work(tx));
    const client = { $transaction: transaction };
    const report = await getClassroomActivityReport({ membershipId: 'session-teacher', organizationId: 'session-org' }, client as any, new Date('2026-10-01T12:00:00Z'));
    const scope = { isArchived: false, teachers: { some: { id: 'session-teacher', role: 'TEACHER', isActive: true, organizationId: 'session-org' } }, school: { organizationId: 'session-org' } };
    expect(countClasses.mock.calls[0]).toEqual([{ where: scope }]);
    expect(students.mock.calls[0]).toEqual([{ where: { organizationId: 'session-org', role: 'STUDENT', isActive: true, classesAsStudent: { some: scope } }, distinct: ['userId'], select: { userId: true } }]);
    expect(assignments.mock.calls[0]).toEqual([{ where: { class: scope } }]);
    expect(documents.mock.calls[0]).toEqual([{ where: { classAssignment: { class: scope }, deletedAt: null, archivedAt: null, submissions: { some: { archivedAt: null, unsubmittedAt: null } }, OR: [{ artifactKind: 'STUDENT', membership: { role: 'STUDENT', organizationId: 'session-org' } }, { artifactKind: 'ASSIGNMENT_GROUP', group: { isNot: null } }] } }]);
    expect(transaction.mock.calls[0]?.[1]).toEqual({ isolationLevel: 'RepeatableRead' });
    expect(report).toEqual({ activeClasses: 2, enrolledStudents: 2, assignments: 2, submittedWriting: 3, generatedAt: '2026-10-01T12:00:00.000Z' });
    expect(JSON.stringify(report)).not.toContain('session-');
  });
});
