export function isApHistoryPdfImportEnabled(
  organizationEnabled: boolean,
): boolean {
  if (!organizationEnabled) return false;
  return process.env.AP_HISTORY_PDF_IMPORT_ENABLED !== 'false';
}
