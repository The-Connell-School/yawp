import {
  data as dataResponse,
  type LoaderFunctionArgs,
  useLoaderData,
} from 'react-router';
import { useCallback, useMemo, useState } from 'react';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { requireAdmin } from '~/utils/auth.server';
import { cn } from '~/utils/misc';
import {
  type GradingBenchmarkCase,
  type GradingEvaluationDefinition,
  type GradingBenchmarkResult,
} from '~/domain/ai-evaluation/grading-benchmark';
import { gradingAssistantBenchmarkV1 } from '~/domain/ai-evaluation/grading-assistant-benchmark.v1';

type CaseRunResult = GradingBenchmarkResult['cases'][number];

type RunSummary = GradingBenchmarkResult['summary'];

const STATIC_ASSISTANTS = [
  {
    id: gradingAssistantBenchmarkV1.id,
    label: 'Thesis-Driven Essay (static)',
    suite: gradingAssistantBenchmarkV1,
  },
] as const;

const METHOD_LABELS: Record<GradingEvaluationDefinition['method'], string> = {
  code: 'Deterministic code check',
  human_or_llm_judge: 'Human or LLM judge',
  cross_case: 'Cross-case comparison',
};

const STATUS_LABELS: Record<CaseRunResult['status'], string> = {
  pass: 'Pass',
  fail: 'Fail',
  needs_review: 'Review',
  blocked: 'Blocked',
};

const STATUS_VARIANT: Record<
  CaseRunResult['status'],
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  pass: 'default',
  fail: 'destructive',
  needs_review: 'secondary',
  blocked: 'outline',
};

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);

  const suite = gradingAssistantBenchmarkV1;

  return dataResponse({
    assistant: STATIC_ASSISTANTS[0],
    suite,
    totalCases: suite.cases.length,
    evaluationCount: suite.evaluations.length,
  });
}

