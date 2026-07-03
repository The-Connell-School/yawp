import { describe, expect, mock, test } from 'bun:test';

const requireAdmin = mock();
const requireMutableRequest = mock();

mock.module('~/utils/auth.server', () => ({
  requireAdmin,
  requireMutableRequest,
}));

const { adminTabs } = await import('./route');

describe('admin tabs', () => {
  test('labels the assignment types surface', () => {
    const assignmentTypesTab = adminTabs.find((tab) => tab.to === '/app/admin/assignments');

    expect(assignmentTypesTab?.label).toBe('Assignment Types');
    expect(adminTabs.map((tab) => tab.label)).not.toContain('Assignments & Grading');
  });
});
