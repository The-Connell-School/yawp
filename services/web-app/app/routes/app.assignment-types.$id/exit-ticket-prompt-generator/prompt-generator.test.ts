import { describe, expect, test } from 'bun:test';
import {
  buildExitTicketGeneratorSystemPrompt,
  ExitTicketGeneratorResponseSchema,
  GENERATOR_OPTION_COUNT,
} from './prompt-generator';

describe('exit ticket prompt generator', () => {
  test('asks for one explainable question per draft', () => {
    const system = buildExitTicketGeneratorSystemPrompt();
    expect(system).toContain('ONE thing');
    expect(system).toContain(String(GENERATOR_OPTION_COUNT));
  });

  test('parses structured options', () => {
    const parsed = ExitTicketGeneratorResponseSchema.parse({
      reply: 'Here are three checks.',
      options: [
        { prompt: 'Explain the main idea from today in your own words.' },
        {
          prompt: 'What is still unclear about the symbol we tracked?',
          focusHint: 'ask-question',
        },
      ],
    });
    expect(parsed.options).toHaveLength(2);
  });
});
