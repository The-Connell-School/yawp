import { createHash } from 'node:crypto';

export type GradingStrictness = 'beginner' | 'intermediate' | 'advanced';

export type BenchmarkApprovalRole = 'product' | 'educator';

export type BenchmarkCaseApproval = {
  status: 'draft' | 'approved' | 'retired';
  requiredRoles: BenchmarkApprovalRole[];
  approvals: Array<{
    reviewer: string;
    role: BenchmarkApprovalRole;
    approvedAt: string;
    caseFingerprint: string;
  }>;
};

export type GradingEvaluationDefinition = {
  id: string;
  title: string;
  description: string;
  method: 'code' | 'human_or_llm_judge' | 'cross_case';
  blocking: boolean;
};

export type GradingBenchmarkCase = {
  id: string;
  title: string;
  description: string;
  tags: string[];
  comparisonGroupId?: string;
  input: {
    studentFirstName: string;
    essayText: string;
    strictness: GradingStrictness;
    /** The assignment prompt the student answered, when the case has one. */
    assignmentPrompt?: string;
  };
  expectations: {
    scoreBands: Record<string, { min: number; max: number }>;
    qualitative: Array<{
      id: string;
      evaluatorId: string;
      requirement: string;
    }>;
  };
  provenance: {
    kind: 'synthetic' | 'deidentified_production';
    source: string;
    notes: string;
  };
  approval: BenchmarkCaseApproval;
};

export type GradingBenchmarkSuite = {
  id: string;
  title: string;
  version: number;
  description: string;
  rubric: {
    categoryKeys: string[];
    minScore: number;
    maxScore: number;
  };
  evaluations: GradingEvaluationDefinition[];
  cases: GradingBenchmarkCase[];
};

export type GradingAssistantBenchmarkOutput = {
  categories: Array<{
    key: string;
    score: number;
    comment: string;
  }>;
  overallComment: string;
};

export type BenchmarkOutputReview = {
  status: 'pass' | 'fail';
  method: 'human' | 'llm_judge';
  reviewer: string;
  evidence: string;
};

export type BenchmarkEvaluationResult = {
  evaluatorId: string;
  criterionId?: string;
  status: 'pass' | 'fail' | 'needs_review' | 'blocked';
  message: string;
  evidence?: string;
  reviewer?: string;
  reviewMethod?: BenchmarkOutputReview['method'];
};

export type GradingBenchmarkResult = {
  suiteId: string;
  suiteVersion: number;
  mode: 'draft' | 'release';
  status: 'pass' | 'fail' | 'needs_review' | 'blocked';
  summary: {
    total: number;
    passed: number;
    failed: number;
    needsReview: number;
    blocked: number;
  };
  cases: Array<{
    caseId: string;
    status: 'pass' | 'fail' | 'needs_review' | 'blocked';
    output?: GradingAssistantBenchmarkOutput;
    evaluations: BenchmarkEvaluationResult[];
  }>;
};

export function benchmarkReviewKey(caseId: string, criterionId: string) {
  return `${caseId}::${criterionId}`;
}

export function benchmarkCaseFingerprint(benchmarkCase: GradingBenchmarkCase) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        id: benchmarkCase.id,
        title: benchmarkCase.title,
        description: benchmarkCase.description,
        tags: benchmarkCase.tags,
        comparisonGroupId: benchmarkCase.comparisonGroupId ?? null,
        input: benchmarkCase.input,
        expectations: benchmarkCase.expectations,
        provenance: benchmarkCase.provenance,
      })
    )
    .digest('hex');
}

