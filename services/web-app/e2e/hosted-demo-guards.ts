export const hostedRepeatSignupSkipArtifact = 'hosted-demo-repeat-signup-skip.txt';

type HostedRepeatSignupGuard =
  | {
      status: 'skip';
      artifactName: typeof hostedRepeatSignupSkipArtifact;
      artifactBody: string;
      skipMessage: string;
      missing: string[];
    }
  | {
      status: 'ready';
      baseUrl: string;
      code: string;
      fixtureEmail: string;
    };

export function resolveHostedRepeatSignupGuard(
  env: Partial<NodeJS.ProcessEnv> = process.env
): HostedRepeatSignupGuard {
  const baseUrl = env.DEMO_FREE_TIER_BASE_URL?.trim().replace(/\/+$/, '');
  const code = env.DEMO_FREE_TIER_REPEAT_EVENT_TOKEN?.trim();
  const fixtureEmail = env.DEMO_FREE_TIER_REPEAT_EMAIL?.trim();
  const allowSubmit = env.DEMO_FREE_TIER_REPEAT_ALLOW_SUBMIT === 'true';
  const missing = [
    !baseUrl ? 'DEMO_FREE_TIER_BASE_URL' : null,
    !code ? 'DEMO_FREE_TIER_REPEAT_EVENT_TOKEN' : null,
    !fixtureEmail ? 'DEMO_FREE_TIER_REPEAT_EMAIL' : null,
    !allowSubmit ? 'DEMO_FREE_TIER_REPEAT_ALLOW_SUBMIT=true' : null,
  ].filter((value): value is string => Boolean(value));

  if (missing.length > 0) {
    return {
      status: 'skip',
      artifactName: hostedRepeatSignupSkipArtifact,
      missing,
      skipMessage: `Hosted demo repeat sign-up fixture env is missing: ${missing.join(', ')}`,
      artifactBody: [
        'Hosted demo qa-repeat-signup run skipped.',
        `Missing guarded fixture env: ${missing.join(', ')}`,
        '',
        'Skip-before-mutate contract: no hosted /free?t= navigation or request was attempted.',
        'Repeat submissions require a disposable hosted fixture email plus DEMO_FREE_TIER_REPEAT_ALLOW_SUBMIT=true to avoid unintended outbound email sends.',
        'Local faithful demo stand-in covers /free?t= first submission, same-browser repeat submission, cleared-cookie repeat submission, and same-email reuse from a fresh context.',
      ].join('\n'),
    };
  }

  return {
    status: 'ready',
    baseUrl: baseUrl!,
    code: code!,
    fixtureEmail: fixtureEmail!,
  };
}
