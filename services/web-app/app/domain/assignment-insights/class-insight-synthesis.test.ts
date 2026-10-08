import { describe, expect, test } from 'bun:test';
import { aggregateRubricPerformance } from './aggregate-rubric-performance';
import {
  buildInsightPrompt,
  parseInsightResponse,
} from './class-insight-synthesis';
import { DEFAULT_INSIGHT_RUBRIC, type InsightRubric } from './insight-rubric';

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


const sampleAggregate = aggregateRubricPerformance([
  {
    submissionId: 'a',
    rubricScores: {
      thesis_and_content: { score: 5, comment: 'Sharp, arguable thesis.' },
      evidence_and_support: {
        score: 2,
        comment: 'Quotes dropped in, not analyzed.',
      },
    },
  },
  {
    submissionId: 'b',
    rubricScores: {
      thesis_and_content: { score: 4, comment: 'Clear claim.' },
      evidence_and_support: {
        score: 2,
        comment: 'Needs to explain the evidence.',
      },
    },
  },
]);

describe('buildInsightPrompt', () => {
  test('includes class context, counts, and per-category averages', () => {
    const { system, user } = buildInsightPrompt(sampleAggregate, {
      assignmentTitle: 'Macbeth Essay',
      className: 'Period 3 English',
    });

    expect(system).toMatch(/JSON/);
    expect(system.toLowerCase()).toMatch(/next step/);
    expect(user).toContain('Macbeth Essay');
    expect(user).toContain('Period 3 English');
    expect(user).toContain('2 submissions');
    expect(user).toContain('Thesis/Content');
    expect(user).toContain('Evidence/Support');
  });

  test('never sends free-text grader comments to the model', () => {
    const { user } = buildInsightPrompt(sampleAggregate, {});
    expect(user).not.toContain('Quotes dropped in, not analyzed.');
    expect(user).not.toContain('Sharp, arguable thesis.');
    expect(user).not.toContain('Clear claim.');
    expect(user).toContain('avg 2.00 / 5');
  });

  test('enumerates the valid rubric category keys for tagging next steps', () => {
    const { system } = buildInsightPrompt(sampleAggregate, {});
    expect(system).toContain('evidence_and_support');
  });
});

/**
 * A fifteen-minute cold write and a revised essay should not get the same
 * next steps. The summary is told the conditions the class wrote under, so it
 * reads the scores as what they are and speaks to the skill practiced.
 */
describe('buildInsightPrompt writing conditions', () => {
  const plain = buildInsightPrompt(sampleAggregate, {
    className: 'English 9',
    assignmentTitle: 'Juliet argues with a name',
  });

  test('is unchanged when no conditions are known', () => {
    expect(
      buildInsightPrompt(sampleAggregate, {
        className: 'English 9',
        assignmentTitle: 'Juliet argues with a name',
        assignmentTypeTitle: null,
        coldWrite: false,
        grammarGraded: null,
      })
    ).toEqual(plain);
    expect(plain.system).not.toContain('writing conditions');
  });

  const conditioned = buildInsightPrompt(sampleAggregate, {
    className: 'English 9',
    assignmentTitle: 'Juliet argues with a name',
    assignmentTypeTitle: 'Daily Pages',
    coldWrite: true,
    grammarGraded: false,
  });

  test('names the assignment type', () => {
    expect(conditioned.user).toContain('Assignment type: Daily Pages');
  });

  test('names a cold write and says not to recommend the tutor for it', () => {
    expect(conditioned.user).toContain('cold write');
    expect(conditioned.system).toContain('cold write');
    expect(conditioned.system.toLowerCase()).toContain('tutor');
  });

  test('says grammar was not graded, so no step targets it', () => {
    expect(conditioned.user).toContain('Grammar: not graded');
  });

  test('asks for next steps suited to the conditions', () => {
    expect(conditioned.system).toContain('writing conditions');
  });

  // Daily Pages paragraph type and writing time were removed: the summary is
  // never told about either, and never asked to read for them.
  test('never mentions a paragraph type or a writing time', () => {
    for (const prompt of [plain, conditioned]) {
      const text = `${prompt.system}\n${prompt.user}`.toLowerCase();
      expect(text).not.toContain('paragraph type');
      expect(text).not.toContain('writing time');
      expect(text).not.toContain('timed piece');
    }
  });
});

