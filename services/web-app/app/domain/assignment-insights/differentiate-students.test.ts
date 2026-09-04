import { describe, expect, test } from 'bun:test';
import {
  buildDifferentiation,
  type DifferentiationInput,
} from './differentiate-students';
import type { InsightRubric } from './insight-rubric';

const GBA_RUBRIC: InsightRubric = {
  categories: [
    { key: 'budget', label: 'Budget', weight: 0.5, minScore: 0, maxScore: 100 },
    {
      key: 'recommendation',
      label: 'Recommendation',
      weight: 0.5,
      minScore: 0,
      maxScore: 100,
    },
  ],
};


function student(
  name: string,
  scores: Record<string, number>,
  href = `/app/submissions/${name}`
): DifferentiationInput {
  return {
    submissionId: `sub-${name}`,
    studentName: name,
    href,
    rubricScores: Object.fromEntries(
      Object.entries(scores).map(([key, score]) => [
        key,
        { score, comment: '' },
      ])
    ),
  };
}

describe('buildDifferentiation', () => {
  test('groups students who scored low on the same category', () => {
    const result = buildDifferentiation([
      student('Ana', { evidence_and_support: 2, thesis_and_content: 4 }),
      student('Ben', { evidence_and_support: 1, thesis_and_content: 3 }),
      student('Cara', { evidence_and_support: 4, thesis_and_content: 4 }),
      student('Dev', { evidence_and_support: 5, thesis_and_content: 3 }),
      student('Eli', { evidence_and_support: 3, thesis_and_content: 3 }),
    ]);

    expect(result).not.toBeNull();
    expect(result!.focusGroups).toHaveLength(1);
    const group = result!.focusGroups[0];
    expect(group.category).toBe('evidence_and_support');
    expect(group.label).toBe('Evidence/Support');
    // Lowest score first.
    expect(group.students.map((s) => s.name)).toEqual(['Ben', 'Ana']);
    expect(group.students[0].href).toBe('/app/submissions/Ben');
  });

  test('skips a group when most of the class is low — that is whole-class reteaching', () => {
    const result = buildDifferentiation([
      student('Ana', { evidence_and_support: 2 }),
      student('Ben', { evidence_and_support: 1 }),
      student('Cara', { evidence_and_support: 2 }),
      student('Dev', { evidence_and_support: 5 }),
    ]);

    expect(result?.focusGroups ?? []).toHaveLength(0);
  });

  test('never groups a single student', () => {
    const result = buildDifferentiation([
      student('Ana', { evidence_and_support: 1, thesis_and_content: 4 }),
      student('Ben', { evidence_and_support: 4, thesis_and_content: 4 }),
      student('Cara', { evidence_and_support: 5, thesis_and_content: 4 }),
    ]);

    expect(result?.focusGroups ?? []).toHaveLength(0);
  });

  test('flags a student who is low across most scored categories', () => {
    const result = buildDifferentiation([
      student('Ana', {
        thesis_and_content: 2,
        evidence_and_support: 1,
        voice_and_style: 3,
      }),
      student('Ben', {
        thesis_and_content: 4,
        evidence_and_support: 4,
        voice_and_style: 4,
      }),
      student('Cara', {
        thesis_and_content: 3,
        evidence_and_support: 4,
        voice_and_style: 3,
      }),
    ]);

    const support = result!.individuals.filter((f) => f.kind === 'support');
    expect(support).toHaveLength(1);
    expect(support[0].student.name).toBe('Ana');
    expect(support[0].categoryLabels).toEqual([
      'Thesis/Content',
      'Evidence/Support',
    ]);
  });

  test('does not flag a student low in only one category', () => {
    const result = buildDifferentiation([
      student('Ana', {
        thesis_and_content: 2,
        evidence_and_support: 4,
        voice_and_style: 4,
      }),
      student('Ben', {
        thesis_and_content: 4,
        evidence_and_support: 3,
        voice_and_style: 4,
      }),
    ]);

    expect(result?.individuals.filter((f) => f.kind === 'support') ?? []).toHaveLength(0);
  });

  test('flags a student strong in every scored category for extension', () => {
    const result = buildDifferentiation([
      student('Ana', {
        thesis_and_content: 5,
        evidence_and_support: 4,
        voice_and_style: 5,
      }),
      student('Ben', {
        thesis_and_content: 3,
        evidence_and_support: 3,
        voice_and_style: 2,
      }),
    ]);

    const extension = result!.individuals.filter(
      (f) => f.kind === 'extension'
    );
    expect(extension).toHaveLength(1);
    expect(extension[0].student.name).toBe('Ana');
    expect(extension[0].categoryLabels).toContain('Voice/Style');
  });

  test('lists support flags before extension flags and caps the total', () => {
    const struggling = ['S1', 'S2', 'S3'].map((name) =>
      student(name, { thesis_and_content: 1, evidence_and_support: 2 })
    );
    const soaring = ['E1', 'E2'].map((name) =>
      student(name, { thesis_and_content: 5, evidence_and_support: 5 })
    );
    // Enough middle-of-the-road students that neither pattern is whole-class.
    const middle = ['M1', 'M2', 'M3', 'M4', 'M5'].map((name) =>
      student(name, { thesis_and_content: 3, evidence_and_support: 3 })
    );

    const result = buildDifferentiation([
      ...struggling,
      ...soaring,
      ...middle,
    ]);

    expect(result!.individuals).toHaveLength(4);
    expect(result!.individuals.map((f) => f.kind)).toEqual([
      'support',
      'support',
      'support',
      'extension',
    ]);
  });

  test('supports legacy flat-number rubric scores', () => {
    const result = buildDifferentiation([
      {
        submissionId: 'sub-legacy-1',
        studentName: 'Ana',
        rubricScores: { thesis_and_content: 2, evidence_and_support: 1 },
      },
      {
        submissionId: 'sub-legacy-2',
        studentName: 'Ben',
        rubricScores: { thesis_and_content: 4, evidence_and_support: 4 },
      },
    ]);

    expect(result).not.toBeNull();
    const support = result!.individuals.filter((f) => f.kind === 'support');
    expect(support[0].student.name).toBe('Ana');
    expect(support[0].student.href).toBeNull();
  });

  test('falls back to a placeholder name and returns null when there is nothing to say', () => {
    expect(buildDifferentiation([])).toBeNull();
    expect(
      buildDifferentiation([student('Solo', { thesis_and_content: 1 })])
    ).toBeNull();
    expect(
      buildDifferentiation([
        student('Ana', { thesis_and_content: 3 }),
        student('Ben', { thesis_and_content: 3 }),
      ])
    ).toBeNull();

    const unnamed = buildDifferentiation([
      {
        submissionId: 'sub-1',
        rubricScores: {
          thesis_and_content: { score: 1 },
          evidence_and_support: { score: 2 },
        },
      },
      student('Ben', { thesis_and_content: 4, evidence_and_support: 4 }),
      student('Cara', { thesis_and_content: 3, evidence_and_support: 3 }),
    ]);
    const support = unnamed!.individuals.filter((f) => f.kind === 'support');
    expect(support[0].student.name).toBe('Unknown student');
  });
});

