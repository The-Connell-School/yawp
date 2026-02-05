function parseIdList(value: string | undefined) {
  return new Set(
    (value ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

export function isGradingAssistantEnabledForOrg(organizationId: string | null | undefined) {
  if (!organizationId) return false;
  if (process.env.NODE_ENV !== 'production') return true;
  const allowed = parseIdList(process.env.FEATURE_GRADING_ASSISTANT_ORG_IDS);
  return allowed.has(organizationId);
}