describe('parseInsightResponse', () => {
  const validPayload = {
    overview:
      'The class writes strong theses but struggles to analyze evidence.',
    categories: [
      {
        key: 'thesis_and_content',
        status: 'strength',
        summary: 'Nearly every student opened with a clear, arguable claim.',
      },
      {
        key: 'evidence_and_support',
        status: 'gap',
        summary: 'Most quotes are dropped in without analysis.',
      },
    ],
    nextSteps: [
      {
        title: 'Model quote analysis',
        detail: 'Do a whole-class think-aloud unpacking one quotation.',
        rubricCategory: 'evidence_and_support',
      },
    ],
  };

  test('parses a well-formed payload', () => {
    const result = parseInsightResponse(
      JSON.stringify(validPayload),
      DEFAULT_INSIGHT_RUBRIC
    );
    expect(result).not.toBeNull();
    expect(result!.overview).toContain('strong theses');
    expect(result!.categories).toHaveLength(2);
    expect(result!.nextSteps[0].rubricCategory).toBe('evidence_and_support');
  });

  test('tolerates prose wrapped around the JSON', () => {
    const wrapped = `Here is the summary:\n\n${JSON.stringify(
      validPayload
    )}\n\nHope that helps!`;
    const result = parseInsightResponse(wrapped, DEFAULT_INSIGHT_RUBRIC);
    expect(result).not.toBeNull();
    expect(result!.categories).toHaveLength(2);
  });

  test('drops categories and next steps with invalid rubric keys', () => {
    const result = parseInsightResponse(
      JSON.stringify({
        overview: 'ok',
        categories: [
          { key: 'not_a_real_key', status: 'gap', summary: 'x' },
          { key: 'thesis_and_content', status: 'strength', summary: 'y' },
        ],
        nextSteps: [
          { title: 'a', detail: 'b', rubricCategory: 'made_up' },
          { title: 'c', detail: 'd', rubricCategory: 'thesis_and_content' },
        ],
      }),
      DEFAULT_INSIGHT_RUBRIC
    );
    expect(result!.categories.map((c) => c.key)).toEqual([
      'thesis_and_content',
    ]);
    expect(result!.nextSteps).toHaveLength(1);
    expect(result!.nextSteps[0].rubricCategory).toBe('thesis_and_content');
  });

  test('coerces an unknown status to "mixed"', () => {
    const result = parseInsightResponse(
      JSON.stringify({
        overview: 'ok',
        categories: [
          { key: 'thesis_and_content', status: 'whatever', summary: 'y' },
        ],
        nextSteps: [],
      }),
      DEFAULT_INSIGHT_RUBRIC
    );
    expect(result!.categories[0].status).toBe('mixed');
  });

  test('returns null when there is no parseable object', () => {
    expect(parseInsightResponse('the model refused', DEFAULT_INSIGHT_RUBRIC)).toBeNull();
  });

  test('returns null when required fields are missing', () => {
    expect(
      parseInsightResponse(JSON.stringify({ foo: 'bar' }), DEFAULT_INSIGHT_RUBRIC)
    ).toBeNull();
  });
});

describe('synthesis against an assignment type’s own rubric', () => {
  const aggregate = {
    submissionCount: 3,
    categories: [
      {
        key: 'budget',
        label: 'Budget',
        weight: 0.5,
        averageScore: 88,
        scoredCount: 3,
        distribution: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 2 } as Record<1 | 2 | 3 | 4 | 5, number>,
        lowCount: 0,
        highCount: 3,
        sampleComments: [],
      },
    ],
    strongest: 'budget',
    weakest: 'budget',
  };

  test('offers the model this rubric’s keys, not the default five', () => {
    const { system } = buildInsightPrompt(aggregate, {}, GBA_RUBRIC);

    expect(system).toContain('budget, recommendation');
    expect(system).not.toContain('thesis_and_content');
  });

  test('states the range and thresholds the category is actually marked in', () => {
    // Told "strong (>=4)" about scores out of 100, the model reads the class
    // backwards.
    const { user } = buildInsightPrompt(aggregate, {}, GBA_RUBRIC);

    expect(user).toContain('avg 88.00 / 100');
    expect(user).toContain('strong (>=75)');
    expect(user).toContain('struggling (<=25)');
  });

  test('names the strongest category from this rubric', () => {
    const { user } = buildInsightPrompt(aggregate, {}, GBA_RUBRIC);

    expect(user).toContain('strongest category: Budget');
  });

  test('keeps a reply about this rubric’s categories and drops the rest', () => {
    const summary = parseInsightResponse(
      JSON.stringify({
        overview: 'Strong on costing.',
        categories: [
          { key: 'budget', status: 'strength', summary: 'Costed honestly.' },
          { key: 'thesis_and_content', status: 'gap', summary: 'Not on this rubric.' },
        ],
        nextSteps: [
          { title: 'Push the call', detail: 'Ask for a decision.', rubricCategory: 'recommendation' },
          { title: 'Off-rubric', detail: 'Nope.', rubricCategory: 'voice_and_style' },
        ],
      }),
      GBA_RUBRIC
    );

    expect(summary?.categories).toEqual([
      { key: 'budget', label: 'Budget', status: 'strength', summary: 'Costed honestly.' },
    ]);
    expect(summary?.nextSteps).toEqual([
      { title: 'Push the call', detail: 'Ask for a decision.', rubricCategory: 'recommendation' },
    ]);
  });
});
