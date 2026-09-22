import { describe, expect, test } from 'bun:test';
import {
  buildGradingPromptShape,
  buildGradingResponseSchemaText,
  buildGradingRubricText,
  resolveCategoryFeedbackEnabled,
} from './grading-prompt-shape';
import { DAILY_PAGES_RUBRIC } from '~/domain/assignment-types/daily-pages-rubric';
import { CRISTO_REY_HORNBUCKLE_FIVE_PARAGRAPH_ESSAY } from '~/domain/rubrics/cristo-rey-rubrics';

const thesisCategories = [
  {
    key: 'thesis_and_content',
    label: 'Thesis/Content',
    description: 'Original, defensible thesis.',
    weight: 0.6,
  },
  {
    key: 'grammar_and_mechanics',
    label: 'Grammar/Syntax',
    description: 'Conventions that support clarity.',
    weight: 0.4,
  },
];

describe('resolveCategoryFeedbackEnabled', () => {
  test('is on for a rubric that says nothing, as every rubric did before', () => {
    expect(resolveCategoryFeedbackEnabled(thesisCategories)).toBe(true);
  });

  test('stays on while any single category still wants feedback', () => {
    expect(
      resolveCategoryFeedbackEnabled([
        { ...thesisCategories[0], feedbackEnabled: false },
        thesisCategories[1],
      ])
    ).toBe(true);
  });

  test('is off only when every category opts out', () => {
    expect(
      resolveCategoryFeedbackEnabled(
        thesisCategories.map((category) => ({
          ...category,
          feedbackEnabled: false,
        }))
      )
    ).toBe(false);
  });

  test('is off for the Daily Pages rubric', () => {
    expect(resolveCategoryFeedbackEnabled(DAILY_PAGES_RUBRIC.categories)).toBe(
      false
    );
  });
});

describe('buildGradingResponseSchemaText', () => {
  test('asks for a comment on every category when feedback is on', () => {
    const text = buildGradingResponseSchemaText({
      minScore: 1,
      maxScore: 5,
      categoryFeedbackEnabled: true,
    });

    expect(text).toContain('"comment": string');
    expect(text).toContain('"overallComment": string');
  });

  test('drops the per-category comment field when feedback is off', () => {
    const text = buildGradingResponseSchemaText({
      minScore: 0,
      maxScore: 3,
      categoryFeedbackEnabled: false,
    });

    expect(text).not.toContain('"comment"');
    expect(text).toContain('"overallComment": string');
    expect(text).toContain('"score": 0-3');
  });
});

describe('buildGradingRubricText', () => {
  test('keeps the key, label, weight, and description line', () => {
    expect(buildGradingRubricText(thesisCategories)).toBe(
      'thesis_and_content: Thesis/Content (60%) - Original, defensible thesis.\n' +
        'grammar_and_mechanics: Grammar/Syntax (40%) - Conventions that support clarity.'
    );
  });

  test('spells out the configured word for each score', () => {
    const text = buildGradingRubricText(DAILY_PAGES_RUBRIC.categories);

    expect(text).toContain('engagement: Engagement (100%)');
    expect(text).toContain(
      'Score meanings: 0 = Absent; 1 = Hardly there; 2 = Showed up; 3 = All in'
    );
  });
});

describe('buildGradingPromptShape for the Daily Pages rubric', () => {
  const shape = buildGradingPromptShape({
    categories: DAILY_PAGES_RUBRIC.categories,
    minScore: 0,
    maxScore: 3,
    studentFirstName: 'Jordan',
  });

  test('asks for one engagement judgment and nothing else', () => {
    expect(shape.categoryFeedbackEnabled).toBe(false);
    expect(shape.rubricText).toContain('engagement:');
    expect(shape.rubricText.split('\n')[0]).toContain('Engagement');
  });

  test('asks for overall feedback only', () => {
    expect(shape.systemPrompt).toContain('"overallComment": string');
    expect(shape.systemPrompt).not.toContain('"comment": string');
    expect(shape.systemPrompt.toLowerCase()).toContain(
      'do not write per-category feedback'
    );
  });

  test('never asks for grammar or syntax highlighting', () => {
    const prompt = shape.systemPrompt.toLowerCase();

    expect(prompt).not.toContain('grammar');
    expect(prompt).not.toContain('syntax');
    expect(prompt).not.toContain('highlight');
  });

  test('scores on the configured 0-3 range', () => {
    expect(shape.systemPrompt).toContain('integers 0-3');
  });

  test('keeps teacher observations conservative and private when enabled', () => {
    const teacherShape = buildGradingPromptShape({
      categories: DAILY_PAGES_RUBRIC.categories,
      minScore: 0,
      maxScore: 3,
      studentFirstName: 'Jordan',
      teacherNotesEnabled: true,
    });
    expect(teacherShape.systemPrompt).toContain('internal inconsistencies');
    expect(teacherShape.systemPrompt).toContain('Return null when no clear');
    expect(teacherShape.systemPrompt).toContain('Do not claim or suggest that AI');
    expect(teacherShape.systemPrompt).toContain('private to the teacher');
  });
});

describe('buildGradingPromptShape for a rubric that customizes nothing', () => {
  const shape = buildGradingPromptShape({
    categories: thesisCategories,
    minScore: 1,
    maxScore: 5,
    studentFirstName: 'Jordan',
  });

  test('still asks for a per-category comment', () => {
    expect(shape.categoryFeedbackEnabled).toBe(true);
    expect(shape.systemPrompt).toContain('"comment": string');
    expect(shape.systemPrompt).toContain(
      'Provide concise, actionable comments.'
    );
    expect(shape.systemPrompt).not.toContain('Do not write per-category');
  });
});

describe('buildGradingPromptShape for the Cristo Rey rubric', () => {
  const rubric = CRISTO_REY_HORNBUCKLE_FIVE_PARAGRAPH_ESSAY;
  const shape = buildGradingPromptShape({
    categories: rubric.rubric.categories,
    minScore: rubric.scoringScale.minScore,
    maxScore: rubric.scoringScale.maxScore,
    studentFirstName: 'Jordan',
  });

  test('asks for 1-4 category scores and renders the four source levels', () => {
    expect(shape.systemPrompt).toContain('"score": 1-4');
    expect(shape.rubricText).toContain('4-4 Advanced');
    expect(shape.rubricText).toContain('3-3 Proficient');
    expect(shape.rubricText).toContain('2-2 Developing');
    expect(shape.rubricText).toContain('1-1 Beginning');
    expect(shape.rubricText).not.toMatch(/90-100|80-89|70-79|1-69/);
  });
});
