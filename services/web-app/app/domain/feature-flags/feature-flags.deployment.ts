/** Environment helpers safe for client and server bundles (no DB). */
export function isDemoDeployment(env: Record<string, string | undefined>) {
  return (
    env.PREVIEW_SLUG?.trim().toLowerCase() === 'demo' ||
    env.YAWP_ENVIRONMENT?.trim().toLowerCase() === 'demo'
  );
}

export function isPreviewDeployment(env: Record<string, string | undefined>) {
  return env.YAWP_ENVIRONMENT?.trim().toLowerCase() === 'preview';
}

export function isNonProductionDefaultOnDeployment(
  env: Record<string, string | undefined>
) {
  return isDemoDeployment(env) || isPreviewDeployment(env);
}
