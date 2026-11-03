export function getBuildMetadata() {
  return {
    commit: process.env.YAWP_GIT_COMMIT?.trim() || 'unknown',
    builtAt: process.env.YAWP_BUILT_AT?.trim() || 'unknown',
    environment: process.env.YAWP_ENVIRONMENT?.trim() || 'unknown',
  };
}
