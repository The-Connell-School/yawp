#!/usr/bin/env bun

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'fs';
import { createRequire } from 'module';
import { join } from 'path';
import {
  DEFAULT_STRATEGIES,
  buildEvalMatrix,
  buildStrategyRequests,
  type PlannedTutorRequest,
} from './context-strategies';
import { CLAUDE_PRICING, estimateStrategyCost, formatUsd } from './cost';

export type RunnerOptions = {
  live: boolean;
  model: string;
  outputDir: string;
  envFile: string;
  limitCases: number | null;
  anthropicApiKey: string;
  requestTimeoutMs: number;
  requestConcurrency: number;
  resumeRunDir: string | null;
};

type AnthropicClient = {
  messages: {
    create: (input: {
      model: string;
      max_tokens: number;
      temperature: number;
      system: string;
      messages: PlannedTutorRequest['messages'];
    }) => Promise<{
      content: Array<{ type: string; text?: string }>;
      usage: unknown;
    }>;
  };
};

type AnthropicConstructor = new (config: {
  apiKey: string;
  timeout?: number;
  maxRetries?: number;
}) => AnthropicClient;

type LiveResult = {
  strategyId: string;
  evalCaseId: string;
  turnIndex: number;
  response: string;
  usage: unknown;
};

type LiveError = {
  strategyId: string;
  evalCaseId: string;
  turnIndex: number;
  error: unknown;
};

export async function loadAnthropicSdkForEval(): Promise<AnthropicConstructor> {
  const requireFromWebAppWorkspace = createRequire(
    new URL('../../services/web-app/package.json', import.meta.url)
  );
  const sdk = requireFromWebAppWorkspace('@anthropic-ai/sdk') as {
    default?: AnthropicConstructor;
  } & AnthropicConstructor;
  return sdk.default ?? sdk;
}

export function parseRunnerArgs(args: string[]): RunnerOptions {
  const options: RunnerOptions = {
    live: false,
    model: process.env.AI_MODEL || 'claude-sonnet-4-6',
    outputDir: '.worktree-local/ai-context-evals/runs',
    envFile: '.worktree-local/ai-context-evals.env',
    limitCases: null,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    requestTimeoutMs: 45_000,
    requestConcurrency: 1,
    resumeRunDir: null,
  };

  for (const arg of args) {
    if (arg === '--live') {
      options.live = true;
    } else if (arg.startsWith('--model=')) {
      options.model = arg.slice('--model='.length);
    } else if (arg.startsWith('--output-dir=')) {
      options.outputDir = arg.slice('--output-dir='.length);
    } else if (arg.startsWith('--env-file=')) {
      options.envFile = arg.slice('--env-file='.length);
    } else if (arg.startsWith('--limit-cases=')) {
      const parsed = Number(arg.slice('--limit-cases='.length));
      options.limitCases = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    } else if (arg.startsWith('--request-timeout-ms=')) {
      const parsed = Number(arg.slice('--request-timeout-ms='.length));
      if (Number.isFinite(parsed) && parsed > 0) {
        options.requestTimeoutMs = parsed;
      }
    } else if (arg.startsWith('--concurrency=')) {
      const parsed = Number(arg.slice('--concurrency='.length));
      if (Number.isInteger(parsed) && parsed > 0) {
        options.requestConcurrency = parsed;
      }
    } else if (arg.startsWith('--resume-run-dir=')) {
      const value = arg.slice('--resume-run-dir='.length).trim();
      options.resumeRunDir = value || null;
    }
  }

  return options;
}

function parseEnvFileValue(raw: string) {
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed.replace(/\\ /g, ' ');
}

function loadLocalEnvFile(options: RunnerOptions): RunnerOptions {
  if (!existsSync(options.envFile)) return options;

  const values = Object.fromEntries(
    readFileSync(options.envFile, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=');
        return [line.slice(0, index), parseEnvFileValue(line.slice(index + 1))];
      })
  );

  return {
    ...options,
    model: options.model || values.AI_MODEL || 'claude-sonnet-4-6',
    anthropicApiKey:
      options.anthropicApiKey || values.ANTHROPIC_API_KEY || '',
  };
}

