import { describe, expect, mock, test } from 'bun:test';

const requireAdmin = mock();

mock.module('~/utils/auth.server', () => ({ requireAdmin }));

const { adminTabs } = await import('./route');

describe('admin tabs', () => {
  test('labels the assignments surface without grading terminology', () => {
    const assignmentsTab = adminTabs.find((tab) => tab.to === '/app/admin/assignments-grading');

    expect(assignmentsTab?.label).toBe('Assignments');
    expect(adminTabs.map((tab) => tab.label)).not.toContain('Assignments & Grading');
  });
});
