import { describe, expect, mock, test } from 'bun:test';
import { createEvaluationSuiteVersion } from './prompt-version-control.server';

const currentEvaluationSuite = {
  evaluations: [
    {
      id: 'evaluation-1',
      title: 'Encouraging opening',
      description: 'Begin with specific encouragement.',
      position: 0,
      cases: [
        {
          id: 'case-1',
          evaluationId: 'evaluation-1',
          title: 'Positive opening',
          rubricCategoryKey: 'thesis',
          documentText: 'School uniforms should remain optional.',
          criterion: 'Begin with specific encouragement.',
          expectedOutputJson: {
            categories: [
              {
                key: 'thesis',
                score: 4,
                comment: 'The position is clear.',
              },
            ],
            overallComment: 'Jordan, your position is clear.',
          },
          position: 0,
        },
      ],
    },
  ],
  evaluationCases: [],
};

const expectedEvaluationSuite = {
  evaluations: currentEvaluationSuite.evaluations,
  legacyCases: currentEvaluationSuite.evaluationCases,
};

function createDb({
  latestVersion = 1,
  run = null,
}: {
  latestVersion?: number;
  run?: { id: string } | null;
} = {}) {
  const latest = {
    id: `suite-${latestVersion}`,
    assignmentTypeId: 'assignment-type-1',
    version: latestVersion,
    contentHash: 'outdated-content-hash',
    snapshotJson: { evaluations: [], legacyCases: [] },
  };
  return {
    assignmentType: {
      findUnique: mock(() => Promise.resolve(currentEvaluationSuite)),
    },
    assignmentTypeEvaluationSuiteVersion: {
      findFirst: mock(() => Promise.resolve(latest)),
      update: mock((args) =>
        Promise.resolve({
          ...latest,
          ...args.data,
        })
      ),
      create: mock((args) =>
        Promise.resolve({
          id: `suite-${args.data.version}`,
          ...args.data,
        })
      ),
    },
    assignmentTypeEvaluationRun: {
      findFirst: mock(() => Promise.resolve(run)),
    },
  };
}

describe('createEvaluationSuiteVersion', () => {
  test('updates an unrun suite in place instead of incrementing its version', async () => {
    const db = createDb();

    const suite = await createEvaluationSuiteVersion(
      db as never,
      'assignment-type-1'
    );

    expect(db.assignmentTypeEvaluationRun.findFirst).toHaveBeenCalledWith({
      where: {
        assignmentTypeId: 'assignment-type-1',
        OR: [
          { evaluationSuiteVersionId: 'suite-1' },
          { evaluationSuiteVersionId: null },
        ],
      },
      select: { id: true },
    });
    expect(db.assignmentTypeEvaluationSuiteVersion.update).toHaveBeenCalledWith({
      where: { id: 'suite-1' },
      data: {
        contentHash: expect.any(String),
        snapshotJson: expectedEvaluationSuite,
      },
    });
    expect(db.assignmentTypeEvaluationSuiteVersion.create).not.toHaveBeenCalled();
    expect(suite.version).toBe(1);
  });

  test('creates the next suite version after the current suite has a run', async () => {
    const db = createDb({ latestVersion: 3, run: { id: 'run-1' } });

    const suite = await createEvaluationSuiteVersion(
      db as never,
      'assignment-type-1'
    );

    expect(db.assignmentTypeEvaluationSuiteVersion.update).not.toHaveBeenCalled();
    expect(db.assignmentTypeEvaluationSuiteVersion.create).toHaveBeenCalledWith({
      data: {
        assignmentTypeId: 'assignment-type-1',
        version: 4,
        contentHash: expect.any(String),
        snapshotJson: expectedEvaluationSuite,
      },
    });
    expect(suite.version).toBe(4);
  });
});