export function assertLiveRunAllowed(options: RunnerOptions) {
  if (!options.live) {
    throw new Error('Live Anthropic calls require the explicit --live flag.');
  }
  if (!options.anthropicApiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY is required for live Anthropic eval runs.'
    );
  }
}

export function buildRunManifest({
  options,
  caseCount,
  strategyCount,
}: {
  options: RunnerOptions;
  caseCount: number;
  strategyCount: number;
}) {
  return {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    live: options.live,
    liveApiCallsAllowed: options.live && Boolean(options.anthropicApiKey),
    model: options.model,
    caseCount,
    strategyCount,
    outputDir: options.outputDir,
    requestTimeoutMs: options.requestTimeoutMs,
    requestConcurrency: options.requestConcurrency,
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function buildLiveResultLine(result: LiveResult) {
  return JSON.stringify({
    status: 'ok',
    ...result,
  });
}

export function buildLiveErrorLine(result: LiveError) {
  return JSON.stringify({
    status: 'error',
    strategyId: result.strategyId,
    evalCaseId: result.evalCaseId,
    turnIndex: result.turnIndex,
    error: errorMessage(result.error),
  });
}

function requestKey(row: {
  strategyId: string;
  evalCaseId: string;
  turnIndex: number;
}) {
  return `${row.strategyId}|${row.evalCaseId}|${row.turnIndex}`;
}

export function resultKeysFromJsonl(content: string) {
  return new Set(
    content
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const row = JSON.parse(line) as {
          strategyId: string;
          evalCaseId: string;
          turnIndex: number;
        };
        return requestKey(row);
      })
  );
}

export function filterPendingRequests({
  requests,
  completedKeys,
}: {
  requests: PlannedTutorRequest[];
  completedKeys: Set<string>;
}) {
  return requests.filter((request) => !completedKeys.has(requestKey(request)));
}

export function requestToJsonLine(request: PlannedTutorRequest) {
  return JSON.stringify({
    strategyId: request.strategyId,
    evalCaseId: request.evalCaseId,
    documentDomainId: request.documentDomainId,
    scenarioId: request.scenarioId,
    documentWordCount: request.documentWordCount,
    turnIndex: request.turnIndex,
    estimatedInputTokens: request.estimatedInputTokens,
    contextCoverage: request.contextCoverage,
    cachePlan: request.cachePlan ?? null,
    expectedBehavior: request.turn.expectedBehavior,
    mustUseAnchors: request.turn.mustUseAnchors,
    mustNotUseAnchors: request.turn.mustNotUseAnchors,
    trapTypes: request.turn.trapTypes,
    messages: request.messages,
  });
}

function buildDryRunSummary({
  requestsByStrategy,
  model,
}: {
  requestsByStrategy: Map<string, PlannedTutorRequest[]>;
  model: string;
}) {
  const pricing = CLAUDE_PRICING[model] ?? CLAUDE_PRICING['claude-sonnet-4-6'];
  const lines = [
    '# AI Context Eval Dry Run',
    '',
    `Model: ${model}`,
    `Strategies: ${[...requestsByStrategy.keys()].join(', ')}`,
    '',
    '| Strategy | Requests | Est. input tokens | Est. output tokens | Est. cost |',
    '| --- | ---: | ---: | ---: | ---: |',
  ];

  for (const [strategyId, requests] of requestsByStrategy) {
    const cost = estimateStrategyCost({
      requests,
      pricing,
      assumedOutputTokensPerTurn: 220,
    });
    lines.push(
      `| ${strategyId} | ${cost.requestCount} | ${cost.totalInputTokens} | ${cost.totalOutputTokens} | ${formatUsd(cost.totalUsd)} |`
    );
  }

  return lines.join('\n');
}

async function runLiveRequest({
  anthropic,
  model,
  request,
}: {
  anthropic: AnthropicClient;
  model: string;
  request: PlannedTutorRequest;
}) {
  const message = await anthropic.messages.create({
    model,
    max_tokens: 500,
    temperature: 0.2,
    system: request.system,
    messages: request.messages,
  });
  const textBlock = message.content.find((block) => block.type === 'text');
  return {
    strategyId: request.strategyId,
    evalCaseId: request.evalCaseId,
    turnIndex: request.turnIndex,
    response:
      textBlock && 'text' in textBlock ? (textBlock as { text: string }).text : '',
    usage: message.usage,
  };
}

