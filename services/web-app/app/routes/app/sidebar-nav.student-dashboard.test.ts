import { describe, expect, test } from 'bun:test';
import {
  FLAT_SIDEBAR_SECTIONS,
  getVisibleSidebarSections,
} from './sidebar-nav';

function userWith({
  role,
  writingPracticeEnabled = false,
  isAdmin = false,
}: {
  role: 'TEACHER' | 'STUDENT';
  writingPracticeEnabled?: boolean;
  isAdmin?: boolean;
}) {
  return {
    isAdmin,
    selectedMembership: {
      role,
      isOrgOwner: false,
      organization: { name: 'Org', writingPracticeEnabled },
    },
  } as any;
}

function destinationsFor(user: any) {
  return getVisibleSidebarSections(
    FLAT_SIDEBAR_SECTIONS,
    user
  ).flatMap((section) => section.links.map((link) => link.to));
}

describe('My Classes sidebar gating', () => {
  test('visible for a teacher', () => {
    expect(destinationsFor(userWith({ role: 'TEACHER' }))).toContain(
      '/app/my-classes'
    );
  });

  test('visible for a student', () => {
    expect(destinationsFor(userWith({ role: 'STUDENT' }))).toContain(
      '/app/my-classes'
    );
  });
});

describe('My Documents sidebar gating', () => {
  test('visible for a student', () => {
    expect(destinationsFor(userWith({ role: 'STUDENT' }))).toContain(
      '/app/my-documents'
    );
  });

  test('hidden for a teacher (teachers keep the existing Documents/grading link)', () => {
    expect(destinationsFor(userWith({ role: 'TEACHER' }))).not.toContain(
      '/app/my-documents'
    );
  });
});

describe('Writing Practice sidebar gating', () => {
  test('visible for a student when the org flag is on', () => {
    expect(
      destinationsFor(
        userWith({ role: 'STUDENT', writingPracticeEnabled: true })
      )
    ).toContain('/app/writing-lessons');
  });

  test('hidden for a student when the org flag is off', () => {
    expect(
      destinationsFor(
        userWith({ role: 'STUDENT', writingPracticeEnabled: false })
      )
    ).not.toContain('/app/writing-lessons');
  });

  test('visible for a teacher when the org flag is on', () => {
    expect(
      destinationsFor(
        userWith({ role: 'TEACHER', writingPracticeEnabled: true })
      )
    ).toContain('/app/writing-lessons');
  });

  test('hidden for a teacher when the org flag is off', () => {
    expect(
      destinationsFor(
        userWith({ role: 'TEACHER', writingPracticeEnabled: false })
      )
    ).not.toContain('/app/writing-lessons');
  });


});
