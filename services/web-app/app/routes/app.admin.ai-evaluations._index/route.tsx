import {
  data as dataResponse,
  type LoaderFunctionArgs,
  useLoaderData,
} from 'react-router';
import { useMemo, useState } from 'react';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { Badge } from '~/components/ui/badge';
import { requireAdmin } from '~/utils/auth.server';
import { cn } from '~/utils/misc';
import {
  isBenchmarkCaseApproved,
  type GradingBenchmarkCase,
  type GradingEvaluationDefinition,
} from '~/domain/ai-evaluation/grading-benchmark';
import { gradingAssistantBenchmarkV1 } from '~/domain/ai-evaluation/grading-assistant-benchmark.v1';

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);

  const suite = gradingAssistantBenchmarkV1;
  const draftCaseCount = suite.cases.filter(
    (benchmarkCase) => benchmarkCase.approval.status === 'draft'
  ).length;
  const approvedCaseCount = suite.cases.filter(isBenchmarkCaseApproved).length;

  return dataResponse({
    suite,
    draftCaseCount,
    approvedCaseCount,
    releaseBlocked: approvedCaseCount < suite.cases.length,
  });
}

const METHOD_LABELS: Record<GradingEvaluationDefinition['method'], string> = {
  code: 'Deterministic code check',
  human_or_llm_judge: 'Human or LLM judge',
  cross_case: 'Cross-case comparison',
};

const PROVENANCE_LABELS: Record<
  GradingBenchmarkCase['provenance']['kind'],
  string
> = {
  synthetic: 'Synthetic',
  deidentified_production: 'Deidentified production',
};

const APPROVAL_LABELS: Record<
  GradingBenchmarkCase['approval']['status'],
  string
> = {
  draft: 'Draft',
  approved: 'Approved',
  retired: 'Retired',
};

const FLOW_STEPS = [
  {
    title: 'Case input',
    description:
      'A synthetic essay, strictness level, and student first name are given to the grading assistant.',
  },
  {
    title: 'Model output',
    description:
      'The assistant returns a score and comment for every rubric category plus a personalized overall comment.',
  },
  {
    title: 'Deterministic checks',
    description:
      'Code evaluators verify the response contract and confirm every score falls inside its case-defined expected band.',
  },
  {
    title: 'Qualitative review',
    description:
      'A human or LLM judge checks feedback grounding, rubric alignment, tone, and safety criteria against each requirement.',
  },
  {
    title: 'Release decision',
    description:
      'A case only counts toward a release once product and educator approvals match its current fingerprint.',
  },
];

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
  minScore,
  maxScore,
}: {
  categoryKey: string;
  min: number;
  max: number;
  minScore: number;
  maxScore: number;
}) {
  const span = maxScore - minScore + 1;
  const segments = Array.from({ length: span }, (_, index) => minScore + index);

  return (
    <div data-testid={`score-band-${categoryKey}`} className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <dt className="truncate text-sm font-medium text-foreground">
          {categoryKey.replaceAll('_', ' ')}
        </dt>
        <dd className="shrink-0 text-sm tabular-nums text-muted-foreground">
          {min}–{max}
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
              segment >= min && segment <= max ? 'bg-primary' : 'bg-muted'
            )}
          />
        ))}
      </div>
    </div>
  );
}

