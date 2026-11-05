export type PromotionDenyReason =
  | 'fail_closed_unconfigured'
  | 'fail_closed_unreachable'
  | 'fail_closed_malformed'
  | 'hold_active'
  | 'grant_missing'
  | 'grant_expired'
  | 'grant_already_consumed'
  | 'grant_stale_generation'
  | 'artifact_mismatch'
  | 'approval_invalid'
  | 'approval_unconfigured'
  | 'binding_mismatch'
  | 'digest_required'
  | 'generation_conflict'
  | 'replay_status_only'
  | 'hold_blocks_replay';

export class PromotionDeniedError extends Error {
  readonly reason: PromotionDenyReason;

  constructor(reason: PromotionDenyReason, message?: string) {
    super(message ?? reason);
    this.name = 'PromotionDeniedError';
    this.reason = reason;
  }
}
