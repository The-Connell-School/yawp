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

let productionHooksInstall: Promise<void> | null = null;

/** Installs provisioning on approve; safe to call repeatedly. */
export function ensureFreeTierProductionApprovalHooks(): Promise<void> {
  if (!productionHooksInstall) {
    productionHooksInstall = import('./provision-free-classroom.server').then(
      ({ provisionFreeClassroomFromApproval }) => {
        const previousApproved = currentHooks.onApplicationApproved;
        setApprovalHooks({
          onApplicationApproved: async (application) => {
            await provisionFreeClassroomFromApproval(application.id);
            await previousApproved(application);
          },
        });
      }
    );
  }
  return productionHooksInstall;
}

export function getApprovalHooks(): ApprovalHooks {
  return currentHooks;
}
