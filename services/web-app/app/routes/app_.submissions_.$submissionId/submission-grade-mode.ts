export function resolveSubmissionGradeMode({
  isGradingOther,
  isDocumentSubmissionEnabled,
  editParam,
  loaderGradeMode,
}: {
  isGradingOther: boolean;
  isDocumentSubmissionEnabled: boolean;
  editParam: string | null;
  loaderGradeMode: boolean;
}) {
  if (!isGradingOther || !isDocumentSubmissionEnabled) return false;
  return editParam !== null ? editParam === '1' : loaderGradeMode;
}
