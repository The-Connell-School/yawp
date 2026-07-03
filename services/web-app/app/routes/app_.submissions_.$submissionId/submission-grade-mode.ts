export function resolveSubmissionGradeMode({
  isGradingOther,
  editParam,
  loaderGradeMode,
}: {
  isGradingOther: boolean;
  editParam: string | null;
  loaderGradeMode: boolean;
}) {
  if (!isGradingOther) return false;
  return editParam !== null ? editParam === '1' : loaderGradeMode;
}
