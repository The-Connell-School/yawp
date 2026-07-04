import { describe, expect, test } from 'bun:test';
import {
  assertLiveRunAllowed,
  buildRunManifest,
  parseRunnerArgs,
} from './live-runner';

describe('AI context eval live runner guardrails', () => {
  test('defaults to dry-run mode', () => {
    const options = parseRunnerArgs([]);

    expect(options.live).toBe(false);
    expect(options.outputDir).toBe('.worktree-local/ai-context-evals/runs');
    expect(options.model).toBe('claude-sonnet-4-6');
  });

  test('rejects live mode without an Anthropic key', () => {
    const options = parseRunnerArgs(['--live']);

    expect(() =>
      assertLiveRunAllowed({ ...options, anthropicApiKey: '' })
    ).toThrow(/ANTHROPIC_API_KEY/);
  });

  test('requires an explicit live flag before allowing API calls', () => {
    const options = parseRunnerArgs([]);

    expect(() =>
      assertLiveRunAllowed({ ...options, anthropicApiKey: 'sk-ant-test' })
    ).toThrow(/--live/);
  });

  test('builds a manifest that records no live calls for dry runs', () => {
    const manifest = buildRunManifest({
      options: parseRunnerArgs(['--limit-cases=2']),
      caseCount: 2,
      strategyCount: 4,
    });

    expect(manifest.live).toBe(false);
    expect(manifest.liveApiCallsAllowed).toBe(false);
    expect(manifest.caseCount).toBe(2);
    expect(manifest.strategyCount).toBe(4);
  });
});
