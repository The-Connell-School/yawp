import { describe, expect, test } from 'bun:test';
import {
  classSimulationAssignmentState,
  classSimulationShouldIncludeTutorChat,
  parseSimulatedStudentIndex,
  simulatedStudentEmail,
} from './class-simulation-mix';

describe('classSimulationAssignmentState', () => {
  test('targets about eight in-progress and twelve submitted students per assignment', () => {
    let inProgress = 0;
    let submitted = 0;
    for (let studentIndex = 1; studentIndex <= 20; studentIndex++) {
      const state = classSimulationAssignmentState(studentIndex, 0);
      if (state === 'in_progress') inProgress += 1;
      if (state === 'submitted') submitted += 1;
    }
    expect(inProgress).toBe(8);
    expect(submitted).toBe(12);
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
    const classId = 'clxyz123abc456def';
    const email = simulatedStudentEmail(classId, 7);
    expect(parseSimulatedStudentIndex(email, classId)).toBe(7);
    expect(parseSimulatedStudentIndex(email, 'other-class-id')).toBeNull();
  });

  test('uses the full normalized class id in the address', () => {
    const classId = 'AbC-12_x';
    expect(simulatedStudentEmail(classId, 1)).toBe(
      'sim-abc12x-1@example.test'
    );
  });
});
