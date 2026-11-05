import type { ApprovalIssuer } from './approval-verifier';
import { PromotionControl } from './promotion-control';
import type { PromotionStore } from './store';
import type { GrantBinding } from './grant-binding';
import type { EnforcementMode } from './enforcement-mode';

/**
 * Prototype promotion broker — NOT DEPLOYED.
 */
export type PromotionBrokerConfig = {
  store: PromotionStore;
  approvalIssuer: ApprovalIssuer;
  brokerBinding: GrantBinding;
  enforcementMode?: EnforcementMode;
};

export class PromotionBroker {
  readonly #control: PromotionControl;

  constructor(config: PromotionBrokerConfig) {
    this.#control = new PromotionControl({
      store: config.store,
      approvalIssuer: config.approvalIssuer,
      brokerBinding: config.brokerBinding,
      enforcementMode: config.enforcementMode ?? 'live',
    });
  }

  get control(): PromotionControl {
    return this.#control;
  }
}

export class WorkerPromotionClient {
  readonly #endpoint: string | undefined;

  constructor(config: { brokerEndpoint?: string }) {
    this.#endpoint = config.brokerEndpoint;
  }

  canForgeApproval(): false {
    return false;
  }

  brokerConfigured(): boolean {
    return Boolean(this.#endpoint);
  }
}
