// Staged rollout: legacy readers remain available until explicitly enabled.
export const auditMovedToInternal = () =>
  process.env.INTERNAL_ADMIN_AUDIT_MOVED === 'true';
export function internalAuditDestination() {
  const url = new URL(
    '/audit',
    process.env.YAWP_INTERNAL_URL || 'https://internal.yawp.school'
  );
  url.searchParams.set(
    'env',
    process.env.YAWP_ENVIRONMENT === 'production' ? 'production' : 'demo'
  );
  return url.toString();
}
