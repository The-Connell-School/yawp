import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  FLAT_SIDEBAR_SECTIONS,
  getVisibleSidebarSections,
} from './sidebar-nav';

function teacherUser(email = 'teacher@example.com') {
  return {
    email,
    isAdmin: false,
    selectedMembership: {
      role: 'TEACHER',
      isOrgOwner: false,
      organization: { name: 'Org', plan: 'SCHOOL', reporterEnabled: true },
    },
  } as any;
}

function visibleDestinations(
  user: any,
  visibility: { teacherLoungeNavVisible?: boolean } = {}
) {
  return getVisibleSidebarSections(FLAT_SIDEBAR_SECTIONS, user, visibility).flatMap(
    (section) => section.links.map((link) => link.to)
  );
}

describe("Teacher's Lounge sidebar (temporarily disabled)", () => {
  test('does not show Teacher\'s Lounge for most teachers', () => {
    expect(visibleDestinations(teacherUser())).not.toContain(
      '/app/teacher-trainings'
    );
  });

  test('does not show the removed course grid nav even when visibility is enabled', () => {
    expect(
      visibleDestinations(teacherUser(), { teacherLoungeNavVisible: true })
    ).not.toContain('/app/teacher-trainings');
  });
});

// The sidebar hides the item unless it is told otherwise, so the app shell
// has to work the answer out and pass it down. #941 dropped both halves and
// the item vanished for everyone, with the Lounge on or off.
describe("the app shell tells the sidebar whether to show Teacher's Lounge", () => {
  const shell = readFileSync(join(import.meta.dir, 'route.tsx'), 'utf8');

  test('the loader works it out for the signed-in member', () => {
    expect(shell.includes('isTeacherLoungeNavVisibleForMember({')).toBe(true);
    expect(/\n\s+teacherLoungeNavVisible,\n/.test(shell)).toBe(true);
  });

  test('and the sidebar is given it', () => {
    expect(shell.includes('teacherLoungeNavVisible={teacherLoungeNavVisible}')).toBe(true);
  });
});
