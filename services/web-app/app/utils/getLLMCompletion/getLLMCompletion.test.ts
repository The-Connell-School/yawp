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
const { LlmFallbackRetrySignal, isLlmFallbackRetrySignal } =
  await import('./llm-provider-errors.server');

function anthropicTextResponse(
  content: string,
  usageOverrides: Record<string, number> = {}
) {
  return {
    content: [{ type: 'text', text: content }],
    usage: { input_tokens: 11, output_tokens: 7, ...usageOverrides },
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
          cacheCreationInputTokens: 0,
          cacheReadInputTokens: 0,
        },
      }),
    });
  });

  test('passes structured system blocks with cache_control straight through to Anthropic, tab-stripped', async () => {
    await getLLMCompletion({
      model: 'claude-sonnet-4-6',
      system: [
        {
          type: 'text',
          text: 'Static\tprefix',
          cache_control: { type: 'ephemeral' },
        },
        { type: 'text', text: 'Per-conversation\tsuffix' },
      ],
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(anthropicCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        system: [
          {
            type: 'text',
            text: 'Staticprefix',
            cache_control: { type: 'ephemeral' },
          },
          { type: 'text', text: 'Per-conversationsuffix' },
        ],
      })
    );
    // The flattened log column keeps every block's text so the audit trail
    // still reads as one prompt.
    expect(llmLogCreate.mock.calls[0]?.[0].data.systemPrompt).toBe(
      'Staticprefix\n\nPer-conversationsuffix'
    );
  });

  test('logs cache creation and cache read token counts reported by Anthropic', async () => {
    anthropicCreate.mockResolvedValueOnce(
      anthropicTextResponse('Cached response', {
        cache_creation_input_tokens: 812,
        cache_read_input_tokens: 0,
      })
    );

    await getLLMCompletion({
      model: 'claude-sonnet-4-6',
      system: [
        {
          type: 'text',
          text: 'A'.repeat(4000),
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: 'First turn' }],
    });

    expect(llmLogCreate.mock.calls[0]?.[0].data.metadata).toMatchObject({
      cacheCreationInputTokens: 812,
      cacheReadInputTokens: 0,
    });

    llmLogCreate.mockReset();
    anthropicCreate.mockResolvedValueOnce(
      anthropicTextResponse('Cached response 2', {
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 812,
      })
    );

    await getLLMCompletion({
      model: 'claude-sonnet-4-6',
      system: [
        {
          type: 'text',
          text: 'A'.repeat(4000),
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: 'Second turn, same prefix' }],
    });

    expect(llmLogCreate.mock.calls[0]?.[0].data.metadata).toMatchObject({
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 812,
    });
  });

  test('sums cache token counts across a multi-round tool-use loop', async () => {
    anthropicCreate
      .mockResolvedValueOnce({
        content: [
          {
            type: 'tool_use',
            id: 'tool-1',
            name: 'get_student',
            input: { student: 'Ada Lovelace' },
          },
        ],
        stop_reason: 'tool_use',
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          cache_creation_input_tokens: 500,
          cache_read_input_tokens: 0,
        },
      })
      .mockResolvedValueOnce(
        anthropicTextResponse('Ada needs support.', {
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 500,
        })
      );

    await getLLMCompletion({
      model: 'claude-sonnet-4-6',
      system: [
        {
          type: 'text',
          text: 'Tool-using system prompt',
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: 'Tell me about Ada Lovelace.' }],
      tools: [
        {
          name: 'get_student',
          description: 'Fetches a student.',
          input_schema: { type: 'object', properties: {} },
        },
      ],
      handleToolCall: mock(async () =>
        JSON.stringify({ essay: 'Confidential essay text.' })
      ),
    });

    expect(llmLogCreate.mock.calls[0]?.[0].data.metadata).toMatchObject({
      cacheCreationInputTokens: 500,
      cacheReadInputTokens: 500,
    });
  });

  test('supports metadata-only audit logs for sensitive prompts and tool results', async () => {
    anthropicCreate
      .mockResolvedValueOnce({
        content: [
          {
            type: 'tool_use',
            id: 'tool-1',
            name: 'get_student',
            input: { student: 'Ada Lovelace' },
          },
        ],
        stop_reason: 'tool_use',
        usage: { input_tokens: 10, output_tokens: 5 },
      })
      .mockResolvedValueOnce(anthropicTextResponse('Ada needs support.'));

    await getLLMCompletion({
      model: 'claude-sonnet-4-6',
      system: 'Analyze confidential student data.',
      messages: [{ role: 'user', content: 'Tell me about Ada Lovelace.' }],
      tools: [
        {
          name: 'get_student',
          description: 'Fetches a student.',
          input_schema: { type: 'object', properties: {} },
        },
      ],
      handleToolCall: mock(async () =>
        JSON.stringify({ essay: 'Confidential essay text.' })
      ),
      logPayload: 'metadata-only',
      metadata: { feature: 'reporter' },
    });

    const log = llmLogCreate.mock.calls[0][0].data;
    expect(log.systemPrompt).toBeUndefined();
    expect(log.response).toBeUndefined();
    expect(log.messages).toEqual({
      redacted: true,
      messageCount: 3,
    });
    expect(JSON.stringify(log)).not.toContain('Ada Lovelace');
    expect(JSON.stringify(log)).not.toContain('Confidential essay text');
    expect(log.metadata).toMatchObject({
      feature: 'reporter',
      payloadLogging: 'metadata-only',
      messageCount: 3,
      toolRoundCount: 1,
    });
  });

  test('falls back to gpt-4o-mini and opens the circuit after Anthropic 529', async () => {
    const controller = new AbortController();
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
      signal: controller.signal,
    });

    expect(result).toBe('Fallback reply.');
    expect(anthropicCreate).toHaveBeenCalledTimes(1);
    expect(openAiCreate).toHaveBeenCalledTimes(1);
    expect(openAiCreate.mock.calls[0]?.[0]).toMatchObject({
      model: 'gpt-4o-mini',
      max_tokens: 100,
    });
    expect(anthropicCreate.mock.calls[0]?.[1]).toEqual({
      signal: controller.signal,
    });
    expect(openAiCreate.mock.calls[0]?.[1]).toEqual({
      signal: controller.signal,
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

  test('never transfers a sensitive workload to the fallback provider', async () => {
    const anthropicError = Object.assign(new Error('Overloaded'), {
      status: 529,
    });
    anthropicCreate.mockRejectedValueOnce(anthropicError);

    await expect(
      getLLMCompletion({
        model: 'claude-sonnet-4-6',
        messages: [{ role: 'user', content: 'Analyze this student record.' }],
        allowFallbackProvider: false,
      })
    ).rejects.toBe(anthropicError);

    expect(anthropicCreate).toHaveBeenCalledTimes(1);
    expect(openAiCreate).not.toHaveBeenCalled();
  });

  test('ignores a forced fallback request when fallback is forbidden', async () => {
    await getLLMCompletion({
      model: 'claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'Analyze this student record.' }],
      forceFallback: true,
      allowFallbackProvider: false,
    });

    expect(anthropicCreate).toHaveBeenCalledTimes(1);
    expect(openAiCreate).not.toHaveBeenCalled();
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
