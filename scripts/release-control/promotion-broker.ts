import type { ApprovalIssuer } from './approval-verifier';
import { PromotionControl } from './promotion-control';
import type { PromotionStore } from './store';

/**
 * Prototype promotion broker — the only component that should mint grants after
 * verifying human/environment consent. Workers receive read/consume instructions
 * but must not hold the approval signing secret or AWS release-writer keys.
 *
 * NOT DEPLOYED: no Lambda, no IAM, no table provisioning in this PR.
 */
export type PromotionBrokerConfig = {
  store: PromotionStore;
  approvalIssuer: ApprovalIssuer;
};

export class PromotionBroker {
  readonly #control: PromotionControl;

  constructor(config: PromotionBrokerConfig) {
    this.#control = new PromotionControl({
      store: config.store,
      approvalIssuer: config.approvalIssuer,
      enforcementEnabled: true,
    });
  }

  get control(): PromotionControl {
    return this.#control;
  }
}

export type WorkerPromotionClientConfig = {
  /** Workers only talk to broker HTTP API in production; tests use PromotionControl directly. */
  brokerEndpoint?: string;
};

/**
 * Worker-side stub — documents that workers must not embed issuer secrets.
 */
export class WorkerPromotionClient {
  readonly #endpoint: string | undefined;

  constructor(config: WorkerPromotionClientConfig) {
    this.#endpoint = config.brokerEndpoint;
  }

  canForgeApproval(): false {
    return false;
  }

  brokerConfigured(): boolean {
    return Boolean(this.#endpoint);
  }
}
