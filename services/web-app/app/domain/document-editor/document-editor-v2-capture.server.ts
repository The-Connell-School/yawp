import {
  isYawpPrPreviewDatabase,
  previewDatabaseNameFromUrl,
} from '~/utils/preview-email-capture.server';

/** Capture fixtures run only on isolated PR preview databases. */
export function isDocumentEditorV2CaptureAllowed(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (env.YAWP_ENVIRONMENT !== 'preview') return false;
  return isYawpPrPreviewDatabase(previewDatabaseNameFromUrl(env.DATABASE_URL));
}