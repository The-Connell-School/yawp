import { describe, expect, test } from 'bun:test';
import {
  buildApExtractionSystemPrompt,
  buildApExtractionUserPrompt,
  parseApExtractionResult,
} from './ap-prompt-parser';

describe('buildApExtractionSystemPrompt', () => {
  test('synthesis prompt mentions sources array', () => {
    const prompt = buildApExtractionSystemPrompt('synthesis');
    expect(prompt).toContain('"sources"');
    expect(prompt).toContain('"label"');
    expect(prompt).toContain('"attribution"');
  });

  test('argument prompt does not mention sources', () => {
    const prompt = buildApExtractionSystemPrompt('argument');
    expect(prompt).not.toContain('"sources"');
  });

  test('poetry-analysis prompt mentions line breaks', () => {
    const prompt = buildApExtractionSystemPrompt('poetry-analysis');
    expect(prompt.toLowerCase()).toContain('line break');
  });
});

describe('buildApExtractionUserPrompt', () => {
  test('returns a string for each essay type', () => {
    const types = [
      'synthesis',
      'rhetorical-analysis',
      'argument',
      'poetry-analysis',
      'prose-fiction-analysis',
      'literary-argument',
    ] as const;
    for (const type of types) {
      expect(typeof buildApExtractionUserPrompt(type)).toBe('string');
      expect(buildApExtractionUserPrompt(type).length).toBeGreaterThan(10);
    }
  });
});

describe('parseApExtractionResult', () => {
  test('parses a synthesis result with sources', () => {
    const result = parseApExtractionResult({
      title: 'Technology and Privacy',
      prompt: 'Synthesize at least three sources...',
      sources: [
        {
          label: 'Source A',
          title: 'Digital Surveillance',
          attribution: 'Smith, 2023',
          body: 'The rise of digital surveillance...',
          confidence: 'high',
        },
        {
          label: 'Source B',
          body: 'Privacy advocates argue...',
        },
      ],
      year: 2023,
    });

    expect(result.prompt).toBe('Synthesize at least three sources...');
    expect(result.sources).toHaveLength(2);
    expect(result.sources![0].label).toBe('Source A');
    expect(result.sources![0].confidence).toBe('high');
    expect(result.year).toBe(2023);
  });

  test('parses an argument result without sources', () => {
    const result = parseApExtractionResult({
      prompt: 'Write an essay arguing your position...',
    });
    expect(result.prompt).toBe('Write an essay arguing your position...');
    expect(result.sources).toBeUndefined();
  });

  test('parses a poetry result with poet', () => {
    const result = parseApExtractionResult({
      prompt: 'Analyze the poem...',
      sources: [
        {
          label: 'Poem',
          title: 'The Road Not Taken',
          attribution: 'Robert Frost, 1916',
          body: 'Two roads diverged in a yellow wood,\nAnd sorry I could not travel both',
        },
      ],
      poet: 'Robert Frost',
    });
    expect(result.poet).toBe('Robert Frost');
    expect(result.sources![0].body).toContain('\n');
  });

  test('rejects missing prompt', () => {
    expect(() => parseApExtractionResult({ title: 'No prompt' })).toThrow();
  });

  test('rejects empty prompt', () => {
    expect(() => parseApExtractionResult({ prompt: '' })).toThrow();
  });
});