function matchesSearch(benchmarkCase: GradingBenchmarkCase, search: string) {
  if (!search) return true;
  const haystack = [
    benchmarkCase.id,
    benchmarkCase.title,
    benchmarkCase.description,
    ...benchmarkCase.tags,
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(search.toLowerCase());
}

function ScoreBand({
  categoryKey,
  min,
  max,
  actual,
  minScore,
  maxScore,
}: {
  categoryKey: string;
  min: number;
  max: number;
  actual?: number;
  minScore: number;
  maxScore: number;
}) {
  const span = maxScore - minScore + 1;
  const segments = Array.from({ length: span }, (_, index) => minScore + index);
  const inBand =
    actual !== undefined && actual >= min && actual <= max ? actual : null;

  return (
    <div data-testid={`score-band-${categoryKey}`} className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <dt className="truncate text-sm font-medium text-foreground">
          {categoryKey.replaceAll('_', ' ')}
        </dt>
        <dd className="shrink-0 text-sm tabular-nums text-muted-foreground">
          {actual !== undefined ? (
            <span className={cn(!inBand && 'text-destructive font-medium')}>
              {actual} · expected {min}–{max}
            </span>
          ) : (
            <span>
              {min}–{max}
            </span>
          )}
        </dd>
      </div>
      <div
        className="mt-1.5 grid grid-cols-5 gap-1"
        role="img"
        aria-label={`Expected score band ${min} to ${max} out of ${minScore} to ${maxScore}`}
      >
        {segments.map((segment) => (
          <div
            key={segment}
            className={cn(
              'h-2 rounded-full',
              segment >= min && segment <= max
                ? actual === segment
                  ? 'bg-primary ring-2 ring-primary/40'
                  : 'bg-primary/70'
                : actual === segment
                  ? 'bg-destructive'
                  : 'bg-muted'
            )}
          />
        ))}
      </div>
    </div>
  );
}

function CaseStatusIcon({
  status,
  running,
}: {
  status?: CaseRunResult['status'];
  running?: boolean;
}) {
  if (running) return <span aria-hidden>⟳</span>;
  if (!status) return <span aria-hidden className="text-muted-foreground">·</span>;
  if (status === 'pass') return <span aria-hidden>✓</span>;
  if (status === 'fail') return <span aria-hidden>✗</span>;
  if (status === 'needs_review') return <span aria-hidden>⚠</span>;
  return <span aria-hidden>⊘</span>;
}

export default function AdminAiEvaluationsRoute() {
  const { assistant, suite, totalCases, evaluationCount } =
    useLoaderData<typeof loader>();

  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState('all');
  const [strictnessFilter, setStrictnessFilter] = useState('all');
  const [selectedCaseId, setSelectedCaseId] = useState(
    suite.cases[0]?.id ?? null
  );
  const [caseResults, setCaseResults] = useState<Record<string, CaseRunResult>>(
    {}
  );
  const [runningCaseId, setRunningCaseId] = useState<string | null>(null);
  const [isRunningAll, setIsRunningAll] = useState(false);
  const [runProgress, setRunProgress] = useState({ completed: 0, total: 0 });
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    for (const benchmarkCase of suite.cases) {
      for (const tag of benchmarkCase.tags) tags.add(tag);
    }
    return Array.from(tags).sort();
  }, [suite.cases]);

  const filteredCases = useMemo(() => {
    return suite.cases.filter((benchmarkCase) => {
      if (tagFilter !== 'all' && !benchmarkCase.tags.includes(tagFilter)) {
        return false;
      }
      if (
        strictnessFilter !== 'all' &&
        benchmarkCase.input.strictness !== strictnessFilter
      ) {
        return false;
      }
      return matchesSearch(benchmarkCase, search);
    });
  }, [suite.cases, search, tagFilter, strictnessFilter]);

  const selectedCase =
    filteredCases.find(
      (benchmarkCase) => benchmarkCase.id === selectedCaseId
    ) ??
    filteredCases[0] ??
    null;

  const selectedResult = selectedCase ? caseResults[selectedCase.id] : null;

  const evaluationsById = useMemo(() => {
    return new Map(
      suite.evaluations.map((evaluation) => [evaluation.id, evaluation])
    );
  }, [suite.evaluations]);

  const summary = useMemo<RunSummary>(() => {
    const results = Object.values(caseResults);
    return {
      total: results.length,
      passed: results.filter((item) => item.status === 'pass').length,
      failed: results.filter((item) => item.status === 'fail').length,
      needsReview: results.filter((item) => item.status === 'needs_review')
        .length,
      blocked: results.filter((item) => item.status === 'blocked').length,
    };
  }, [caseResults]);

  const runCase = useCallback(async (caseId: string) => {
    const formData = new FormData();
    formData.set('intent', 'runCase');
    formData.set('caseId', caseId);

    const response = await fetch('/api/domain/grading-assistant-benchmark', {
      method: 'POST',
      body: formData,
    });
    const payload = (await response.json()) as {
      success: boolean;
      message?: string;
      caseResult?: CaseRunResult;
    };

    if (!response.ok || !payload.success || !payload.caseResult) {
      throw new Error(payload.message ?? 'The benchmark case could not run.');
    }

    return payload.caseResult;
  }, []);

  const handleRunCase = useCallback(
    async (caseId: string) => {
      setRunError(null);
      setRunningCaseId(caseId);
      try {
        const caseResult = await runCase(caseId);
        setCaseResults((current) => ({ ...current, [caseId]: caseResult }));
        setLastRunAt(new Date().toISOString());
      } catch (error) {
        setRunError(
          error instanceof Error
            ? error.message
            : 'The benchmark case could not run.'
        );
      } finally {
        setRunningCaseId(null);
      }
    },
    [runCase]
  );

  const handleRunAll = useCallback(async () => {
    setRunError(null);
    setIsRunningAll(true);
    setRunProgress({ completed: 0, total: suite.cases.length });

    try {
      for (const [index, benchmarkCase] of suite.cases.entries()) {
        setRunningCaseId(benchmarkCase.id);
        const caseResult = await runCase(benchmarkCase.id);
        setCaseResults((current) => ({
          ...current,
          [benchmarkCase.id]: caseResult,
        }));
        setRunProgress({ completed: index + 1, total: suite.cases.length });
      }
      setLastRunAt(new Date().toISOString());
    } catch (error) {
      setRunError(
        error instanceof Error ? error.message : 'The benchmark could not run.'
      );
    } finally {
      setRunningCaseId(null);
      setIsRunningAll(false);
    }
  }, [runCase, suite.cases]);

  const isRunning = isRunningAll || runningCaseId !== null;

  return (
    <div className="flex flex-col gap-6 p-3 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Grading Evals</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Run live AI checks against the static {assistant.label} benchmark.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="assistant-select" className="sr-only">
            Grading assistant
          </label>
          <select
            id="assistant-select"
            value={assistant.id}
            disabled
            className="h-10 rounded-md border border-input bg-input-background px-3 text-sm"
          >
            <option value={assistant.id}>{assistant.label}</option>
          </select>
          <Button
            type="button"
            data-testid="run-all-cases"
            disabled={isRunning}
            onClick={() => void handleRunAll()}
          >
            {isRunningAll
              ? `Running ${runProgress.completed}/${runProgress.total}`
              : 'Run all cases'}
          </Button>
        </div>
      </div>

      {runError ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {runError}
        </p>
      ) : null}

      <div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-gray-950/5 pt-4 sm:grid-cols-4 dark:border-white/10">
          <div className="pr-4 [&:not(:nth-child(2n+1))]:border-l [&:not(:nth-child(2n+1))]:pl-4 sm:[&:not(:nth-child(4n+1))]:border-l sm:[&:not(:nth-child(4n+1))]:pl-4 border-gray-950/5 dark:border-white/10">
            <dt className="truncate text-sm text-muted-foreground">Cases</dt>
            <dd
              data-testid="stat-total-cases"
              className="mt-1 text-2xl font-semibold tabular-nums"
            >
              {totalCases}
            </dd>
          </div>
          <div className="border-l border-gray-950/5 pl-4 dark:border-white/10">
            <dt className="truncate text-sm text-muted-foreground">Checks</dt>
            <dd
              data-testid="stat-evaluation-definitions"
              className="mt-1 text-2xl font-semibold tabular-nums"
            >
              {evaluationCount}
            </dd>
          </div>
          <div className="border-l border-gray-950/5 pl-4 dark:border-white/10">
            <dt className="truncate text-sm text-muted-foreground">Pass</dt>
            <dd
              data-testid="stat-pass-count"
              className="mt-1 text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400"
            >
              {summary.passed}
            </dd>
          </div>
          <div className="border-l border-gray-950/5 pl-4 dark:border-white/10">
            <dt className="truncate text-sm text-muted-foreground">Fail</dt>
            <dd
              data-testid="stat-fail-count"
              className="mt-1 text-2xl font-semibold tabular-nums text-destructive"
            >
              {summary.failed}
            </dd>
          </div>
        </dl>
        <p className="mt-2 text-sm text-muted-foreground">
          {lastRunAt
            ? `Last run ${new Date(lastRunAt).toLocaleString()}.`
            : 'No runs yet. Hit Run all cases to grade every essay with live AI.'}
        </p>
      </div>

      <section
        aria-labelledby="case-explorer-heading"
        className="grid gap-4 lg:grid-cols-[320px_1fr]"
      >
        <h2 id="case-explorer-heading" className="sr-only">
          Case explorer
        </h2>

        <div className="flex min-w-0 flex-col gap-3">
          <div>
            <label htmlFor="case-search" className="sr-only">
              Search cases
            </label>
            <input
              id="case-search"
              name="search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search title, description, or tag"
              className="h-10 w-full rounded-md border border-input bg-input-background px-3 text-base ring-0 placeholder:text-muted-foreground focus:outline-none focus:-outline-offset-1 focus:outline-2 focus:outline-ring sm:text-sm"
            />
          </div>

          <div className="flex gap-2">
            <div className="inline-grid flex-1 grid-cols-[1fr_2rem]">
              <label htmlFor="tag-filter" className="sr-only">
                Filter by tag
              </label>
              <select
                id="tag-filter"
                name="tag"
                value={tagFilter}
                onChange={(event) => setTagFilter(event.target.value)}
                className="col-span-full row-start-1 h-10 appearance-none rounded-md border border-input bg-input-background pr-8 pl-3 text-base focus:outline-none focus:-outline-offset-1 focus:outline-2 focus:outline-ring sm:text-sm"
              >
                <option value="all">All tags</option>
                {allTags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            </div>

            <div className="inline-grid flex-1 grid-cols-[1fr_2rem]">
              <label htmlFor="strictness-filter" className="sr-only">
                Filter by strictness
              </label>
              <select
                id="strictness-filter"
                name="strictness"
                value={strictnessFilter}
                onChange={(event) => setStrictnessFilter(event.target.value)}
                className="col-span-full row-start-1 h-10 appearance-none rounded-md border border-input bg-input-background pr-8 pl-3 text-base focus:outline-none focus:-outline-offset-1 focus:outline-2 focus:outline-ring sm:text-sm"
              >
                <option value="all">All strictness</option>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </div>
          </div>

          <p
            data-testid="case-list-count"
            className="text-sm text-muted-foreground"
          >
            {filteredCases.length} of {suite.cases.length} cases
          </p>

          <ul
            role="list"
            className="flex max-h-[32rem] flex-col divide-y divide-gray-950/5 overflow-y-auto rounded-lg border dark:divide-white/10"
          >
            {filteredCases.length === 0 ? (
              <li className="px-3 py-4 text-sm text-muted-foreground">
                No cases match the current filters.
              </li>
            ) : (
              filteredCases.map((benchmarkCase) => {
                const isSelected = benchmarkCase.id === selectedCase?.id;
                const result = caseResults[benchmarkCase.id];
                const caseRunning = runningCaseId === benchmarkCase.id;
                return (
                  <li key={benchmarkCase.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedCaseId(benchmarkCase.id)}
                      aria-pressed={isSelected}
                      className={cn(
                        'flex w-full min-w-0 items-start gap-2 px-3 py-2.5 text-left transition-colors hover:bg-muted/50',
                        isSelected && 'bg-muted text-foreground'
                      )}
                    >
                      <span className="mt-0.5 w-4 shrink-0 text-sm">
                        <CaseStatusIcon
                          status={result?.status}
                          running={caseRunning}
                        />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {benchmarkCase.title}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {benchmarkCase.input.strictness}
                          {result ? ` · ${STATUS_LABELS[result.status]}` : ''}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>

        <div className="min-w-0">
          {selectedCase ? (
            <div data-testid="case-detail" className="flex flex-col gap-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold">{selectedCase.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {selectedCase.description}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {selectedCase.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" size="sm">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  data-testid="run-selected-case"
                  disabled={isRunning}
                  onClick={() => void handleRunCase(selectedCase.id)}
                >
                  {runningCaseId === selectedCase.id
                    ? 'Running…'
                    : 'Run this case'}
                </Button>
              </div>

              {selectedResult ? (
                <div
                  data-testid="case-run-result"
                  className="rounded-lg border px-4 py-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={STATUS_VARIANT[selectedResult.status]}>
                      {STATUS_LABELS[selectedResult.status]}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {selectedResult.evaluations.length} checks evaluated
                    </span>
                  </div>
                  <ul role="list" className="mt-3 flex flex-col gap-2">
                    {selectedResult.evaluations.map((evaluation) => (
                      <li
                        key={`${evaluation.evaluatorId}-${evaluation.criterionId ?? 'core'}`}
                        className="rounded-md bg-muted/40 px-3 py-2 text-sm"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">
                            {evaluationsById.get(evaluation.evaluatorId)
                              ?.title ?? evaluation.evaluatorId}
                          </span>
                          <Badge
                            variant={
                              evaluation.status === 'pass'
                                ? 'default'
                                : evaluation.status === 'fail'
                                  ? 'destructive'
                                  : 'secondary'
                            }
                            size="sm"
                          >
                            {STATUS_LABELS[evaluation.status]}
                          </Badge>
                        </div>
                        <p className="mt-1 text-muted-foreground">
                          {evaluation.evidence ?? evaluation.message}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div>
                <h4 className="text-sm font-semibold">Essay</h4>
                <p
                  data-testid="case-essay-text"
                  className="mt-1.5 rounded-md bg-muted/40 px-3 py-2.5 text-sm leading-6 whitespace-pre-wrap"
                >
                  {selectedCase.input.essayText}
                </p>
              </div>

              <div>
                <h4 className="text-sm font-semibold">Score bands</h4>
                <dl className="mt-2 grid gap-3 sm:grid-cols-2">
                  {suite.rubric.categoryKeys.map((categoryKey) => {
                    const band =
                      selectedCase.expectations.scoreBands[categoryKey];
                    if (!band) return null;
                    const actual = selectedResult?.output?.categories.find(
                      (category) => category.key === categoryKey
                    )?.score;
                    return (
                      <ScoreBand
                        key={categoryKey}
                        categoryKey={categoryKey}
                        min={band.min}
                        max={band.max}
                        actual={actual}
                        minScore={suite.rubric.minScore}
                        maxScore={suite.rubric.maxScore}
                      />
                    );
                  })}
                </dl>
              </div>

              <div>
                <h4 className="text-sm font-semibold">
                  Qualitative requirements
                </h4>
                <ul
                  data-testid="qualitative-requirements"
                  role="list"
                  className="mt-2 flex flex-col divide-y divide-gray-950/5 dark:divide-white/10"
                >
                  {selectedCase.expectations.qualitative.map((requirement) => {
                    const evaluation = evaluationsById.get(
                      requirement.evaluatorId
                    );
                    return (
                      <li key={requirement.id} className="py-2.5 first:pt-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-foreground">
                            {evaluation?.title ?? requirement.evaluatorId}
                          </span>
                          {evaluation ? (
                            <Badge variant="outline" size="sm">
                              {METHOD_LABELS[evaluation.method]}
                            </Badge>
                          ) : null}
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {requirement.requirement}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No case selected.</p>
          )}
        </div>
      </section>
    </div>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
