export type FreeTierStateGroup = {
  id: string;
  title: string;
  summary: string;
  states: FreeTierStateDefinition[];
};

export type FreeTierStateDefinition = {
  id: string;
  label: string;
  description: string;
  /** When true, jump signs the tester out and opens an admin email URL in the same tab. */
  adminSide?: boolean;
};

/** Visible states from design artboards 19–33 and component 81. Hidden rows are omitted until designed. */
export const FREE_TIER_STATE_GROUPS: FreeTierStateGroup[] = [
  {
    id: 'teacher-signup',
    title: 'Teacher signup',
    summary: 'Signs in as a new test teacher',
    states: [
      {
        id: 'signup.waitlist-submitted',
        label: 'Waitlist submitted',
        description: 'Teacher finished the public waitlist form and sees confirmation.',
      },
      {
        id: 'signup.account-created',
        label: 'Account created',
        description: 'Teacher signed up and lands on onboarding before admin approval.',
      },
      {
        id: 'signup.onboarding-in-progress',
        label: 'Onboarding in progress',
        description: 'Teacher is mid free-tier onboarding with a saved application.',
      },
      {
        id: 'signup.email-verification',
        label: 'Email verification pending',
        description: 'Teacher must verify email before continuing onboarding.',
      },
      {
        id: 'signup.returning-lead',
        label: 'Returning lead',
        description: 'Teacher returns via a release link while still a lead.',
      },
    ],
  },
  {
    id: 'pending-approval',
    title: 'Pending approval',
    summary: 'Signs in as a teacher',
    states: [
      {
        id: 'pending.waiting-on-admin',
        label: 'Waiting on admin approval',
        description: 'Teacher sees the pending classroom while approval is outstanding.',
      },
      {
        id: 'pending.manual-review',
        label: 'Manual review',
        description: 'Application is in manual review with the locked preview shell.',
      },
    ],
  },
  {
    id: 'approved',
    title: 'Approved',
    summary: 'Signs in as a teacher',
    states: [
      {
        id: 'approved.first-time-toast',
        label: 'First-time approved toast',
        description:
          'The one-time "approved" toast on the first visit after approval.',
      },
      {
        id: 'approved.usage-plenty-left',
        label: 'Usage: plenty left',
        description: 'Usage ring full for Lesson Planner and Reporter.',
      },
      {
        id: 'approved.usage-about-half-left',
        label: 'Usage: about half left',
        description: 'Ring half full.',
      },
      {
        id: 'approved.usage-a-few-left',
        label: 'Usage: a few left',
        description: 'Ring turns orange and the mobile menu shows a dot.',
      },
      {
        id: 'approved.usage-all-used',
        label: 'Usage: all used',
        description: 'Ring empty until November 1.',
      },
      {
        id: 'approved.lesson-planner-limit',
        label: 'Lesson Planner limit screen',
        description:
          'Monthly Lesson Planner usage at cap; limit UI from PR #657 when merged.',
      },
      {
        id: 'approved.reporter-limit',
        label: 'Reporter limit screen',
        description:
          'Monthly Reporter usage at cap; limit UI from PR #657 when merged.',
      },
    ],
  },
  {
    id: 'admin-side',
    title: 'Admin-side',
    summary: 'Opens signed-out admin pages from email links',
    states: [
      {
        id: 'admin.approve-from-email',
        label: 'Approve from email link',
        description: 'Admin opens the approve link while signed out.',
        adminSide: true,
      },
      {
        id: 'admin.not-right-person',
        label: 'Not the right person',
        description: 'Admin opens the decline link while signed out.',
        adminSide: true,
      },
    ],
  },
];

const CATALOG_JUMP_LABELS = new Set(
  FREE_TIER_STATE_GROUPS.flatMap((group) => group.states.map((state) => state.label))
);

export function isCatalogFreeTierJumpLabel(label: string) {
  return CATALOG_JUMP_LABELS.has(label);
}

export function findFreeTierState(stateId: string) {
  for (const group of FREE_TIER_STATE_GROUPS) {
    const state = group.states.find((entry) => entry.id === stateId);
    if (state) return { group, state };
  }
  return null;
}

export function freeTierStateSummary(stateId: string | null | undefined) {
  if (!stateId) return null;
  const found = findFreeTierState(stateId);
  if (!found) return null;
  return `${found.group.title.replace('Teacher signup', 'Signup')} · ${found.state.label.replace(/^Usage: /, '')}`;
}

export function freeTierGroupSubtitle(group: FreeTierStateGroup) {
  const count = group.states.length;
  return `${group.summary} · ${count} state${count === 1 ? '' : 's'}`;
}
