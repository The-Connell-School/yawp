/** Demo-first rollout (PKG-14 A16): demo/preview on; production follows the flag. */
export function isPlatformLegacyAssignmentAdminEnabledForEnv(
  env: Record<string, string | undefined>,
  productionFlagEnabled: boolean
): boolean {
  const slug = env.PREVIEW_SLUG?.trim().toLowerCase();
  const yawpEnv = env.YAWP_ENVIRONMENT?.trim().toLowerCase();
  if (slug === 'demo' || yawpEnv === 'demo' || yawpEnv === 'preview') {
    return true;
  }
  return productionFlagEnabled;
}
