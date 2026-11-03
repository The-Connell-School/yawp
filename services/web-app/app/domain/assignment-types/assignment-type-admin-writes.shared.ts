export function readGradingInstructionsOverride(rawPromptConfig: unknown) {
  if (
    !rawPromptConfig ||
    typeof rawPromptConfig !== 'object' ||
    Array.isArray(rawPromptConfig)
  ) {
    return '';
  }

  const value = (rawPromptConfig as Record<string, unknown>)
    .gradingInstructionsOverride;
  return typeof value === 'string' ? value.trim() : '';
}
