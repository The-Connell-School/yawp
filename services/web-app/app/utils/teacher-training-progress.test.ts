import { describe, expect, it } from 'bun:test';
import {
  getTeacherTrainingProgressPercent,
  isTeacherTrainingModuleComplete,
} from './teacher-training-progress';

describe('teacher training progress helpers', () => {
  it('returns zero percent when a module has no usable video duration', () => {
    expect(getTeacherTrainingProgressPercent(0, null)).toBe(0);
    expect(getTeacherTrainingProgressPercent(15, 0)).toBe(0);
    expect(getTeacherTrainingProgressPercent(15, -1)).toBe(0);
  });

  it('rounds watched progress up and clamps impossible values', () => {
    expect(getTeacherTrainingProgressPercent(1, 60)).toBe(2);
    expect(getTeacherTrainingProgressPercent(30, 60)).toBe(50);
    expect(getTeacherTrainingProgressPercent(90, 60)).toBe(100);
    expect(getTeacherTrainingProgressPercent(-5, 60)).toBe(0);
  });

  it('requires a positive duration before marking a module complete', () => {
    expect(isTeacherTrainingModuleComplete(0, null)).toBe(false);
    expect(isTeacherTrainingModuleComplete(0, 0)).toBe(false);
    expect(isTeacherTrainingModuleComplete(59, 60)).toBe(false);
    expect(isTeacherTrainingModuleComplete(60, 60)).toBe(true);
  });
});
