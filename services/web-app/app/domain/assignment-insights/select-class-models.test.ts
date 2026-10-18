import { describe, expect, test } from 'bun:test';
import {
  selectClassModels,
  selectHandoffModels,
  skillName,
  type ClassModelInput,
} from './select-class-models';
import { DEFAULT_INSIGHT_RUBRIC, type InsightRubric } from './insight-rubric';

const TWO_CATEGORY_RUBRIC: InsightRubric = {
  categories: [
    { key: 'thesis', label: 'Thesis', weight: 0.5, minScore: 1, maxScore: 5 },
    {
      key: 'evidence',
      label: 'Evidence',
      weight: 0.5,
      minScore: 1,
      maxScore: 5,
    },
  ],
};

function student(
  name: string,
  scores: Record<string, number>,
  text = `${name} wrote this paragraph about the reading.`
): ClassModelInput {
  return {
    submissionId: `sub-${name}`,
    studentName: name,
    href: `/app/submissions/sub-${name}`,
    text,
    rubricScores: Object.fromEntries(
      Object.entries(scores).map(([key, score]) => [
        key,
        { score, comment: '' },
      ])
    ),
  };
}

describe('selectClassModels', () => {
  test('returns null when fewer than two students were scored', () => {
    expect(
      selectClassModels(
        [student('Ava', { thesis: 5, evidence: 1 })],
        TWO_CATEGORY_RUBRIC
      )
    ).toBeNull();
  });

  test('leads with the weakest class category, pairing a strong model with an instructive one', () => {
    const result = selectClassModels(
      [
        student('Ava', { thesis: 5, evidence: 5 }),
        student('Ben', { thesis: 4, evidence: 1 }),
        student('Cy', { thesis: 4, evidence: 3 }),
        student('Di', { thesis: 1, evidence: 1 }),
      ],
      TWO_CATEGORY_RUBRIC
    );

    expect(result).not.toBeNull();
    const first = result!.focuses[0];
    expect(first.category).toBe('evidence');
    expect(first.label).toBe('Evidence');
    expect(first.exemplar?.studentName).toBe('Ava');
    expect(first.exemplar?.score).toBe(5);
    expect(first.exemplar?.maxScore).toBe(5);
    // Ben and Di both scored 1 on evidence; Ben is strong elsewhere, so his
    // gap is the isolated, fixable one the class can learn from.
    expect(first.instructive?.studentName).toBe('Ben');
    expect(first.instructive?.href).toBe('/app/submissions/sub-Ben');
  });

  test('never spotlights the same student as an instructive example twice', () => {
    const result = selectClassModels(
      [
        student('Ava', { thesis: 5, evidence: 5 }),
        student('Ben', { thesis: 1, evidence: 1 }),
        student('Cy', { thesis: 2, evidence: 1 }),
        student('Di', { thesis: 5, evidence: 4 }),
      ],
      TWO_CATEGORY_RUBRIC
    );

    const instructiveNames = result!.focuses
      .map((focus) => focus.instructive?.studentName)
      .filter(Boolean);
    expect(new Set(instructiveNames).size).toBe(instructiveNames.length);
  });

  test('omits the instructive side when nobody scored low in a category', () => {
    const result = selectClassModels(
      [
        student('Ava', { thesis: 5, evidence: 5 }),
        student('Ben', { thesis: 5, evidence: 4 }),
      ],
      TWO_CATEGORY_RUBRIC
    );

    for (const focus of result!.focuses) {
      expect(focus.instructive).toBeNull();
      expect(focus.exemplar).not.toBeNull();
    }
  });

  test('reads high and low against each category’s own range', () => {
    const hundredPoint: InsightRubric = {
      categories: [
        {
          key: 'budget',
          label: 'Budget',
          weight: 1,
          minScore: 0,
          maxScore: 100,
        },
      ],
    };
    const result = selectClassModels(
      [
        student('Ava', { budget: 92 }),
        student('Ben', { budget: 20 }),
        student('Cy', { budget: 55 }),
      ],
      hundredPoint
    );

    expect(result!.focuses[0].exemplar?.studentName).toBe('Ava');
    expect(result!.focuses[0].exemplar?.maxScore).toBe(100);
    expect(result!.focuses[0].instructive?.studentName).toBe('Ben');
  });

  test('turns submission text into a short plain snippet', () => {
    const longHtml = `<p>${'Evidence matters because '.repeat(30)}</p>`;
    const result = selectClassModels(
      [
        {
          ...student('Ava', { thesis: 5, evidence: 5 }),
          text: null,
          html: longHtml,
        },
        student('Ben', { thesis: 4, evidence: 1 }),
      ],
      TWO_CATEGORY_RUBRIC
    );

    const snippet = result!.focuses[0].exemplar!.snippet;
    expect(snippet).not.toContain('<p>');
    expect(snippet.length).toBeLessThanOrEqual(241);
    expect(snippet.endsWith('…')).toBe(true);
  });

  test('skips submissions with no text to show', () => {
    const result = selectClassModels(
      [
        { ...student('Ava', { thesis: 5, evidence: 5 }), text: '   ' },
        student('Ben', { thesis: 4, evidence: 4 }),
        student('Cy', { thesis: 4, evidence: 1 }),
      ],
      TWO_CATEGORY_RUBRIC
    );

    expect(result!.focuses[0].exemplar?.studentName).toBe('Ben');
  });

  test('gives the teacher questions to think through for each side', () => {
    const result = selectClassModels(
      [
        student('Ava', { thesis: 5, evidence: 5 }),
        student('Ben', { thesis: 4, evidence: 1 }),
      ],
      TWO_CATEGORY_RUBRIC
    );

    const focus = result!.focuses[0];
    expect(focus.exemplarPrompts.length).toBeGreaterThan(0);
    expect(focus.instructivePrompts.length).toBeGreaterThan(0);
    expect(focus.exemplarPrompts.join(' ')).toContain('evidence');
    expect(focus.instructivePrompts.join(' ')).toMatch(/name/i);
  });

  test('names the skill the way a teacher would say it in the prompts', () => {
    const result = selectClassModels(
      [
        student('Ava', {
          thesis_and_content: 5,
          evidence_and_support: 5,
        }),
        student('Ben', {
          thesis_and_content: 4,
          evidence_and_support: 1,
        }),
      ],
      DEFAULT_INSIGHT_RUBRIC
    );

    const focus = result!.focuses[0];
    expect(focus.label).toBe('Evidence/Support');
    expect(focus.skill).toBe('evidence');
    expect(focus.exemplarPrompts[0]).toBe(
      'What exactly makes the evidence work here? Name the move you want every student to try.'
    );
    expect(focus.instructivePrompts[0]).toBe(
      'What is the one revision that would most improve the evidence?'
    );
    expect(focus.exemplarPrompts.join(' ')).not.toContain('/');
  });

  test('turns any rubric label into a short skill name', () => {
    const named = (label: string) => skillName({ label });
    expect(named('Thesis/Content')).toBe('thesis');
    expect(named('Organization/Structure')).toBe('organization');
    expect(named('Grammar & Mechanics')).toBe('grammar');
    expect(named('Voice and Style')).toBe('voice');
    expect(named('Budget')).toBe('budget');
    expect(named('Use of Evidence')).toBe('use of evidence');
    // Acronyms keep their capitals.
    expect(named('MLA Citations')).toBe('MLA citations');
  });

  test('caps the focuses so the section stays a short list', () => {
    const inputs = ['Ava', 'Ben', 'Cy', 'Di'].map((name, index) =>
      student(
        name,
        Object.fromEntries(
          DEFAULT_INSIGHT_RUBRIC.categories.map((category) => [
            category.key,
            index % 2 === 0 ? 5 : 1,
          ])
        )
      )
    );
    const result = selectClassModels(inputs, DEFAULT_INSIGHT_RUBRIC);
    expect(result!.focuses.length).toBeLessThanOrEqual(2);
  });
});

