import { describe, expect, test } from 'bun:test';
import { appSidebarIconForPath } from '~/components/app-sidebar-icons';
import { FLAT_SIDEBAR_SECTIONS } from './sidebar-nav';

const TEACHER_PRIMARY_PATHS = [
  '/app',
  '/app/my-classes',
  '/app/assignments',
  '/app/documents',
  '/app/lesson-planner',
  '/app/reporter',
] as const;

describe('FLAT_SIDEBAR_SECTIONS icons', () => {
  test('teacher primary links use shared app sidebar icons', () => {
    const linksByPath = new Map(
      FLAT_SIDEBAR_SECTIONS[0].links.map((link) => [link.to, link])
    );

    for (const path of TEACHER_PRIMARY_PATHS) {
      const link = linksByPath.get(path);
      expect(link).toBeDefined();
      expect(link!.icon).toBe(appSidebarIconForPath(path));
    }
  });
});
