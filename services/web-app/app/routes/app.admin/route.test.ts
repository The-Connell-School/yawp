import { describe, expect, mock, test } from 'bun:test';

const requireAdmin = mock();
const requireMutableRequest = mock();

mock.module('~/utils/auth.server', () => ({
  requireAdmin,
  requireMutableRequest,
}));

const { adminTabs } = await import('./route');

describe('admin tabs', () => {
  test('marks tester feedback as moved to internal', () => {
    const testerFeedbackTab = adminTabs.find(
      (tab) => tab.to === '/app/tester/feedback'
    );

    expect(testerFeedbackTab?.label).toBe('Tester feedback (moved)');
  });

  test('marks the assignment types surface as moved', () => {
    const assignmentTypesTab = adminTabs.find(
      (tab) => tab.to === '/app/admin/assignments'
    );

    expect(assignmentTypesTab?.label).toBe('Assignment Types (moved)');
    expect(adminTabs.map((tab) => tab.label)).not.toContain(
      'Assignments & Grading'
    );
  });

  test('links to the AI evaluation review surface', () => {
    const aiEvaluationsTab = adminTabs.find(
      (tab) => tab.to === '/app/admin/ai-evaluations'
    );

    expect(aiEvaluationsTab?.label).toBe('AI Evaluations');
  });
});
