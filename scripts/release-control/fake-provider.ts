/**
 * Sandbox fake provider — simulates external mutate (AWS/GitHub) for ordering tests.
 * Does NOT prove live provider enforcement.
 */
export type ProviderMutationRecord = {
  idempotencyKey: string;
  atMs: number;
  artifactCommit: string;
};

export class FakePromotionProvider {
  readonly mutations: ProviderMutationRecord[] = [];
  #failNext = false;

  queueFailureOnce(): void {
    this.#failNext = true;
  }

  async mutate(input: {
    idempotencyKey: string;
    atMs: number;
    artifactCommit: string;
    permitted: boolean;
  }): Promise<{ ok: true } | { ok: false; error: 'not_permitted' | 'provider_error' }> {
    if (!input.permitted) {
      return { ok: false, error: 'not_permitted' };
    }
    if (this.#failNext) {
      this.#failNext = false;
      return { ok: false, error: 'provider_error' };
    }
    this.mutations.push({
      idempotencyKey: input.idempotencyKey,
      atMs: input.atMs,
      artifactCommit: input.artifactCommit,
    });
    return { ok: true };
  }

  mutationCountForKey(idempotencyKey: string): number {
    return this.mutations.filter((m) => m.idempotencyKey === idempotencyKey).length;
  }
}
