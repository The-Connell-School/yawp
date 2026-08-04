import { describe, expect, test } from 'bun:test';
import { parseAssistantMessage } from './parse-assistant-message';

describe('parseAssistantMessage', () => {
  test('returns the whole message and no suggestions when there is no block', () => {
    const { body, suggestions } = parseAssistantMessage('Just a plain reply.');
    expect(body).toBe('Just a plain reply.');
    expect(suggestions).toEqual([]);
  });

  test('extracts suggestions and strips the block from the body', () => {
    const content = [
      'Which class would you like?',
      '',
      '```suggestions',
      'English 10 - Period 3',
      'English 11 - Period 5',
      '```',
    ].join('\n');

    const { body, suggestions } = parseAssistantMessage(content);
    expect(body).toBe('Which class would you like?');
    expect(suggestions).toEqual([
      'English 10 - Period 3',
      'English 11 - Period 5',
    ]);
  });

  test('tolerates bullet markers and blank lines inside the block', () => {
    const content = [
      'Pick one:',
      '```suggestions',
      '- Ada Lovelace',
      '',
      '* Grace Hopper',
      '```',
    ].join('\n');

    const { suggestions } = parseAssistantMessage(content);
    expect(suggestions).toEqual(['Ada Lovelace', 'Grace Hopper']);
  });

  test('keeps body content that appears before and after the block', () => {
    const content = 'Intro.\n```suggestions\nOption A\n```\nOutro.';
    const { body, suggestions } = parseAssistantMessage(content);
    expect(suggestions).toEqual(['Option A']);
    expect(body).toContain('Intro.');
    expect(body).toContain('Outro.');
    expect(body).not.toContain('suggestions');
  });
});
