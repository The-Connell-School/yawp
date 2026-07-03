import { beforeEach, describe, expect, mock, test } from 'bun:test';

const anthropicCreate = mock();
const openAiCreate = mock();
const llmLogCreate = mock();

mock.module('~/services/anthropic', () => ({
  anthropic: {
    messages: {
      create: anthropicCreate,
    },
  },
}));

mock.module('~/services/openai', () => ({
  openai: {
    chat: {
      completions: {
        create: openAiCreate,
      },
    },
  },
}));

mock.module('~/utils/db.server', () => ({
  prisma: {
    llmLog: {
      create: llmLogCreate,
    },
  },
}));

const { getLLMCompletion } = await import('./getLLMCompletion');
const {
  isAnthropicOutageCircuitOpen,
  markAnthropicOutageOpen,
  resetAnthropicOutageForTest,
} = await import('./anthropic-outage-cache.server');
const {
  LlmFallbackRetrySignal,
  isLlmFallbackRetrySignal,
} = await import('./llm-provider-errors.server');

function anthropicTextResponse(content: string) {
  return {
    content: [{ type: 'text', text: content }],
    usage: { input_tokens: 11, output_tokens: 7 },
  };
}

function openAiTextResponse(content: string) {
  return {
    choices: [{ message: { content } }],
    usage: {
      prompt_tokens: 11,
      completion_tokens: 7,
      total_tokens: 18,
    },
  };
}

describe('getLLMCompletion', () => {
  beforeEach(() => {
    anthropicCreate.mockReset();
    openAiCreate.mockReset();
    llmLogCreate.mockReset();
    resetAnthropicOutageForTest();
    process.env.OPENAI_FALLBACK_MODEL = 'gpt-4o-mini';
    delete process.env.ANTHROPIC_OUTAGE_FALLBACK_ENABLED;
    anthropicCreate.mockResolvedValue(anthropicTextResponse('Logged response'));
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
    expect(anthropicCreate).toHaveBeenCalledWith(
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

  test('falls back to gpt-4o-mini and opens the circuit after Anthropic 529', async () => {
    const anthropicError = Object.assign(new Error('Overloaded'), {
      status: 529,
    });
    anthropicCreate.mockRejectedValueOnce(anthropicError);
    openAiCreate.mockResolvedValueOnce(openAiTextResponse('Fallback reply.'));

    const result = await getLLMCompletion({
      model: 'claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'Help with my thesis.' }],
      system: 'Be a writing tutor.',
      maxTokens: 100,
      metadata: { feature: 'tutor' },
    });

    expect(result).toBe('Fallback reply.');
    expect(anthropicCreate).toHaveBeenCalledTimes(1);
    expect(openAiCreate).toHaveBeenCalledTimes(1);
    expect(openAiCreate.mock.calls[0]?.[0]).toMatchObject({
      model: 'gpt-4o-mini',
      max_tokens: 100,
    });
    expect(isAnthropicOutageCircuitOpen()).toBe(true);
    expect(llmLogCreate).toHaveBeenCalledTimes(2);
    expect(llmLogCreate.mock.calls[1]?.[0].data.metadata).toMatchObject({
      feature: 'tutor',
      fallbackTriggered: true,
      fallbackReason: 'status:529',
      fallbackModel: 'gpt-4o-mini',
      primaryModel: 'claude-sonnet-4-6',
      messageCount: 2,
      hasTools: false,
      toolRoundCount: 0,
    });
  });

  test('skips Anthropic when the circuit is already open', async () => {
    markAnthropicOutageOpen({
      reason: 'status:504',
      ttlMs: 300_000,
    });
    openAiCreate.mockResolvedValueOnce(openAiTextResponse('Still working.'));

    const result = await getLLMCompletion({
      model: 'claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'Can you review this?' }],
    });

    expect(result).toBe('Still working.');
    expect(anthropicCreate).not.toHaveBeenCalled();
    expect(openAiCreate).toHaveBeenCalledTimes(1);
    expect(llmLogCreate.mock.calls[0]?.[0].data.metadata).toMatchObject({
      anthropicCircuitOpen: true,
      fallbackTriggered: true,
      messageCount: 1,
      hasTools: false,
      toolRoundCount: 0,
    });
  });

  test('signals route-level retry instead of calling OpenAI when requested', async () => {
    markAnthropicOutageOpen({
      reason: 'status:529',
      ttlMs: 300_000,
    });

    let thrown: unknown;
    try {
      await getLLMCompletion({
        model: 'claude-sonnet-4-6',
        messages: [{ role: 'user', content: 'Retry this.' }],
        signalFallbackRetry: true,
      });
    } catch (error) {
      thrown = error;
    }

    expect(isLlmFallbackRetrySignal(thrown)).toBe(true);
    expect(thrown).toBeInstanceOf(LlmFallbackRetrySignal);
    expect(
      (thrown as InstanceType<typeof LlmFallbackRetrySignal>).fallbackModel
    ).toBe('gpt-4o-mini');
    expect(anthropicCreate).not.toHaveBeenCalled();
    expect(openAiCreate).not.toHaveBeenCalled();
  });

  test('resolves tutor document tool calls through OpenAI fallback', async () => {
    markAnthropicOutageOpen({
      reason: 'status:529',
      ttlMs: 300_000,
    });
    openAiCreate
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: {
                    name: 'read_student_document',
                    arguments: '{}',
                  },
                },
              ],
            },
          },
        ],
        usage: {
          prompt_tokens: 12,
          completion_tokens: 3,
          total_tokens: 15,
        },
      })
      .mockResolvedValueOnce(openAiTextResponse('Use a more specific thesis.'));
    const handleToolCall = mock(async () => 'Current essay draft.');

    const result = await getLLMCompletion({
      model: 'claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'Review my essay.' }],
      tools: [
        {
          name: 'read_student_document',
          description: 'Reads the current document draft.',
          input_schema: { type: 'object', properties: {} },
        },
      ],
      handleToolCall,
    });

    expect(result).toBe('Use a more specific thesis.');
    expect(handleToolCall).toHaveBeenCalledWith('read_student_document', {});
    expect(openAiCreate).toHaveBeenCalledTimes(2);
    expect(openAiCreate.mock.calls[0]?.[0].tools).toEqual([
      {
        type: 'function',
        function: {
          name: 'read_student_document',
          description: 'Reads the current document draft.',
          parameters: { type: 'object', properties: {} },
        },
      },
    ]);
    expect(openAiCreate.mock.calls[1]?.[0].messages).toContainEqual({
      role: 'tool',
      tool_call_id: 'call_1',
      content: 'Current essay draft.',
    });
    expect(llmLogCreate.mock.calls[0]?.[0].data.metadata).toMatchObject({
      fallbackTriggered: true,
      toolRoundCount: 1,
      hasTools: true,
    });
  });
});
