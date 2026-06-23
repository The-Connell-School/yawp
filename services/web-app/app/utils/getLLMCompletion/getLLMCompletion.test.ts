import { beforeEach, describe, expect, mock, test } from 'bun:test';

const anthropicMessagesCreate = mock();
const llmLogCreate = mock();

mock.module('~/services/anthropic', () => ({
  anthropic: {
    messages: {
      create: anthropicMessagesCreate,
    },
  },
}));

mock.module('~/services/openai', () => ({
  openai: null,
}));

mock.module('~/utils/db.server', () => ({
  prisma: {
    llmLog: {
      create: llmLogCreate,
    },
  },
}));

const { getLLMCompletion } = await import('./getLLMCompletion');

describe('getLLMCompletion', () => {
  beforeEach(() => {
    anthropicMessagesCreate.mockReset();
    llmLogCreate.mockReset();
    anthropicMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Logged response' }],
      usage: { input_tokens: 11, output_tokens: 7 },
    });
  });

  test('logs the exact normalized Anthropic payload with audit metadata', async () => {
    const response = await getLLMCompletion({
      model: 'claude-sonnet-4-6',
      system: 'System\tprompt',
      messages: [
        { role: 'user', content: 'Hello\tstudent' },
        { role: 'assistant', content: 'Prior\treply', name: 'assistant' },
      ],
      metadata: {
        feature: 'tutor',
        kind: 'assignment-module-tutor',
      },
    });

    expect(response).toBe('Logged response');
    expect(anthropicMessagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        system: 'Systemprompt',
        messages: [
          { role: 'user', content: 'Hellostudent' },
          { role: 'assistant', content: 'Priorreply' },
        ],
      })
    );
    expect(llmLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        systemPrompt: 'Systemprompt',
        messages: [
          { role: 'user', content: 'Hellostudent' },
          { role: 'assistant', content: 'Priorreply' },
        ],
        response: 'Logged response',
        inputTokens: 11,
        outputTokens: 7,
        totalTokens: 18,
        metadata: {
          feature: 'tutor',
          kind: 'assignment-module-tutor',
          messageCount: 2,
          messageTextLengths: [12, 10],
          hasTools: false,
          toolRoundCount: 0,
        },
      }),
    });
  });
});
