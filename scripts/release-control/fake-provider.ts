/**
 * Sandbox fake provider — NOT AWS/GitHub.
 * Supports accept/reject-before-accept, timeout-after-accept, and readback.
 */
export type ProviderReadback =
  | { outcome: 'succeeded' }
  | { outcome: 'failed' }
  | { outcome: 'pending' };

export type ProviderSubmitResult =
  | { kind: 'rejected_before_acceptance' }
  | { kind: 'accepted'; providerToken: string }
  | { kind: 'timeout_after_acceptance'; providerToken: string };

export class FakePromotionProvider {
  readonly submitCalls: string[] = [];
  readonly readbackCalls: string[] = [];
  #queue: ProviderSubmitResult[] = [];
  readonly #accepted = new Map<string, ProviderReadback>();

  queueResults(...results: ProviderSubmitResult[]): void {
    this.#queue.push(...results);
  }

  setReadback(providerToken: string, readback: ProviderReadback): void {
    this.#accepted.set(providerToken, readback);
  }

  async submit(operationId: string): Promise<ProviderSubmitResult> {
    this.submitCalls.push(operationId);
    if (this.#queue.length === 0) {
      return { kind: 'accepted', providerToken: `tok-${operationId}` };
    }
    const next = this.#queue.shift()!;
    if (next.kind === 'accepted' || next.kind === 'timeout_after_acceptance') {
      this.#accepted.set(next.providerToken, { outcome: 'pending' });
    }
    return next;
  }

  async readback(providerToken: string): Promise<ProviderReadback> {
    this.readbackCalls.push(providerToken);
    return this.#accepted.get(providerToken) ?? { outcome: 'pending' };
  }

  submitCount(operationId: string): number {
    return this.submitCalls.filter((id) => id === operationId).length;
  }
}
