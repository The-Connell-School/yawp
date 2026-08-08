/**
 * Combines the per-section class performance summaries for one assignment into
 * a single read across every section a teacher runs it in.
 *
 * An assignment is one `Assignment` row joined to each class through
 * `ClassAssignment`, and a `ClassAssignmentInsight` is generated per
 * ClassAssignment — so "the same assignment across three sections" is three
 * independent summaries keyed by the same `assignmentId`. This module merges
 * those summaries without flattening them: every section keeps its own
 * submission count, and a category where the sections disagree is reported as
 * a split rather than resolved into whichever section happened to be bigger.
 */

export type SectionCategoryStatus = 'strength' | 'mixed' | 'gap';

type SectionCategory = {
  key: string;
  label: string;
  status: SectionCategoryStatus;
  summary: string;
};

type SectionNextStep = {
  title: string;
  detail: string;
  rubricCategory: string;
};

export type SectionSummary = {
  overview: string;
  categories: SectionCategory[];
  nextSteps: SectionNextStep[];
};

export type SectionInsight = {
  status: 'ready' | 'failed';
  submissionCount: number;
  generatedAt: string | null;
  summary: SectionSummary | null;
};

export type SectionInsightInput = {
  classId: string;
  classAssignmentId: string;
  /** Human label for the section, e.g. "Grade 9 · Period 2". */
  label: string;
  /** Graded submissions in the section, whether or not they were summarized. */
  gradedCount: number;
  insight: SectionInsight | null;
};

export type SectionCoverage = {
  classId: string;
  classAssignmentId: string;
  label: string;
  /** Submissions the section's summary was built from; 0 when unsummarized. */
  submissionCount: number;
  gradedCount: number;
  hasSummary: boolean;
  /** Portion of the combined submission count this section contributes. */
  shareOfTotal: number;
  /**
   * True when this section's summary rests on far fewer submissions than the
   * largest section's — the combined read leans on the other sections here.
   */
  isThin: boolean;
};

export type CombinedCategory = {
  key: string;
  label: string;
  /** The agreed status, or 'mixed' when the sections disagree. */
  status: SectionCategoryStatus;
  agreement: 'agreed' | 'split';
  sections: {
    classId: string;
    label: string;
    status: SectionCategoryStatus;
    submissionCount: number;
    summary: string;
  }[];
  /** Labels of summarized sections whose summary never mentioned this category. */
  notReportedBy: string[];
};

export type CombinedNextStep = {
  title: string;
  detail: string;
  rubricCategory: string;
  sectionLabels: string[];
};

export type CombinedSectionInsights = {
  sections: SectionCoverage[];
  reportingSections: SectionCoverage[];
  missingSections: SectionCoverage[];
  totalSubmissions: number;
  categories: CombinedCategory[];
  nextSteps: CombinedNextStep[];
  /** True when at least one summarized section is thin against the largest. */
  hasUnevenCoverage: boolean;
  /** Plain-language notes the UI must surface alongside the combined read. */
  coverageWarnings: string[];
};

/**
 * A section carrying less than this share of the largest section's submissions
 * is called out rather than folded silently into the combined picture.
 */
const THIN_SECTION_SHARE = 0.5;

function isReady(insight: SectionInsight | null): insight is SectionInsight & {
  summary: SectionSummary;
} {
  return Boolean(insight && insight.status === 'ready' && insight.summary);
}

function formatList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function pluralSubmissions(count: number): string {
  return `${count} submission${count === 1 ? '' : 's'}`;
}

