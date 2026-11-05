import { describe, expect, test } from 'bun:test';
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

  test('shows Teacher\'s Lounge when the app loader enables nav visibility', () => {
    expect(
      visibleDestinations(teacherUser(), { teacherLoungeNavVisible: true })
    ).toContain('/app/teacher-trainings');
  });
});
