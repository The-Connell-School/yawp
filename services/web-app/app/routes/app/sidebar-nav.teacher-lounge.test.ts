import { describe, expect, test } from 'bun:test';
import { TEACHER_LOUNGE_DISABLE_ALLOWLIST_EMAILS } from '~/domain/teacher-lounge/teacher-lounge-temporary-disable';
import {
  FLAT_SIDEBAR_SECTIONS,
  getVisibleSidebarSections,
  hideLegacyLoungeNavWhenDisabled,
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

function visibleDestinations(user: any, communityOn = false) {
  return getVisibleSidebarSections(
    hideLegacyLoungeNavWhenDisabled(
      FLAT_SIDEBAR_SECTIONS,
      communityOn,
    ),
    user,
  ).flatMap((section) => section.links.map((link) => link.to));
}

describe("Teacher's Lounge sidebar (temporarily disabled)", () => {
  test('does not show Teacher\'s Lounge for most teachers', () => {
    expect(visibleDestinations(teacherUser())).not.toContain(
      '/app/teacher-trainings'
    );
  });

  test('shows Teacher\'s Lounge for allowlisted Montgomery teacher', () => {
    expect(
      visibleDestinations(
        teacherUser(TEACHER_LOUNGE_DISABLE_ALLOWLIST_EMAILS[0])
      )
    ).toContain('/app/teacher-trainings');
  });
});
