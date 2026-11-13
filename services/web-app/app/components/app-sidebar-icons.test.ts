import { describe, expect, test } from 'bun:test';
import { appSidebarIconForPath } from './app-sidebar-icons';

const TEACHER_NAV_PATHS = [
  '/app',
  '/app/my-classes',
  '/app/assignments',
  '/app/documents',
  '/app/lesson-planner',
  '/app/reporter',
] as const;

describe('appSidebarIconForPath', () => {
  test('teacher primary nav routes use custom sidebar icons', () => {
    for (const path of TEACHER_NAV_PATHS) {
      expect(appSidebarIconForPath(path)).not.toBeNull();
    }
  });

  test('unknown routes fall back to caller-provided icons', () => {
    expect(appSidebarIconForPath('/app/admin')).toBeNull();
  });
});
