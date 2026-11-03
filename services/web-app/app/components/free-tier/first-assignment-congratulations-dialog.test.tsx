import { describe, expect, test } from 'bun:test';
import {
  celebrationLeadSentence,
  type FirstAssignmentCelebrationPreview,
} from './first-assignment-congratulations-dialog';

const preview: FirstAssignmentCelebrationPreview = {
  assignmentId: 'assignment-1',
  classId: 'class-1',
  title: 'Argumentative essay: should school start later?',
  assignmentTypeId: 'type-1',
  dueAt: '2026-11-06T00:00:00.000Z',
  classDisplayName: 'English 10, period 3',
};

describe('first assignment congratulations callout', () => {
  test('uses Design lead sentence pattern', () => {
    expect(celebrationLeadSentence(preview)).toBe(
      'The argumentative essay: should school start later? is live for English 10, period 3. Two things to do next:'
    );
  });
});
