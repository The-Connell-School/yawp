import { describe, expect, test } from 'bun:test';
import { aggregateRubricPerformance } from './aggregate-rubric-performance';
import {
  buildInsightPrompt,
  parseInsightResponse,
} from './class-insight-synthesis';

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
      sampleAggregate
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
    const result = parseInsightResponse(wrapped, sampleAggregate);
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
      sampleAggregate
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
      sampleAggregate
    );
    expect(result!.categories[0].status).toBe('mixed');
  });

  test('returns null when there is no parseable object', () => {
    expect(parseInsightResponse('the model refused', sampleAggregate)).toBeNull();
  });

  test('returns null when required fields are missing', () => {
    expect(
      parseInsightResponse(JSON.stringify({ foo: 'bar' }), sampleAggregate)
    ).toBeNull();
  });
});
