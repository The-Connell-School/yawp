import { describe, expect, mock, test } from 'bun:test';

const requireAdmin = mock();
const requireMutableRequest = mock();

mock.module('~/utils/auth.server', () => ({
  requireAdmin,
  requireMutableRequest,
}));

const { adminTabs, getAdminTabs } = await import('./route');

describe('admin tabs', () => {
  test('labels the assignment types surface', () => {
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

    expect(aiEvaluationsTab?.label).toBe('AI Evaluations');
  });

  test('hides the marketing tab unless the studio is enabled', () => {
    expect(getAdminTabs().map((tab) => tab.to)).not.toContain(
      '/app/admin/marketing-media'
    );
    expect(
      getAdminTabs({ marketingMediaEnabled: false }).map((tab) => tab.to)
    ).not.toContain('/app/admin/marketing-media');
  });

  test('appends the marketing tab when the studio is enabled', () => {
    const tabs = getAdminTabs({ marketingMediaEnabled: true });

    expect(tabs.map((tab) => tab.to)).toContain('/app/admin/marketing-media');
    expect(tabs).toHaveLength(adminTabs.length + 1);
  });
});
