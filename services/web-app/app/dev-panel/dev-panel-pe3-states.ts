/** PE3 artifact flat list (page-875e83166b39) → existing jump catalog ids. */
export type Pe3FreeTierState = {
  catalogId: string;
  label: string;
  code: string;
  /** Short value shown on the main panel row, e.g. Pending */
  rowValue: string;
};

export const PE3_FREE_TIER_STATES: Pe3FreeTierState[] = [
  {
    catalogId: 'signup.waitlist-submitted',
    label: 'Waitlisted',
    code: 'LEAD',
    rowValue: 'Waitlisted',
  },
  {
    catalogId: 'signup.email-verification',
    label: 'Invite sent',
    code: 'INVITED',
    rowValue: 'Invited',
  },
  {
    catalogId: 'signup.account-created',
    label: 'Account created',
    code: 'ACCOUNT_CREATED',
    rowValue: 'Account created',
  },
  {
    catalogId: 'pending.waiting-on-admin',
    label: 'Pending approval',
    code: 'SENT',
    rowValue: 'Pending',
  },
  {
    catalogId: 'pending.manual-review',
    label: 'Manual review',
    code: 'MANUAL_REVIEW',
    rowValue: 'Manual review',
  },
  {
    catalogId: 'approved.usage-plenty-left',
    label: 'Approved',
    code: 'APPROVED',
    rowValue: 'Approved',
  },
  {
    catalogId: 'lifecycle.rejected',
    label: 'Not approved',
    code: 'REJECTED',
    rowValue: 'Not approved',
  },
  {
    catalogId: 'lifecycle.expired',
    label: 'Invite expired',
    code: 'EXPIRED',
    rowValue: 'Expired',
  },
];

export function pe3FreeTierRowValue(catalogId: string | null | undefined) {
  if (!catalogId) return 'None';
  return (
    PE3_FREE_TIER_STATES.find((entry) => entry.catalogId === catalogId)?.rowValue ??
    'None'
  );
}

export function findPe3FreeTierState(catalogId: string) {
  return PE3_FREE_TIER_STATES.find((entry) => entry.catalogId === catalogId) ?? null;
}
