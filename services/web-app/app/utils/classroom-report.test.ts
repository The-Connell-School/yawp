import { expect, test } from 'bun:test';
import { classroomReportSummary, CLASSROOM_REPORT_SCOPE, CLASSROOM_REPORT_RULES } from './classroom-report';

test('share output contains the exact aggregates, scope, generated time and counting definitions without identity or a URL', () => {
  const summary = classroomReportSummary({ activeClasses: 2, enrolledStudents: 4, assignments: 3, submittedWriting: 7, generatedAt: '2026-10-01T12:00:00.000Z' });
  for (const text of [CLASSROOM_REPORT_SCOPE, 'Generated at: 2026-10-01T12:00:00.000Z', 'Active classes: 2', 'Distinct enrolled students: 4', 'Assignments: 3', 'Submitted writing: 7', ...CLASSROOM_REPORT_RULES]) expect(summary).toContain(text);
  expect(summary).not.toMatch(/https?:|@|learning gains|time saved/i);
});
test('zero activity stays zero', () => {
  const summary = classroomReportSummary({ activeClasses: 0, enrolledStudents: 0, assignments: 0, submittedWriting: 0, generatedAt: '2026-10-01T12:00:00.000Z' });
  expect(summary.match(/: 0/g)).toHaveLength(4);
});
