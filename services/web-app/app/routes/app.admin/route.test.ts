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

  test('marks organizations read-only visibility as moved to internal', () => {
    const organizationsTab = adminTabs.find(
      (tab) => tab.to === '/app/admin/organizations'
    );

    expect(organizationsTab?.label).toBe('Organizations (read-only moved)');
  });

  test('links assignment types to the legacy admin list route', () => {
    const assignmentTypesTab = adminTabs.find(
      (tab) => tab.to === '/app/admin/assignments'
    );

    expect(assignmentTypesTab?.label).toBe('Assignment Types');
    expect(adminTabs.map((tab) => tab.label)).not.toContain(
      'Assignments & Grading'
    );
  });

  test('links to the AI evaluation review surface', () => {
    const aiEvaluationsTab = adminTabs.find(
      (tab) => tab.to === '/app/admin/ai-evaluations'
    );

    expect(aiEvaluationsTab?.label).toBe('Grading Evaluations');
  });
});
