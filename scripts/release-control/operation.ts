import type { ArtifactBinding, PromotionScope } from './types';
import type { GrantBinding } from './grant-binding';

/** Provider-facing promotion operation lifecycle (sandbox contract). */
export const OPERATION_STATES = [
  'authorized',
  'claimed',
  'submitting',
  'accepted',
  'unknown',
  'succeeded',
  'failed',
] as const;

export type OperationState = (typeof OPERATION_STATES)[number];

export const TERMINAL_OPERATION_STATES: OperationState[] = ['succeeded', 'failed'];

export function isTerminalOperationState(state: OperationState): boolean {
  return TERMINAL_OPERATION_STATES.includes(state);
}

export type PromotionOperation = {
  /** Immutable — derived from grant + idempotency key; used for provider readback. */
  operationId: string;
  grantId: string;
  idempotencyKey: string;
  scope: PromotionScope;
  binding: GrantBinding;
  artifact: ArtifactBinding;
  state: OperationState;
  generationAtOpen: number;
  updatedAtMs: number;
  /** Non-idempotent provider submits attempted (at most one mutate). */
  providerSubmitAttempted: boolean;
};

export function operationLogicalKey(input: {
  scope: PromotionScope;
  binding: GrantBinding;
  artifact: ArtifactBinding;
  idempotencyKey: string;
}): string {
  return [
    input.scope,
    input.binding.environment,
    input.binding.repository,
    input.binding.operation,
    input.artifact.commitSha,
    input.artifact.imageDigest ?? '',
    input.idempotencyKey,
  ].join('|');
}

export function deriveOperationId(grantId: string, idempotencyKey: string): string {
  return `op:${grantId}:${idempotencyKey}`;
}

/** Valid CAS transitions for the state machine (broker-enforced). */
export function canTransition(from: OperationState, to: OperationState): boolean {
  const allowed: Record<OperationState, OperationState[]> = {
    authorized: ['claimed', 'failed'],
    claimed: ['submitting', 'failed'],
    submitting: ['accepted', 'unknown', 'failed', 'succeeded'],
    accepted: ['succeeded', 'failed', 'unknown'],
    unknown: ['succeeded', 'failed', 'unknown'],
    succeeded: [],
    failed: [],
  };
  return allowed[from].includes(to);
}
