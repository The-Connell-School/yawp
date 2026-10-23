import { describe, expect, test } from 'bun:test';
import {
  classSimulationAssignmentState,
  classSimulationShouldIncludeTutorChat,
  parseSimulatedStudentIndex,
  simulatedStudentEmail,
} from './class-simulation-mix';

describe('classSimulationAssignmentState', () => {
  test('covers all four states across student and assignment indices', () => {
    const seen = new Set<string>();
    for (let studentIndex = 1; studentIndex <= 20; studentIndex++) {
      for (let assignmentIndex = 0; assignmentIndex < 8; assignmentIndex++) {
        seen.add(classSimulationAssignmentState(studentIndex, assignmentIndex));
      }
    }
    expect(seen.has('not_joined')).toBe(true);
    expect(seen.has('joined')).toBe(true);
    expect(seen.has('in_progress')).toBe(true);
    expect(seen.has('submitted')).toBe(true);
  });

  test('is stable for the same inputs', () => {
    expect(classSimulationAssignmentState(3, 2)).toBe(
      classSimulationAssignmentState(3, 2)
    );
  });
});

describe('classSimulationShouldIncludeTutorChat', () => {
  test('includes roughly thirty percent of indices', () => {
    let count = 0;
    for (let i = 1; i <= 100; i++) {
      if (classSimulationShouldIncludeTutorChat(i)) count++;
    }
    expect(count).toBe(30);
  });
});

describe('simulated student email idempotency', () => {
  test('round-trips index from email', () => {
    const email = simulatedStudentEmail('clxyz123abc', 7);
    expect(parseSimulatedStudentIndex(email)).toBe(7);
  });
});
