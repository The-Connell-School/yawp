import { isDemoEnvironment } from '~/utils/preview-access.server';

function isNonDemoPrPreview(env: NodeJS.ProcessEnv = process.env) {
  return env.YAWP_ENVIRONMENT === 'preview' && !isDemoEnvironment(env);
}

function isPreviewFreeTierLogging(env: NodeJS.ProcessEnv = process.env) {
  if (isDemoEnvironment(env) || env.YAWP_ENVIRONMENT === 'demo') {
    return false;
  }
  if (env.NODE_ENV === 'production') {
    return isNonDemoPrPreview(env);
  }
  return (
    env.YAWP_ENVIRONMENT === 'preview' ||
    env.NODE_ENV === 'development' ||
    env.E2E === 'true' ||
    env.FREE_TIER_DB_TESTS === '1'
  );
}

export function sanitizeFreeTierEmailLogPayload(
  payload: Record<string, string> | undefined
): Record<string, string> | undefined {
  if (!payload || isPreviewFreeTierLogging()) return payload;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (key.endsWith('Url') || key.endsWith('URL') || key === 'joinUrl') {
      continue;
    }
    out[key] = value;
  }
  return Object.keys(out).length ? out : undefined;
}
