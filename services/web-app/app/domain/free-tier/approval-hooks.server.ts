import type { FreeTierApplication } from '@app/prisma';
import { provisionFreeClassroomFromApproval } from './provision-free-classroom.server';

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

let productionHooksInstalled = false;

/** Installs provisioning on approve; safe to call repeatedly. */
export function ensureFreeTierProductionApprovalHooks() {
  if (productionHooksInstalled) return;
  productionHooksInstalled = true;
  setApprovalHooks({
    onApplicationApproved: async (application) => {
      await provisionFreeClassroomFromApproval(application.id);
    },
  });
}

export function getApprovalHooks(): ApprovalHooks {
  return currentHooks;
}