async function main() {
  const options = loadLocalEnvFile(parseRunnerArgs(process.argv.slice(2)));
  const matrix = buildEvalMatrix();
  const cases = options.limitCases
    ? matrix.cases.slice(0, options.limitCases)
    : matrix.cases;
  const requestsByStrategy = new Map<string, PlannedTutorRequest[]>();

  for (const strategyId of DEFAULT_STRATEGIES) {
    requestsByStrategy.set(
      strategyId,
      cases.flatMap((evalCase) =>
        buildStrategyRequests({
          evalCase,
          strategyId,
        })
      )
    );
  }

  const allRequests = [...requestsByStrategy.values()].flat();
  const runDir =
    options.resumeRunDir ??
    join(options.outputDir, new Date().toISOString().replace(/[:.]/g, '-'));

  let pendingRequests = allRequests;
  if (options.resumeRunDir) {
    if (!existsSync(join(runDir, 'manifest.json'))) {
      throw new Error(`Cannot resume missing run manifest: ${runDir}`);
    }
    const liveResultsPath = join(runDir, 'live-results.jsonl');
    const completedKeys = existsSync(liveResultsPath)
      ? resultKeysFromJsonl(readFileSync(liveResultsPath, 'utf8'))
      : new Set<string>();
    pendingRequests = filterPendingRequests({
      requests: allRequests,
      completedKeys,
    });
    console.log(
      `Resuming ${runDir}. Skipping ${allRequests.length - pendingRequests.length}/${allRequests.length} recorded requests.`
    );
  } else {
    mkdirSync(runDir, { recursive: true });

    const manifest = buildRunManifest({
      options,
      caseCount: cases.length,
      strategyCount: DEFAULT_STRATEGIES.length,
    });
    writeFileSync(
      join(runDir, 'manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`
    );
    writeFileSync(
      join(runDir, 'planned-requests.jsonl'),
      `${allRequests.map(requestToJsonLine).join('\n')}\n`
    );
    writeFileSync(
      join(runDir, 'summary.md'),
      `${buildDryRunSummary({
        requestsByStrategy,
        model: options.model,
      })}\n`
    );
  }

  if (!options.live) {
    console.log(`Dry run only. Wrote ${runDir}`);
    if (options.resumeRunDir) {
      console.log(
        `Pending requests: ${pendingRequests.length}/${allRequests.length}`
      );
    }
    console.log('No Anthropic API calls were made.');
    return;
  }

  assertLiveRunAllowed(options);
  const Anthropic = await loadAnthropicSdkForEval();
  const anthropic = new Anthropic({
    apiKey: options.anthropicApiKey,
    timeout: options.requestTimeoutMs,
    maxRetries: 0,
  });
  const liveResultsPath = join(runDir, 'live-results.jsonl');
  if (!options.resumeRunDir) {
    writeFileSync(liveResultsPath, '');
  }
  let completed = 0;
  let failed = 0;
  let nextIndex = 0;

  async function runWorker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= pendingRequests.length) return;
      const request = pendingRequests[index]!;

      try {
        const result = await runLiveRequest({
          anthropic,
          model: options.model,
          request,
        });
        appendFileSync(liveResultsPath, `${buildLiveResultLine(result)}\n`);
        completed += 1;
        console.log(
          `[${completed + failed}/${pendingRequests.length}] ok ${request.strategyId} ${request.evalCaseId} turn ${request.turnIndex}`
        );
      } catch (error) {
        appendFileSync(
          liveResultsPath,
          `${buildLiveErrorLine({
            strategyId: request.strategyId,
            evalCaseId: request.evalCaseId,
            turnIndex: request.turnIndex,
            error,
          })}\n`
        );
        failed += 1;
        console.log(
          `[${completed + failed}/${pendingRequests.length}] error ${request.strategyId} ${request.evalCaseId} turn ${request.turnIndex}: ${errorMessage(error)}`
        );
      }
    }
  }

  const workerCount = Math.min(options.requestConcurrency, pendingRequests.length);
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  console.log(`Live run complete. ok=${completed} error=${failed} Wrote ${runDir}`);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
