import { describe, expect, test } from 'bun:test';
import {
  assertLiveRunAllowed,
  buildLiveErrorLine,
  buildLiveResultLine,
  buildRunManifest,
  filterPendingRequests,
  loadAnthropicSdkForEval,
  parseRunnerArgs,
  requestToJsonLine,
  resultKeysFromJsonl,
} from './live-runner';
import {
  buildFixtureConversation,
  buildStrategyRequests,
} from './context-strategies';

describe('AI context eval live runner guardrails', () => {
  test('defaults to dry-run mode', () => {
    const options = parseRunnerArgs([]);

    expect(options.live).toBe(false);
    expect(options.outputDir).toBe('.worktree-local/ai-context-evals/runs');
    expect(options.model).toBe('claude-sonnet-4-6');
    expect(options.requestTimeoutMs).toBe(45_000);
    expect(options.requestConcurrency).toBe(1);
    expect(options.resumeRunDir).toBe(null);
  });

  test('parses request timeout override', () => {
    const options = parseRunnerArgs([
      '--request-timeout-ms=12000',
      '--concurrency=4',
      '--resume-run-dir=.worktree-local/ai-context-evals/runs/example',
    ]);

    expect(options.requestTimeoutMs).toBe(12_000);
    expect(options.requestConcurrency).toBe(4);
    expect(options.resumeRunDir).toBe(
      '.worktree-local/ai-context-evals/runs/example'
    );
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
    expect(manifest.requestConcurrency).toBe(1);
  });

  test('loads Anthropic SDK through an installed workspace dependency', async () => {
    const Anthropic = await loadAnthropicSdkForEval();

    expect(typeof Anthropic).toBe('function');
  });

  test('serializes live result and error lines for incremental JSONL writes', () => {
    expect(
      JSON.parse(
        buildLiveResultLine({
          strategyId: 'full-document-each-turn',
          evalCaseId: 'case-1',
          turnIndex: 0,
          response: 'Looks good.',
          usage: { input_tokens: 10, output_tokens: 2 },
        })
      )
    ).toMatchObject({
      status: 'ok',
      strategyId: 'full-document-each-turn',
      usage: { input_tokens: 10, output_tokens: 2 },
    });

    expect(
      JSON.parse(
        buildLiveErrorLine({
          strategyId: 'delta-since-last-turn',
          evalCaseId: 'case-2',
          turnIndex: 1,
          error: new Error('timeout'),
        })
      )
    ).toMatchObject({
      status: 'error',
      strategyId: 'delta-since-last-turn',
      error: 'timeout',
    });
  });

  test('filters already recorded requests when resuming a live run', () => {
    const fixture = buildFixtureConversation({
      documentDomainId: 'school-lunch-argument',
      scenarioId: 'specific-detail-question',
      documentWordCount: 100,
    });
    const requests = buildStrategyRequests({
      evalCase: fixture,
      strategyId: 'full-document-each-turn',
    });
    const completedKeys = resultKeysFromJsonl(
      `${buildLiveResultLine({
        strategyId: requests[0]!.strategyId,
        evalCaseId: requests[0]!.evalCaseId,
        turnIndex: requests[0]!.turnIndex,
        response: 'Looks good.',
        usage: { input_tokens: 10, output_tokens: 2 },
      })}\n`
    );

    expect(filterPendingRequests({ requests, completedKeys })).toEqual(
      requests.slice(1)
    );
  });

  test('serializes document domain and tiny-change trap metadata in planned requests', () => {
    const fixture = buildFixtureConversation({
      documentDomainId: 'ap-history-dbq',
      scenarioId: 'specific-detail-question',
      documentWordCount: 100,
    });
    const request = buildStrategyRequests({
      evalCase: fixture,
      strategyId: 'full-document-each-turn',
    })[2]!;
    const row = JSON.parse(requestToJsonLine(request));

    expect(row).toMatchObject({
      strategyId: 'full-document-each-turn',
      evalCaseId: 'ap-history-dbq__specific-detail-question-100',
      documentDomainId: 'ap-history-dbq',
      scenarioId: 'specific-detail-question',
      documentWordCount: 100,
      trapTypes: ['changed-date'],
    });
  });
});
