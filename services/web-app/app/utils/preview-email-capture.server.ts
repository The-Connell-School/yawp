/** Isolated PR preview DBs only — never prod, demo, or local dev. */
const YAWP_PR_PREVIEW_DB = /^yawp_pr_[0-9]+$/;

export function previewDatabaseNameFromUrl(databaseUrl: string | undefined): string | null {
  if (!databaseUrl?.trim()) return null;
  const match = databaseUrl.match(/\/(yawp_pr_\d+)(?:\?|$)/);
  return match?.[1] ?? null;
}

export function isYawpPrPreviewDatabase(databaseName: string | null | undefined): boolean {
  if (!databaseName) return false;
  return YAWP_PR_PREVIEW_DB.test(databaseName);
}

/** Log-and-succeed email delivery on PR previews without a real Resend key. */
export function shouldUsePreviewEmailCapture(): boolean {
  if (process.env.YAWP_ENVIRONMENT !== 'preview') return false;
  if (!isYawpPrPreviewDatabase(previewDatabaseNameFromUrl(process.env.DATABASE_URL))) {
    return false;
  }
  const key = process.env.RESEND_API_KEY?.trim() ?? '';
  return !key || key === 'preview-resend-key';
}
