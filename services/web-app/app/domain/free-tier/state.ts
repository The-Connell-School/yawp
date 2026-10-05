export type FreeTierStatus =
  | 'LEAD'
  | 'INVITED'
  | 'ACCOUNT_CREATED'
  | 'ADMIN_SUBMITTED'
  | 'SENT'
  | 'MANUAL_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'EXPIRED';

const legalTransitions: Record<FreeTierStatus, FreeTierStatus[]> = {
  LEAD: ['INVITED', 'EXPIRED'],
  INVITED: ['ACCOUNT_CREATED', 'EXPIRED'],
  ACCOUNT_CREATED: ['ADMIN_SUBMITTED', 'EXPIRED'],
  ADMIN_SUBMITTED: ['SENT', 'MANUAL_REVIEW', 'EXPIRED'],
  SENT: ['MANUAL_REVIEW', 'APPROVED', 'EXPIRED'],
  MANUAL_REVIEW: ['APPROVED', 'REJECTED', 'EXPIRED'],
  APPROVED: [],
  REJECTED: [],
  EXPIRED: [],
};

export function canTransition(from: FreeTierStatus, to: FreeTierStatus): boolean {
  if (from === to) return true;
  const next = legalTransitions[from];
  return next ? next.includes(to) : false;
}

export function assertTransition(from: FreeTierStatus, to: FreeTierStatus) {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal state transition: ${from} -> ${to}`);
  }
}

