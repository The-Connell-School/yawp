import type { FreeTierApplication } from '@app/prisma';

export type ApprovalHooks = {
  onApplicationApproved(
    application: Pick<
      FreeTierApplication,
      'id' | 'email' | 'name' | 'schoolName' | 'userId' | 'organizationId'
    >
  ): Promise<void> | void;
  onApplicationRejected(
    application: Pick<FreeTierApplication, 'id' | 'email' | 'name' | 'schoolName'>,
    reason: string
  ): Promise<void> | void;
};

let currentHooks: ApprovalHooks = {
  async onApplicationApproved() {
    // no-op default
  },
  async onApplicationRejected() {
    // no-op default
  },
};

export function setApprovalHooks(overrides: Partial<ApprovalHooks>) {
  currentHooks = { ...currentHooks, ...overrides };
}

export function getApprovalHooks(): ApprovalHooks {
  return currentHooks;
}

