import { describe, expect, test } from 'bun:test';
import {
  applyGradingAssistantStrictnessToActComposite,
  applyGradingAssistantStrictnessToPercentage,
} from './grading-assistant-strictness';

describe('applyGradingAssistantStrictnessToPercentage', () => {
  test('leaves intermediate grades unchanged', () => {
    expect(applyGradingAssistantStrictnessToPercentage(77, 'intermediate')).toBe(
      77
    );
  });

  test('raises beginner grades by five points', () => {
    expect(applyGradingAssistantStrictnessToPercentage(77, 'beginner')).toBe(82);
  });

  test('lowers advanced grades by five points', () => {
    expect(applyGradingAssistantStrictnessToPercentage(77, 'advanced')).toBe(72);
  });

  test('clamps adjusted grades to 0-100', () => {
    expect(applyGradingAssistantStrictnessToPercentage(98, 'beginner')).toBe(
      100
    );
    expect(applyGradingAssistantStrictnessToPercentage(2, 'advanced')).toBe(0);
  });
});

describe('applyGradingAssistantStrictnessToActComposite', () => {
  test('leaves intermediate ACT composites unchanged', () => {
    expect(applyGradingAssistantStrictnessToActComposite(10, 'intermediate')).toBe(
      10
    );
  });

  test('raises beginner ACT composites by one point', () => {
    expect(applyGradingAssistantStrictnessToActComposite(10, 'beginner')).toBe(
      11
    );
  });

  test('lowers advanced ACT composites by one point', () => {
    expect(applyGradingAssistantStrictnessToActComposite(10, 'advanced')).toBe(
      9
    );
  });

  test('clamps adjusted ACT composites to 2-12', () => {
    expect(applyGradingAssistantStrictnessToActComposite(12, 'beginner')).toBe(
      12
    );
    expect(applyGradingAssistantStrictnessToActComposite(2, 'advanced')).toBe(2);
  });
});
