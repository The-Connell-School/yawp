import { FREE_TIER_STATE_GROUPS } from './free-tier-states.catalog';

export type FreeTierJumpExpectation = {
  /** Pathname (and optional search) after jump completes on the app origin. */
  redirectPath: string;
  /** When set, success toast includes this catalog label after reload. */
  toastLabel?: string;
  /** Pending states require a throwaway account in the jumper API. */
  throwawayRequired?: boolean;
  /** Admin-side jumps sign the tester out before redirect. */
  adminSide?: boolean;
  /** Unique heading on the admin page after jump (demo has free-tier flag on). */
  adminHeading?: RegExp;
  /** Visible limit/lock screen after jump (approved monthly cap states). */
  pageTestId?: string;
};

const EXPECTATIONS: Record<string, FreeTierJumpExpectation> = {
  'signup.waitlist-submitted': { redirectPath: '/free' },
  'signup.account-created': { redirectPath: '/app/free-tier/onboarding' },
  'signup.onboarding-in-progress': { redirectPath: '/app/free-tier/onboarding' },
  'signup.email-verification': { redirectPath: '/app/free-tier/onboarding' },
  'signup.returning-lead': { redirectPath: '/free/join' },
  'pending.waiting-on-admin': {
    redirectPath: '/app/free-tier/pending',
    throwawayRequired: true,
  },
  'pending.manual-review': {
    redirectPath: '/app/free-tier/pending',
    throwawayRequired: true,
  },
  'approved.first-time-toast': {
    redirectPath: '/app',
    toastLabel: 'First-time approved toast',
  },
  'approved.usage-plenty-left': {
    redirectPath: '/app',
    toastLabel: 'Usage: plenty left',
  },
  'approved.usage-about-half-left': {
    redirectPath: '/app',
    toastLabel: 'Usage: about half left',
  },
  'approved.usage-a-few-left': {
    redirectPath: '/app',
    toastLabel: 'Usage: a few left',
  },
  'approved.usage-all-used': {
    redirectPath: '/app',
    toastLabel: 'Usage: all used',
  },
  'approved.lesson-planner-limit': {
    redirectPath: '/app/lesson-planner',
    toastLabel: 'Lesson Planner limit screen',
    pageTestId: 'lesson-planner-monthly-limit',
  },
  'approved.reporter-limit': {
    redirectPath: '/app/reporter',
    toastLabel: 'Reporter limit screen',
    pageTestId: 'free-reporter-monthly-limit',
  },
  'lifecycle.rejected': {
    redirectPath: '/app/free-tier/status',
    toastLabel: 'Not approved',
  },
  'lifecycle.expired': {
    redirectPath: '/app/free-tier/status',
    toastLabel: 'Invite expired',
  },
  'admin.approve-from-email': {
    redirectPath: '/free/admin/approve',
    adminSide: true,
    adminHeading: /Approve Yawp! for Test Teacher at Lincoln High School/,
  },
  'admin.not-right-person': {
    redirectPath: '/free/admin/not-right-person',
    adminSide: true,
    adminHeading: /Who should approve Yawp! for Test Teacher\?/,
  },
};

export function listCatalogFreeTierJumpExpectations() {
  return FREE_TIER_STATE_GROUPS.flatMap((group) =>
    group.states.map((state) => {
      const expectation = EXPECTATIONS[state.id];
      if (!expectation) {
        throw new Error(`Missing jump expectation for catalog state ${state.id}`);
      }
      return {
        stateId: state.id,
        label: state.label,
        ...expectation,
      };
    })
  );
}
