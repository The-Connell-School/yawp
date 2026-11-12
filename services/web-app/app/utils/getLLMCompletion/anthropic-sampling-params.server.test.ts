import { describe, expect, test } from 'bun:test';
import {
  anthropicModelRejectsCustomSampling,
  anthropicSamplingParams,
} from './anthropic-sampling-params.server';

describe('anthropicModelRejectsCustomSampling', () => {
  test('rejects Claude 5.x model ids', () => {
    expect(anthropicModelRejectsCustomSampling('claude-sonnet-5-5')).toBe(true);
    expect(anthropicModelRejectsCustomSampling('claude-haiku-5-5')).toBe(true);
  });

  test('allows Claude 4.x and legacy ids', () => {
    expect(anthropicModelRejectsCustomSampling('claude-sonnet-4-6')).toBe(false);
    expect(anthropicModelRejectsCustomSampling('claude-3-5-sonnet-20240620')).toBe(
      false
    );
  });
});

describe('anthropicSamplingParams', () => {
  test('omits temperature for 5.x models', () => {
    expect(anthropicSamplingParams('claude-sonnet-5-5', undefined)).toEqual({});
    expect(anthropicSamplingParams('claude-sonnet-5-5', 0.2)).toEqual({});
  });

  test('defaults temperature to 0.6 for models that accept it', () => {
    expect(anthropicSamplingParams('claude-sonnet-4-6', undefined)).toEqual({
      temperature: 0.6,
    });
  });

  test('passes explicit temperature for models that accept it', () => {
    expect(anthropicSamplingParams('claude-sonnet-4-6', 0.2)).toEqual({
      temperature: 0.2,
    });
  });
});
