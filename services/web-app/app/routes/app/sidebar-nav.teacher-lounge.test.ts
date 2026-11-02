import { describe, expect, test } from 'bun:test';
import {
  FLAT_SIDEBAR_SECTIONS,
  getVisibleSidebarSections,
} from './sidebar-nav';

function teacherUser() {
  return {
    isAdmin: false,
    selectedMembership: {
      role: 'TEACHER',
      isOrgOwner: false,
      organization: { name: 'Org', plan: 'SCHOOL', reporterEnabled: true },
    },
  } as any;
}

function visibleDestinations(user: any) {
  return getVisibleSidebarSections(FLAT_SIDEBAR_SECTIONS, user).flatMap(
    (section) => section.links.map((link) => link.to)
  );
}

describe("Teacher's Lounge sidebar (temporarily disabled)", () => {
  test('does not show Teacher\'s Lounge for teachers', () => {
    expect(visibleDestinations(teacherUser())).not.toContain(
      '/app/teacher-trainings'
    );
  });
});
