import { describe, expect, test } from 'bun:test';
import {
  classSimulationClearSuccessMessage,
  classSimulationPopulateSuccessMessage,
} from './class-simulation-copy';

describe('classSimulationPopulateSuccessMessage', () => {
  test('formats assignment counts for zero, one, and many', () => {
    expect(
      classSimulationPopulateSuccessMessage({ students: 20, assignments: 0 })
    ).toBe('Added 20 students across 0 assignments.');
    expect(
      classSimulationPopulateSuccessMessage({ students: 20, assignments: 1 })
    ).toBe('Added 20 students across 1 assignment.');
    expect(
      classSimulationPopulateSuccessMessage({ students: 20, assignments: 3 })
    ).toBe('Added 20 students across 3 assignments.');
  });

  test('coerces numeric strings and never emits a stray question mark', () => {
    const message = classSimulationPopulateSuccessMessage({
      students: '20' as unknown as number,
      assignments: '1' as unknown as number,
    });
    expect(message).toBe('Added 20 students across 1 assignment.');
    expect(message).not.toMatch(/\?\s*assignments/);
    expect(message).not.toContain('?');
  });
});

describe('classSimulationClearSuccessMessage', () => {
  test('formats cleared student counts for singular and plural', () => {
    expect(classSimulationClearSuccessMessage(1)).toBe(
      'Cleared 1 simulated student.'
    );
    expect(classSimulationClearSuccessMessage(4)).toBe(
      'Cleared 4 simulated students.'
    );
  });
});
