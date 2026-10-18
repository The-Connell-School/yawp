import { describe, expect, test } from 'bun:test';
import { matchTrainingVideos, type TrainingVideoCandidate } from './assignment-videos';

const video = (courseTitle: string, moduleTitle: string, id = moduleTitle): TrainingVideoCandidate => ({
  moduleId: id,
  courseId: `course-${courseTitle}`,
  courseTitle,
  moduleTitle,
});

const thesisSteps = [
  { id: 'step-prewriting', title: 'Pre-writing' },
  { id: 'step-thesis', title: 'Thesis Statement' },
  { id: 'step-body', title: 'Body Paragraphs' },
];

describe('training videos on the assignment page', () => {
  test("each Thesis-Driven Essay lesson's video goes with the step it teaches", () => {
    const result = matchTrainingVideos(thesisSteps, [
      video('The Thesis-Driven Essay', 'Lesson 2: Pre-writing'),
      video('The Thesis-Driven Essay', 'Lesson 3: Writing a Thesis Statement'),
    ]);
    expect(result.byStepId['step-prewriting']?.moduleTitle).toBe('Lesson 2: Pre-writing');
    expect(result.byStepId['step-thesis']?.moduleTitle).toBe('Lesson 3: Writing a Thesis Statement');
    expect(result.byStepId['step-body']).toBeUndefined();
  });

  test('Day 1 has no step of its own; its video goes before the first one', () => {
    const result = matchTrainingVideos(thesisSteps, [
      video('Thesis-Driven Essay', 'Lesson 1: Introduce Students to YAWP!'),
    ]);
    expect(result.dayOne?.moduleTitle).toBe('Lesson 1: Introduce Students to YAWP!');
    expect(Object.keys(result.byStepId)).toEqual([]);
  });

  test('outside the thesis course, a module named like the step matches it', () => {
    const result = matchTrainingVideos(
      [{ id: 'step-1', title: 'Exit Ticket' }],
      [video('Quick Writes', 'Lesson 4: Exit Ticket'), video('Quick Writes', 'Something else')]
    );
    expect(result.byStepId['step-1']?.moduleTitle).toBe('Lesson 4: Exit Ticket');
  });

  test('a lesson with no step, or a step with no lesson, shows nothing', () => {
    const result = matchTrainingVideos(thesisSteps, [video('The Thesis-Driven Essay', 'Lesson 8: Review my Essay (optional)')]);
    expect(result).toEqual({ dayOne: null, byStepId: {} });
  });

  test('the first video wins when two courses teach the same step', () => {
    const result = matchTrainingVideos(thesisSteps, [
      video('The Thesis-Driven Essay', 'Lesson 2: Pre-writing', 'first'),
      video('The Thesis-Driven Essay', 'Lesson 2: Pre-writing again', 'second'),
    ]);
    expect(result.byStepId['step-prewriting']?.moduleId).toBe('first');
  });
});
