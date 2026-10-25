/** Safe error fields for browser console logs — name and known codes only. */
export function buildSafeErrorScalarsForLog(error: unknown): {
  errorName: string;
  code?: string;
} {
  if (!(error instanceof Error)) {
    return { errorName: 'UnknownError' };
  }

  const rawCode = (error as Error & { code?: unknown }).code;
  const code =
    typeof rawCode === 'string' && /^[A-Za-z0-9_]+$/.test(rawCode)
      ? rawCode
      : undefined;

  return {
    errorName: error.name,
    ...(code ? { code } : {}),
  };
}
