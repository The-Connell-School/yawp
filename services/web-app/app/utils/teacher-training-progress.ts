export function getTeacherTrainingProgressPercent(
  videoTimestamp: number | null | undefined,
  videoDuration: number | null | undefined
) {
  if (!videoDuration || videoDuration <= 0) return 0;

  const rawPercent = ((videoTimestamp ?? 0) / videoDuration) * 100;
  if (!Number.isFinite(rawPercent)) return 0;

  return Math.max(0, Math.min(100, Math.ceil(rawPercent)));
}

export function isTeacherTrainingModuleComplete(
  videoTimestamp: number | null | undefined,
  videoDuration: number | null | undefined
) {
  return (
    !!videoDuration &&
    videoDuration > 0 &&
    (videoTimestamp ?? 0) >= videoDuration
  );
}
