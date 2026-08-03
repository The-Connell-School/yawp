export type ClassInsightMockMode = 'fixture' | 'live';

export function resolveClassInsightMockMode(env: NodeJS.ProcessEnv = process.env): {
  mode: ClassInsightMockMode;
  usesFixture: boolean;
} {
  const explicit = env.CLASS_INSIGHT_MOCK_MODE?.trim().toLowerCase();
  if (explicit === 'fixture' || explicit === 'live') {
    return {
      mode: explicit,
      usesFixture: explicit === 'fixture',
    };
  }

  if (env.NODE_ENV === 'test' || env.E2E === 'true') {
    if (
      env.E2E_ASSIGNMENT_INSIGHTS_FIXTURE === 'true' &&
      !env.ANTHROPIC_API_KEY?.trim()
    ) {
      return { mode: 'fixture', usesFixture: true };
    }
  }

  const hasApiKey = Boolean(env.ANTHROPIC_API_KEY?.trim());
  if (env.NODE_ENV === 'development' && !hasApiKey) {
    return { mode: 'fixture', usesFixture: true };
  }

  return { mode: 'live', usesFixture: false };
}
