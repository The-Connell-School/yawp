/**
 * Distinguishes prepare-only simulation from live production enforcement.
 *
 * - `prepare_only`: promotion mutate paths always deny (`fail_closed_unconfigured`).
 *   Safe for draft PRs; never fail-open.
 * - `live`: full fail-closed enforcement; misconfiguration denies (never skips gates).
 */
export type EnforcementMode = 'prepare_only' | 'live';

export function assertLiveEnforcementConfigured(mode: EnforcementMode): void {
  if (mode !== 'live') {
    throw new Error('live enforcement required');
  }
}

/** Live mode never treats "disabled" as allow — only explicit grant consume permits execute. */
export function promotionPathAllowed(mode: EnforcementMode): boolean {
  return mode === 'live';
}