describe('differentiating against an assignment type’s own rubric', () => {
  test('groups students by a category the default rubric has never heard of', () => {
    const summary = buildDifferentiation(
      [
        {
          submissionId: 's1',
          studentName: 'Sol',
          rubricScores: { budget: { score: 20 }, recommendation: { score: 90 } },
        },
        {
          submissionId: 's2',
          studentName: 'Tao',
          rubricScores: { budget: { score: 15 }, recommendation: { score: 88 } },
        },
        {
          submissionId: 's3',
          studentName: 'Uma',
          rubricScores: { budget: { score: 85 }, recommendation: { score: 92 } },
        },
        {
          submissionId: 's4',
          studentName: 'Mia',
          rubricScores: { budget: { score: 90 }, recommendation: { score: 80 } },
        },
      ],
      GBA_RUBRIC
    );

    expect(summary?.focusGroups).toEqual([
      {
        category: 'budget',
        label: 'Budget',
        students: [
          { name: 'Tao', href: null },
          { name: 'Sol', href: null },
        ],
      },
    ]);
  });

  test('a hundred-point score is judged as a share of its range', () => {
    // 90 and 95 out of 100 is the extension pattern for the same reason 4 and 5
    // out of 5 is. Judged as raw numbers against the old 1-5 thresholds it would
    // have been true by accident; judged as a share it is true on purpose.
    const summary = buildDifferentiation(
      [
        {
          submissionId: 's1',
          studentName: 'Uma',
          rubricScores: { budget: { score: 90 }, recommendation: { score: 95 } },
        },
        {
          submissionId: 's2',
          studentName: 'Sol',
          rubricScores: { budget: { score: 60 }, recommendation: { score: 55 } },
        },
      ],
      GBA_RUBRIC
    );

    expect(summary?.individuals).toEqual([
      {
        kind: 'extension',
        student: { name: 'Uma', href: null },
        categoryLabels: ['Budget', 'Recommendation'],
      },
    ]);
  });
});
