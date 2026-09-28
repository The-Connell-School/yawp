import { describe, expect, test } from 'bun:test';

import {
  COMPOSITION_TOPIC_SUGGESTIONS,
  buildTopicFallbackPrompts,
  sanitizeCompositionTopic,
} from './composition-topic-prompts';

describe('sanitizeCompositionTopic', () => {
  test('trims, collapses whitespace, and caps length', () => {
    expect(sanitizeCompositionTopic('  women’s   soccer  ')).toBe(
      'women’s soccer'
    );
    expect(sanitizeCompositionTopic('x'.repeat(200))).toHaveLength(80);
  });

  test('rejects empty and school-inappropriate topics', () => {
    expect(sanitizeCompositionTopic('')).toBeNull();
    expect(sanitizeCompositionTopic('   ')).toBeNull();
    expect(sanitizeCompositionTopic('how to buy meth')).toBeNull();
  });
});

describe('buildTopicFallbackPrompts', () => {
  test('every composition lesson has topic templates that mention the topic', () => {
    for (const slug of [
      'topic-sentences',
      'thesis-statements',
      'evidence',
      'analysis',
      'hooks-and-openings',
      'conclusions',
    ]) {
      const prompts = buildTopicFallbackPrompts(slug, 'skateboarding');
      expect(prompts.length).toBeGreaterThanOrEqual(3);
      for (const prompt of prompts) {
        expect(`${prompt.exercise} ${prompt.instruction}`).toContain(
          'skateboarding'
        );
        expect(prompt.id).toContain(slug);
        expect(prompt.exercise.length).toBeGreaterThan(0);
        expect(prompt.instruction.length).toBeGreaterThan(0);
      }
      // Ids are unique within the set.
      expect(new Set(prompts.map((prompt) => prompt.id)).size).toBe(
        prompts.length
      );
    }
  });

  test('returns an empty list for a non-composition slug', () => {
    expect(buildTopicFallbackPrompts('fixing-comma-splices', 'music')).toEqual(
      []
    );
  });
});

describe('COMPOSITION_TOPIC_SUGGESTIONS', () => {
  test('offers a handful of school-appropriate starter chips', () => {
    expect(COMPOSITION_TOPIC_SUGGESTIONS.length).toBeGreaterThanOrEqual(5);
    for (const suggestion of COMPOSITION_TOPIC_SUGGESTIONS) {
      expect(sanitizeCompositionTopic(suggestion)).toBe(suggestion);
    }
  });
});
