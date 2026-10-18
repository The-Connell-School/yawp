import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  classAssignment: { findFirst: mock() },
};
mock.module('~/utils/db.server', () => ({ prisma }));

const flags = {
  isAssignmentSummaryPlannerEnabled: mock(),
  isAssignmentSummaryModelsEnabled: mock(),
};
mock.module('~/domain/feature-flags/feature-flags.server', () => flags);

const loadClassModelInputs = mock();
mock.module('~/domain/assignment-insights/class-model-inputs.server', () => ({
  loadClassModelInputs,
}));

const readInsightRubric = mock();
mock.module('~/domain/assignment-insights/insight-rubric.server', () => ({
  readInsightRubric,
}));

const { DEFAULT_INSIGHT_RUBRIC } = await import(
  '~/domain/assignment-insights/insight-rubric'
);
const { loadSummaryHandoffSeed, loadSummaryClassContext } = await import(
  './summary-handoff.server'
);

afterAll(() => {
  mock.restore();
});

const summaryJson = {
  overview: 'Strong evidence; theses restate the plot.',
  categories: [
    {
      key: 'thesis_and_content',
      label: 'Thesis/Content',
      status: 'gap',
      summary: 'Most theses restate the plot.',
    },
  ],
  nextSteps: [
    {
      title: 'Turn a topic into a claim',
      detail: 'Model the move from topic to claim.',
      rubricCategory: 'thesis_and_content',
    },
  ],
  differentiation: {
    focusGroups: [
      {
        category: 'thesis_and_content',
        label: 'Thesis/Content',
        students: [
          { name: 'Ada Lovelace', href: null },
          { name: 'Grace Hopper', href: null },
        ],
      },
    ],
    individuals: [],
  },
};

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ca-1',
    assignment: { title: 'Romeo and Juliet essay' },
    class: {
      title: 'English 10',
      grade: null,
      period: null,
      students: [
        { user: { name: 'Ada Lovelace', email: 'ada@school.org' } },
        { user: { name: 'Grace Hopper', email: 'grace@school.org' } },
      ],
    },
    insight: { status: 'ready', summaryJson },
    ...overrides,
  };
}

function paper(
  name: string,
  thesis: number,
  text: string,
  comment = ''
) {
  return {
    submissionId: `sub-${name}`,
    studentName: name,
    href: `/app/submissions/sub-${name}`,
    text,
    rubricScores: {
      thesis_and_content: { score: thesis, comment },
      evidence_and_support: { score: 4, comment: '' },
    },
  };
}

const args = {
  membershipId: 'teacher-1',
  organizationId: 'org-1',
  classAssignmentId: 'ca-1',
};

beforeEach(() => {
  prisma.classAssignment.findFirst.mockReset().mockResolvedValue(row());
  flags.isAssignmentSummaryPlannerEnabled.mockReset().mockResolvedValue(true);
  flags.isAssignmentSummaryModelsEnabled.mockReset().mockResolvedValue(true);
  loadClassModelInputs.mockReset().mockResolvedValue([]);
  readInsightRubric.mockReset().mockResolvedValue(DEFAULT_INSIGHT_RUBRIC);
});

describe('loadSummaryHandoffSeed', () => {
  test('builds the seed from the stored summary, scoped to the teacher', async () => {
    const seed = await loadSummaryHandoffSeed({
      ...args,
      handoffParam: 'category:thesis_and_content',
    });
    expect(seed?.classAssignmentId).toBe('ca-1');
    expect(seed?.originSeed).toBe('category:thesis_and_content');
    expect(seed?.prompt).toContain('Most theses restate the plot.');
    expect(seed?.prompt).toContain('2 students');
    expect(seed?.prompt).not.toContain('Ada');
    expect(seed?.chips[0]).toBe('Thesis/Content · area to grow');
    expect(
      prisma.classAssignment.findFirst.mock.calls[0][0].where
    ).toMatchObject({
      id: 'ca-1',
      class: { teachers: { some: { id: 'teacher-1' } } },
    });
  });

  test('nothing when the flag is off, the param is bad, or the summary is not ready', async () => {
    flags.isAssignmentSummaryPlannerEnabled.mockResolvedValue(false);
    expect(
      await loadSummaryHandoffSeed({ ...args, handoffParam: 'summary' })
    ).toBeNull();
    expect(prisma.classAssignment.findFirst).not.toHaveBeenCalled();

    flags.isAssignmentSummaryPlannerEnabled.mockResolvedValue(true);
    expect(
      await loadSummaryHandoffSeed({ ...args, handoffParam: 'nope' })
    ).toBeNull();

    prisma.classAssignment.findFirst.mockResolvedValue(
      row({ insight: { status: 'failed', summaryJson } })
    );
    expect(
      await loadSummaryHandoffSeed({ ...args, handoffParam: 'summary' })
    ).toBeNull();

    prisma.classAssignment.findFirst.mockResolvedValue(null);
    expect(
      await loadSummaryHandoffSeed({ ...args, handoffParam: 'summary' })
    ).toBeNull();
  });

  test('models: strong excerpts with every roster name removed, near misses only as feedback', async () => {
    loadClassModelInputs.mockResolvedValue([
      paper(
        'Ada Lovelace',
        5,
        'Ada Lovelace — Period 1. Haste, not fate, destroys the lovers, as Grace said.'
      ),
      paper(
        'Grace Hopper',
        1,
        'Grace Hopper. The play is about two lovers who die.',
        'Restates the plot; no claim. (Grace, see me.)'
      ),
    ]);
    const seed = await loadSummaryHandoffSeed({
      ...args,
      handoffParam: 'models:thesis_and_content',
    });
    expect(seed?.prompt).toContain(
      'Student A: "[name] — Period 1. Haste, not fate, destroys the lovers, as [name] said."'
    );
    expect(seed?.prompt).toContain('Restates the plot; no claim. ([name], see me.)');
    expect(seed?.prompt).not.toMatch(/Ada|Grace|Lovelace|Hopper/);
    // The near miss's own words stay in the app.
    expect(seed?.prompt).not.toContain('two lovers who die');
    expect(loadClassModelInputs).toHaveBeenCalledWith('ca-1');
  });

  test('models needs the models flag too', async () => {
    flags.isAssignmentSummaryModelsEnabled.mockResolvedValue(false);
    expect(
      await loadSummaryHandoffSeed({
        ...args,
        handoffParam: 'models:thesis_and_content',
      })
    ).toBeNull();
    expect(loadClassModelInputs).not.toHaveBeenCalled();
  });
});

describe('loadSummaryClassContext', () => {
  test('rebuilds the class context for a later turn', async () => {
    const context = await loadSummaryClassContext({
      ...args,
      originSeed: 'group:thesis_and_content',
    });
    expect(context).toContain('assignment summary');
    expect(context).toContain('2 students scored low on Thesis/Content');
    expect(context).not.toContain('Build me');
  });

  test('nothing without an origin, with the flag off, or for a stale origin', async () => {
    expect(
      await loadSummaryClassContext({ ...args, originSeed: null })
    ).toBeNull();
    expect(
      await loadSummaryClassContext({ ...args, classAssignmentId: null, originSeed: 'summary' })
    ).toBeNull();
    flags.isAssignmentSummaryPlannerEnabled.mockResolvedValue(false);
    expect(
      await loadSummaryClassContext({ ...args, originSeed: 'summary' })
    ).toBeNull();
    flags.isAssignmentSummaryPlannerEnabled.mockResolvedValue(true);
    expect(
      await loadSummaryClassContext({ ...args, originSeed: 'category:grammar' })
    ).toBeNull();
  });
});