export function combineSectionInsights(
  inputs: SectionInsightInput[]
): CombinedSectionInsights {
  const totalSubmissions = inputs.reduce(
    (sum, input) =>
      sum + (isReady(input.insight) ? input.insight.submissionCount : 0),
    0
  );

  const largestSubmissionCount = inputs.reduce(
    (max, input) =>
      isReady(input.insight)
        ? Math.max(max, input.insight.submissionCount)
        : max,
    0
  );

  const sections: SectionCoverage[] = inputs.map((input) => {
    const ready = isReady(input.insight);
    const submissionCount = ready ? input.insight!.submissionCount : 0;
    return {
      classId: input.classId,
      classAssignmentId: input.classAssignmentId,
      label: input.label,
      submissionCount,
      gradedCount: input.gradedCount,
      hasSummary: ready,
      shareOfTotal:
        totalSubmissions > 0 ? submissionCount / totalSubmissions : 0,
      // An unsummarized section is a different problem from a thin one and
      // gets its own warning, so it is never also marked thin.
      isThin:
        ready &&
        largestSubmissionCount > 0 &&
        submissionCount < largestSubmissionCount * THIN_SECTION_SHARE,
    };
  });

  const reportingSections = sections.filter((section) => section.hasSummary);
  const missingSections = sections.filter((section) => !section.hasSummary);

  const readyInputs = inputs.filter((input) => isReady(input.insight));

  // Categories, in first-seen order across the sections.
  const categoryOrder: string[] = [];
  const categoryBuckets = new Map<
    string,
    { label: string; entries: CombinedCategory['sections'] }
  >();

  for (const input of readyInputs) {
    for (const category of input.insight!.summary!.categories) {
      let bucket = categoryBuckets.get(category.key);
      if (!bucket) {
        bucket = { label: category.label, entries: [] };
        categoryBuckets.set(category.key, bucket);
        categoryOrder.push(category.key);
      }
      bucket.entries.push({
        classId: input.classId,
        label: input.label,
        status: category.status,
        submissionCount: input.insight!.submissionCount,
        summary: category.summary,
      });
    }
  }

  const categories: CombinedCategory[] = categoryOrder.map((key) => {
    const bucket = categoryBuckets.get(key)!;
    const statuses = new Set(bucket.entries.map((entry) => entry.status));
    const agreed = statuses.size === 1;
    const reportingLabels = new Set(
      bucket.entries.map((entry) => entry.label)
    );
    return {
      key,
      label: bucket.label,
      // A disagreement is never resolved by weight — a section with thirty
      // submissions does not get to speak for one with four.
      status: agreed ? bucket.entries[0].status : 'mixed',
      agreement: agreed ? ('agreed' as const) : ('split' as const),
      sections: bucket.entries,
      notReportedBy: reportingSections
        .filter((section) => !reportingLabels.has(section.label))
        .map((section) => section.label),
    };
  });

  // Next steps, merged on category + title so the same advice raised in two
  // sections reads as one step attributed to both.
  const stepOrder: string[] = [];
  const stepBuckets = new Map<string, CombinedNextStep>();

  for (const input of readyInputs) {
    for (const step of input.insight!.summary!.nextSteps) {
      const stepKey = `${step.rubricCategory}::${step.title
        .trim()
        .toLowerCase()}`;
      let bucket = stepBuckets.get(stepKey);
      if (!bucket) {
        bucket = {
          title: step.title,
          detail: step.detail,
          rubricCategory: step.rubricCategory,
          sectionLabels: [],
        };
        stepBuckets.set(stepKey, bucket);
        stepOrder.push(stepKey);
      }
      if (!bucket.sectionLabels.includes(input.label)) {
        bucket.sectionLabels.push(input.label);
      }
    }
  }

  const nextSteps = stepOrder
    .map((stepKey, index) => ({ step: stepBuckets.get(stepKey)!, index }))
    .sort(
      (a, b) =>
        b.step.sectionLabels.length - a.step.sectionLabels.length ||
        a.index - b.index
    )
    .map(({ step }) => step);

  const thinSections = sections.filter((section) => section.isThin);
  const coverageWarnings: string[] = [];

  if (thinSections.length > 0) {
    const largest = reportingSections.reduce((biggest, section) =>
      section.submissionCount > biggest.submissionCount ? section : biggest
    );
    coverageWarnings.push(
      `${formatList(
        thinSections.map(
          (section) =>
            `${section.label} (${pluralSubmissions(section.submissionCount)})`
        )
      )} contributed far less work than ${largest.label} (${pluralSubmissions(
        largest.submissionCount
      )}). Read the combined view per section before acting on it.`
    );
  }

  if (missingSections.length > 0) {
    coverageWarnings.push(
      `${formatList(
        missingSections.map((section) => section.label)
      )} ${missingSections.length === 1 ? 'has' : 'have'} no summary yet, so ${
        missingSections.length === 1 ? 'it is' : 'they are'
      } not included below.`
    );
  }

  return {
    sections,
    reportingSections,
    missingSections,
    totalSubmissions,
    categories,
    nextSteps,
    hasUnevenCoverage: thinSections.length > 0,
    coverageWarnings,
  };
}