export function isBenchmarkCaseApproved(benchmarkCase: GradingBenchmarkCase) {
  if (benchmarkCase.approval.status !== 'approved') return false;
  const currentFingerprint = benchmarkCaseFingerprint(benchmarkCase);

  return benchmarkCase.approval.requiredRoles.every((requiredRole) =>
    benchmarkCase.approval.approvals.some(
      (approval) =>
        approval.role === requiredRole &&
        approval.reviewer.trim().length > 0 &&
        approval.approvedAt.trim().length > 0 &&
        approval.caseFingerprint === currentFingerprint
    )
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseOutput(
  rawOutput: unknown,
  benchmarkCase: GradingBenchmarkCase,
  suite: GradingBenchmarkSuite
): {
  output: GradingAssistantBenchmarkOutput | null;
  errors: string[];
} {
  const errors: string[] = [];
  if (!isRecord(rawOutput)) {
    return { output: null, errors: ['Output must be an object.'] };
  }

  const rawCategories = rawOutput.categories;
  const rawOverallComment = rawOutput.overallComment;
  if (!Array.isArray(rawCategories)) {
    errors.push('categories must be an array.');
  }
  if (typeof rawOverallComment !== 'string' || !rawOverallComment.trim()) {
    errors.push('overallComment must be a non-empty string.');
  } else if (
    !rawOverallComment
      .trimStart()
      .startsWith(`${benchmarkCase.input.studentFirstName},`)
  ) {
    errors.push(
      `overallComment must begin with "${benchmarkCase.input.studentFirstName},".`
    );
  }

  if (!Array.isArray(rawCategories)) return { output: null, errors };

  const categories: GradingAssistantBenchmarkOutput['categories'] = [];
  for (const [index, rawCategory] of rawCategories.entries()) {
    if (!isRecord(rawCategory)) {
      errors.push(`categories[${index}] must be an object.`);
      continue;
    }

    const { key, score, comment } = rawCategory;
    if (typeof key !== 'string' || !key) {
      errors.push(`categories[${index}].key must be a non-empty string.`);
      continue;
    }
    if (
      typeof score !== 'number' ||
      !Number.isInteger(score) ||
      score < suite.rubric.minScore ||
      score > suite.rubric.maxScore
    ) {
      errors.push(
        `${key} score must be an integer from ${suite.rubric.minScore} to ${suite.rubric.maxScore}.`
      );
      continue;
    }
    if (typeof comment !== 'string' || !comment.trim()) {
      errors.push(`${key} comment must be a non-empty string.`);
      continue;
    }
    categories.push({ key, score, comment });
  }

  const actualKeys = categories.map((category) => category.key);
  const uniqueKeys = new Set(actualKeys);
  if (uniqueKeys.size !== actualKeys.length) {
    errors.push('Each rubric category key must appear exactly once.');
  }
  for (const expectedKey of suite.rubric.categoryKeys) {
    if (!uniqueKeys.has(expectedKey)) {
      errors.push(`Missing rubric category key: ${expectedKey}.`);
    }
  }
  for (const actualKey of uniqueKeys) {
    if (!suite.rubric.categoryKeys.includes(actualKey)) {
      errors.push(`Unexpected rubric category key: ${actualKey}.`);
    }
  }

  if (errors.length > 0 || typeof rawOverallComment !== 'string') {
    return { output: null, errors };
  }

  return {
    output: { categories, overallComment: rawOverallComment },
    errors,
  };
}

function evaluateScoreCalibration(
  benchmarkCase: GradingBenchmarkCase,
  output: GradingAssistantBenchmarkOutput | null
): BenchmarkEvaluationResult {
  if (!output) {
    return {
      evaluatorId: 'score-calibration',
      status: 'fail',
      message:
        'Score calibration cannot pass because the output contract failed.',
    };
  }

  const failures: string[] = [];
  for (const category of output.categories) {
    const band = benchmarkCase.expectations.scoreBands[category.key];
    if (!band) {
      failures.push(`${category.key} has no approved score band.`);
      continue;
    }
    if (category.score < band.min || category.score > band.max) {
      failures.push(
        `${category.key} scored ${category.score}; expected ${band.min}-${band.max}.`
      );
    }
  }

  return failures.length > 0
    ? {
        evaluatorId: 'score-calibration',
        status: 'fail',
        message: failures.join(' '),
      }
    : {
        evaluatorId: 'score-calibration',
        status: 'pass',
        message: 'All category scores fall within the case score bands.',
      };
}

function statusFromEvaluations(
  evaluations: BenchmarkEvaluationResult[]
): 'pass' | 'fail' | 'needs_review' | 'blocked' {
  if (evaluations.some((evaluation) => evaluation.status === 'fail')) {
    return 'fail';
  }
  if (evaluations.some((evaluation) => evaluation.status === 'blocked')) {
    return 'blocked';
  }
  if (evaluations.some((evaluation) => evaluation.status === 'needs_review')) {
    return 'needs_review';
  }
  return 'pass';
}

export async function runGradingBenchmark({
  suite,
  execute,
  mode = 'draft',
  reviews = {},
}: {
  suite: GradingBenchmarkSuite;
  execute: (benchmarkCase: GradingBenchmarkCase) => Promise<unknown> | unknown;
  mode?: 'draft' | 'release';
  reviews?: Record<string, BenchmarkOutputReview>;
}): Promise<GradingBenchmarkResult> {
  const caseResults: GradingBenchmarkResult['cases'] = [];

  for (const benchmarkCase of suite.cases) {
    if (mode === 'release' && !isBenchmarkCaseApproved(benchmarkCase)) {
      caseResults.push({
        caseId: benchmarkCase.id,
        status: 'blocked',
        evaluations: [
          {
            evaluatorId: 'case-approval',
            status: 'blocked',
            message:
              'Release benchmarks require named product and educator approval.',
          },
        ],
      });
      continue;
    }

    let rawOutput: unknown;
    try {
      rawOutput = await execute(benchmarkCase);
    } catch (error) {
      caseResults.push({
        caseId: benchmarkCase.id,
        status: 'fail',
        evaluations: [
          {
            evaluatorId: 'execution',
            status: 'fail',
            message:
              error instanceof Error
                ? error.message
                : 'Benchmark execution failed.',
          },
        ],
      });
      continue;
    }

    const parsed = parseOutput(rawOutput, benchmarkCase, suite);
    const evaluations: BenchmarkEvaluationResult[] = [
      parsed.errors.length === 0
        ? {
            evaluatorId: 'response-contract',
            status: 'pass',
            message: 'Output matches the grading response contract.',
          }
        : {
            evaluatorId: 'response-contract',
            status: 'fail',
            message: parsed.errors.join(' '),
          },
      evaluateScoreCalibration(benchmarkCase, parsed.output),
    ];

    for (const criterion of benchmarkCase.expectations.qualitative) {
      const review =
        reviews[benchmarkReviewKey(benchmarkCase.id, criterion.id)];
      evaluations.push(
        review
          ? {
              evaluatorId: criterion.evaluatorId,
              criterionId: criterion.id,
              status: review.status,
              message: criterion.requirement,
              evidence: review.evidence,
              reviewer: review.reviewer,
              reviewMethod: review.method,
            }
          : {
              evaluatorId: criterion.evaluatorId,
              criterionId: criterion.id,
              status: 'needs_review',
              message: criterion.requirement,
            }
      );
    }

    caseResults.push({
      caseId: benchmarkCase.id,
      status: statusFromEvaluations(evaluations),
      ...(parsed.output ? { output: parsed.output } : {}),
      evaluations,
    });
  }

  const summary = {
    total: caseResults.length,
    passed: caseResults.filter((item) => item.status === 'pass').length,
    failed: caseResults.filter((item) => item.status === 'fail').length,
    needsReview: caseResults.filter((item) => item.status === 'needs_review')
      .length,
    blocked: caseResults.filter((item) => item.status === 'blocked').length,
  };
  const status = summary.failed
    ? 'fail'
    : summary.blocked
      ? 'blocked'
      : summary.needsReview
        ? 'needs_review'
        : 'pass';

  return {
    suiteId: suite.id,
    suiteVersion: suite.version,
    mode,
    status,
    summary,
    cases: caseResults,
  };
}