export default function AdminAiEvaluationsRoute() {
  const { suite, draftCaseCount, approvedCaseCount, releaseBlocked } =
    useLoaderData<typeof loader>();

  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState('all');
  const [strictnessFilter, setStrictnessFilter] = useState('all');
  const [selectedCaseId, setSelectedCaseId] = useState(
    suite.cases[0]?.id ?? null
  );

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

  const evaluationsById = useMemo(() => {
    return new Map(
      suite.evaluations.map((evaluation) => [evaluation.id, evaluation])
    );
  }, [suite.evaluations]);

  return (
    <div className="flex flex-col gap-6 p-3 sm:p-5">
      <div>
        <h2 className="text-2xl font-semibold">Benchmark review</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Read-only review of the {suite.title} (v{suite.version}) corpus.
        </p>
      </div>

      <div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-gray-950/5 pt-4 sm:grid-cols-4 dark:border-white/10">
          <div className="pr-4 [&:not(:nth-child(2n+1))]:border-l [&:not(:nth-child(2n+1))]:pl-4 sm:[&:not(:nth-child(4n+1))]:border-l sm:[&:not(:nth-child(4n+1))]:pl-4 border-gray-950/5 dark:border-white/10">
            <dt className="truncate text-sm text-muted-foreground">
              Draft cases
            </dt>
            <dd
              data-testid="stat-draft-cases"
              className="mt-1 text-2xl font-semibold tabular-nums"
            >
              {draftCaseCount}
            </dd>
          </div>
          <div className="border-l border-gray-950/5 pl-4 dark:border-white/10">
            <dt className="truncate text-sm text-muted-foreground">
              Evaluation definitions
            </dt>
            <dd
              data-testid="stat-evaluation-definitions"
              className="mt-1 text-2xl font-semibold tabular-nums"
            >
              {suite.evaluations.length}
            </dd>
          </div>
          <div className="border-l border-gray-950/5 pl-4 dark:border-white/10">
            <dt className="truncate text-sm text-muted-foreground">Approved</dt>
            <dd
              data-testid="stat-approved-cases"
              className="mt-1 text-2xl font-semibold tabular-nums"
            >
              {approvedCaseCount}
            </dd>
          </div>
          <div className="border-l border-gray-950/5 pl-4 dark:border-white/10">
            <dt className="truncate text-sm text-muted-foreground">
              Release status
            </dt>
            <dd
              data-testid="stat-release-status"
              className="mt-1 text-2xl font-semibold"
            >
              {releaseBlocked ? 'Blocked' : 'Ready'}
            </dd>
          </div>
        </dl>
      </div>

      <section aria-labelledby="evaluation-flow-heading">
        <h2 id="evaluation-flow-heading" className="text-base font-semibold">
          How a case becomes a release
        </h2>
        <ol
          data-testid="evaluation-flow"
          role="list"
          className="mt-3 grid gap-4 sm:grid-cols-5"
        >
          {FLOW_STEPS.map((step, index) => (
            <li
              key={step.title}
              className={cn(
                'pt-3 sm:pt-0',
                index === 0
                  ? 'border-t-0 sm:border-l-0 sm:pl-0'
                  : 'border-t border-gray-950/5 sm:border-t-0 sm:border-l sm:pl-4 dark:border-white/10'
              )}
            >
              <span className="text-xs font-medium text-muted-foreground">
                Step {index + 1}
              </span>
              <p className="mt-0.5 text-sm font-semibold text-foreground">
                {step.title}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {step.description}
              </p>
            </li>
          ))}
        </ol>
      </section>

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
              <svg
                viewBox="0 0 8 5"
                width="8"
                height="5"
                fill="none"
                className="pointer-events-none col-start-2 row-start-1 place-self-center"
              >
                <path d="M.5.5 4 4 7.5.5" stroke="currentcolor" />
              </svg>
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
              <svg
                viewBox="0 0 8 5"
                width="8"
                height="5"
                fill="none"
                className="pointer-events-none col-start-2 row-start-1 place-self-center"
              >
                <path d="M.5.5 4 4 7.5.5" stroke="currentcolor" />
              </svg>
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
                return (
                  <li key={benchmarkCase.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedCaseId(benchmarkCase.id)}
                      aria-pressed={isSelected}
                      className={cn(
                        'flex w-full min-w-0 flex-col gap-1 px-3 py-2.5 text-left transition-colors hover:bg-muted/50',
                        isSelected && 'bg-muted text-foreground'
                      )}
                    >
                      <span className="truncate text-sm font-medium">
                        {benchmarkCase.title}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {benchmarkCase.input.strictness} ·{' '}
                        {APPROVAL_LABELS[benchmarkCase.approval.status]}
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

              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
                <div>
                  <dt className="font-medium text-foreground">Strictness</dt>
                  <dd className="text-muted-foreground">
                    {selectedCase.input.strictness}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground">Approval</dt>
                  <dd
                    data-testid="case-approval-status"
                    className="text-muted-foreground"
                  >
                    {APPROVAL_LABELS[selectedCase.approval.status]}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground">Provenance</dt>
                  <dd className="text-muted-foreground">
                    {PROVENANCE_LABELS[selectedCase.provenance.kind]}
                  </dd>
                </div>
              </dl>

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
                    return (
                      <ScoreBand
                        key={categoryKey}
                        categoryKey={categoryKey}
                        min={band.min}
                        max={band.max}
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
