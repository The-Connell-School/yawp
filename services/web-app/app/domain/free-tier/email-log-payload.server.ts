function isPreviewFreeTierLogging() {
  return (
    process.env.YAWP_ENVIRONMENT === 'preview' ||
    process.env.NODE_ENV === 'development' ||
    process.env.E2E === 'true' ||
    process.env.FREE_TIER_DB_TESTS === '1'
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