describe('selectHandoffModels', () => {
  function withComment(
    input: ClassModelInput,
    key: string,
    comment: string
  ): ClassModelInput {
    const scores = input.rubricScores as Record<
      string,
      { score: number; comment: string }
    >;
    return {
      ...input,
      rubricScores: { ...scores, [key]: { ...scores[key], comment } },
    };
  }

  test('a ranked set of strong papers and the feedback on the near misses, for one skill', () => {
    const result = selectHandoffModels(
      [
        student('Ava', { thesis: 5, evidence: 5 }, 'Ava argues haste kills.'),
        student('Ben', { thesis: 4, evidence: 2 }, 'Ben argues the feud.'),
        student('Cy', { thesis: 5, evidence: 3 }, 'Cy argues fate is an excuse.'),
        withComment(
          student('Di', { thesis: 1, evidence: 5 }),
          'thesis',
          'Restates the plot.'
        ),
        withComment(
          student('Eli', { thesis: 2, evidence: 3 }),
          'thesis',
          'Names a topic, not a claim.'
        ),
        student('Fay', { thesis: 3, evidence: 3 }),
      ],
      'thesis',
      TWO_CATEGORY_RUBRIC
    )!;
    expect(result.category).toBe('thesis');
    expect(result.label).toBe('Thesis');
    expect(result.skill).toBe('thesis');
    expect(result.exemplars.map((e) => e.submissionId)).toEqual([
      'sub-Ava',
      'sub-Cy',
      'sub-Ben',
    ]);
    expect(result.exemplars[0].excerpt).toBe('Ava argues haste kills.');
    // Strongest elsewhere first: the near miss shows one fixable problem.
    expect(result.nearMissNotes).toEqual([
      'Restates the plot.',
      'Names a topic, not a claim.',
    ]);
  });

  test('keeps a longer excerpt than the panel snippet', () => {
    const long = 'word '.repeat(200).trim();
    const result = selectHandoffModels(
      [
        student('Ava', { thesis: 5, evidence: 5 }, long),
        student('Ben', { thesis: 1, evidence: 1 }),
      ],
      'thesis',
      TWO_CATEGORY_RUBRIC
    )!;
    expect(result.exemplars[0].excerpt.length).toBeGreaterThan(240);
    expect(result.exemplars[0].excerpt.length).toBeLessThanOrEqual(601);
  });

  test('trims a long feedback note so the planner ask stays short', () => {
    const result = selectHandoffModels(
      [
        student('Ava', { thesis: 5, evidence: 5 }),
        withComment(
          student('Ben', { thesis: 1, evidence: 4 }),
          'thesis',
          'This restates the plot. '.repeat(40)
        ),
      ],
      'thesis',
      TWO_CATEGORY_RUBRIC
    )!;
    expect(result.nearMissNotes[0].length).toBeLessThanOrEqual(301);
  });

  test('null for a category the rubric does not have', () => {
    expect(
      selectHandoffModels(
        [student('Ava', { thesis: 5, evidence: 5 })],
        'grammar',
        TWO_CATEGORY_RUBRIC
      )
    ).toBeNull();
  });
});
