import { describe, expect, mock, test } from 'bun:test';

mock.module('~/utils/db.server', () => ({ prisma: {} }));

const { lockedPreviewSampleGradingDefaults } = await import(
  './locked-preview-class-seed.server'
);

describe('lockedPreviewSampleGradingDefaults', () => {
  test('sample Class Starter previews at 10 points and Beginner', () => {
    expect(lockedPreviewSampleGradingDefaults('class_starter')).toEqual({
      submitForGrade: true,
      pointValue: 10,
      gradingAssistantStrictnessLevel: 'beginner',
    });
  });

  test('other free-tier samples keep the 100-point default', () => {
    expect(lockedPreviewSampleGradingDefaults('prewriting').pointValue).toBe(100);
    expect(
      lockedPreviewSampleGradingDefaults('thesis_statement').pointValue
    ).toBe(100);
  });
});
