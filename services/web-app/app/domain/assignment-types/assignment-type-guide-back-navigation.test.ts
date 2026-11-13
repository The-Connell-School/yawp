import { expect, test } from 'bun:test';
import { assignmentTypeGuideBackNavigation } from './assignment-type-guide-back-navigation';

test('locked preview returns dashboard back target', () => {
  expect(
    assignmentTypeGuideBackNavigation(
      true,
      '/app/assignment-types/thesis',
      'Thesis Statement'
    )
  ).toEqual({ backTo: '/app', backLabel: 'Back to home' });
});

test('unlocked teachers return the assignment type page', () => {
  expect(
    assignmentTypeGuideBackNavigation(
      false,
      '/app/assignment-types/thesis',
      'Thesis Statement'
    )
  ).toEqual({
    backTo: '/app/assignment-types/thesis',
    backLabel: 'Back to Thesis Statement',
  });
});
