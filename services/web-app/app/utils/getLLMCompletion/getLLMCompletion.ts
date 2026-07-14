/* eslint-disable no-console */
import { anthropic } from '~/services/anthropic';
import { openai } from '~/services/openai';
import { prisma } from '~/utils/db.server';
import {
  getAnthropicOutageState,
  isAnthropicOutageCircuitOpen,
  markAnthropicOutageClosed,
  markAnthropicOutageOpen,
} from './anthropic-outage-cache.server';
import {
  getAnthropicRetryableStatus,
  isRetryableAnthropicOutageError,
  LlmFallbackRetrySignal,
} from './llm-provider-errors.server';

export enum AgentType {
  User = 'user',
  Assistant = 'assistant',
}

export type Message = { role: AgentType; content: string; name?: string };

interface Params {
  messages: { role: 'user' | 'assistant'; content: string; name?: string }[];
  system?: string;
  temperature?: number;
  maxTokens?: number;
  model: string;
  metadata?: Record<string, unknown>;
  tools?: Array<{
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
  }>;
  handleToolCall?: (
    name: string,
    input: Record<string, unknown>
  ) => Promise<string>;
  maxToolRounds?: number;
  forceFallback?: boolean;
  signalFallbackRetry?: boolean;
  fallbackModel?: string;
  signal?: AbortSignal;
}

async function logLlmCall(data: {
  model: string;
  provider: 'anthropic' | 'openai';
  systemPrompt?: string;
  messages: unknown;
  response?: string;
  error?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}) {
  try {
    await prisma.llmLog.create({
      data: {
        model: data.model,
        provider: data.provider,
        systemPrompt: data.systemPrompt,
        messages: data.messages as object,
        response: data.response,
        error: data.error,
        inputTokens: data.inputTokens,
        outputTokens: data.outputTokens,
        totalTokens: data.totalTokens,
        durationMs: data.durationMs,
        metadata: data.metadata as object,
      },
    });
  } catch (err) {
    console.error('Failed to log LLM call:', err);
  }
}

function getOpenAiFallbackModel(params: Params) {
  return (
    params.fallbackModel?.trim() ||
    process.env.OPENAI_FALLBACK_MODEL?.trim() ||
    'gpt-4o-mini'
  );
}

function isFallbackEnabled() {
  return process.env.ANTHROPIC_OUTAGE_FALLBACK_ENABLED !== 'false' && !!openai;
}

function isOpenAiTextModel(model: string) {
  return model.startsWith('gpt-') || model.startsWith('o');
}

function stripTabs(value: string | undefined) {
  return value?.replace(/\t/g, '');
}

function fallbackReasonFor(error: unknown) {
  const status = getAnthropicRetryableStatus(error);
  return status ? `status:${status}` : 'overloaded_error';
}

function fallbackMetadata(
  params: Params,
  extra: Record<string, unknown>
): Record<string, unknown> {
  return {
    ...params.metadata,
    ...extra,
  };
}

function messageContentLength(content: unknown) {
  if (typeof content === 'string') return content.length;
  return JSON.stringify(content ?? '').length;
}

function buildLogMetadata({
  metadata,
  messages,
  hasTools,
  toolRoundCount,
}: {
  metadata?: Record<string, unknown>;
  messages: Array<{ content?: unknown }>;
  hasTools: boolean;
  toolRoundCount: number;
}) {
  return {
    ...(metadata ?? {}),
    messageCount: messages.length,
    messageTextLengths: messages.map((message) =>
      messageContentLength(message.content)
    ),
    hasTools,
    toolRoundCount,
  };
}

async function runAnthropicCompletion(params: Params, startTime: number) {
  const system = stripTabs(params.system);
  const messages: Array<{
    role: 'user' | 'assistant';
    content: string | Array<Record<string, unknown>>;
  }> = params.messages.map(({ name: _, ...m }) => ({
    ...m,
    content: m.content.replace(/\t/g, ''),
  }));

  const maxRounds = params.maxToolRounds ?? 3;
  const hasTools = Boolean(params.tools?.length);
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let toolRoundCount = 0;

  try {
    for (let round = 0; round <= maxRounds; round++) {
      const request = {
        max_tokens: params.maxTokens ?? 1024,
        model: params.model,
        system,
        messages: messages as any,
        temperature: params.temperature ?? 0.6,
        ...(params.tools?.length ? { tools: params.tools as any } : {}),
      };
      const message = params.signal
        ? await anthropic.messages.create(request, { signal: params.signal })
        : await anthropic.messages.create(request);

      totalInputTokens += message.usage?.input_tokens ?? 0;
      totalOutputTokens += message.usage?.output_tokens ?? 0;

      if (
        message.stop_reason === 'tool_use' &&
        params.handleToolCall &&
        round < maxRounds
      ) {
        messages.push({ role: 'assistant', content: message.content as any });

        const toolResults: Array<Record<string, unknown>> = [];
        for (const block of message.content) {
          if (block.type === 'tool_use') {
            const result = await params.handleToolCall(
              block.name,
              block.input as Record<string, unknown>
            );
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: result,
            });
          }
        }
        messages.push({ role: 'user', content: toolResults });
        toolRoundCount += 1;
        continue;
      }

      if (message.stop_reason === 'tool_use') {
        throw new Error('Tool-use loop exceeded maximum rounds');
      }

      const textBlock = message.content.find((b) => b.type === 'text');
      const responseText =
        textBlock && 'text' in textBlock ? (textBlock as any).text : '';

      const durationMs = Date.now() - startTime;
      await logLlmCall({
        model: params.model,
        provider: 'anthropic',
        systemPrompt: system,
        messages,
        response: responseText,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        totalTokens: totalInputTokens + totalOutputTokens,
        durationMs,
        metadata: buildLogMetadata({
          metadata: params.metadata,
          messages,
          hasTools,
          toolRoundCount,
        }),
      });

      return responseText;
    }

    throw new Error('Tool-use loop ended unexpectedly');
  } catch (err) {
    const durationMs = Date.now() - startTime;
    await logLlmCall({
      model: params.model,
      provider: 'anthropic',
      systemPrompt: system,
      messages,
      error: err instanceof Error ? err.message : String(err),
      durationMs,
      metadata: buildLogMetadata({
        metadata: params.metadata,
        messages,
        hasTools,
        toolRoundCount,
      }),
    });
    throw err;
  }
}

function parseToolArguments(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

async function runOpenAiCompletion({
  params,
  model,
  startTime,
  metadata,
}: {
  params: Params;
  model: string;
  startTime: number;
  metadata?: Record<string, unknown>;
}) {
  if (!openai) {
    throw new Error('OpenAI not initialized');
  }

  const formattedMessages: Array<Record<string, unknown>> = [
    ...(params.system
      ? [
          {
            role: 'system' as const,
            content: stripTabs(params.system),
          },
        ]
      : []),
    ...params.messages.map(({ name: _, ...m }) => ({
      ...m,
      content: m.content.replace(/\t/g, ''),
    })),
  ];
  const tools = params.tools?.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
    },
  }));

  const maxRounds = params.maxToolRounds ?? 3;
  const hasTools = Boolean(tools?.length);
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let toolRoundCount = 0;

  try {
    for (let round = 0; round <= maxRounds; round++) {
      const request = {
        model,
        max_tokens: params.maxTokens,
        temperature: params.temperature ?? 0.6,
        messages: formattedMessages as any,
        ...(tools?.length ? { tools } : {}),
      };
      const message = params.signal
        ? await openai.chat.completions.create(request, {
            signal: params.signal,
          })
        : await openai.chat.completions.create(request);

      totalInputTokens += message.usage?.prompt_tokens ?? 0;
      totalOutputTokens += message.usage?.completion_tokens ?? 0;

      const responseMessage = message.choices[0]?.message;
      const toolCalls = responseMessage?.tool_calls ?? [];

      if (toolCalls.length && params.handleToolCall && round < maxRounds) {
        formattedMessages.push({
          role: 'assistant',
          content: responseMessage?.content ?? null,
          tool_calls: toolCalls,
        });

        for (const toolCall of toolCalls) {
          const result = await params.handleToolCall(
            toolCall.function.name,
            parseToolArguments(toolCall.function.arguments)
          );
          formattedMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: result,
          });
        }
        toolRoundCount += 1;
        continue;
      }

      if (toolCalls.length) {
        throw new Error('Tool-use loop exceeded maximum rounds');
      }

      const durationMs = Date.now() - startTime;
      const responseText = responseMessage?.content ?? '';

      await logLlmCall({
        model,
        provider: 'openai',
        systemPrompt: stripTabs(params.system),
        messages: formattedMessages,
        response: responseText,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        totalTokens: totalInputTokens + totalOutputTokens,
        durationMs,
        metadata: buildLogMetadata({
          metadata,
          messages: formattedMessages,
          hasTools,
          toolRoundCount,
        }),
      });

      return responseText;
    }

    throw new Error('Tool-use loop ended unexpectedly');
  } catch (err) {
    const durationMs = Date.now() - startTime;
    await logLlmCall({
      model,
      provider: 'openai',
      systemPrompt: stripTabs(params.system),
      messages: formattedMessages,
      error: err instanceof Error ? err.message : String(err),
      durationMs,
      metadata: buildLogMetadata({
        metadata,
        messages: formattedMessages,
        hasTools,
        toolRoundCount,
      }),
    });
    throw err;
  }
}

export async function getLLMCompletion(params: Params) {
  const startTime = Date.now();
  const fallbackModel = getOpenAiFallbackModel(params);

  if (params.forceFallback) {
    return runOpenAiCompletion({
      params,
      model: fallbackModel,
      startTime,
      metadata: fallbackMetadata(params, {
        primaryModel: params.model,
        fallbackModel,
        fallbackTriggered: true,
        fallbackReason: 'forced',
      }),
    });
  }

  if (params.model.includes('claude')) {
    const fallbackAvailable = isFallbackEnabled();
    const circuitState = getAnthropicOutageState();

    if (fallbackAvailable && isAnthropicOutageCircuitOpen()) {
      if (params.signalFallbackRetry) {
        throw new LlmFallbackRetrySignal({
          fallbackModel,
          reason: circuitState.reason ?? 'anthropic-circuit-open',
          retryableStatus: null,
        });
      }

      return runOpenAiCompletion({
        params,
        model: fallbackModel,
        startTime,
        metadata: fallbackMetadata(params, {
          primaryModel: params.model,
          fallbackModel,
          fallbackTriggered: true,
          fallbackReason: circuitState.reason ?? 'anthropic-circuit-open',
          anthropicCircuitOpen: true,
        }),
      });
    }

    try {
      const response = await runAnthropicCompletion(params, startTime);
      markAnthropicOutageClosed();
      return response;
    } catch (err) {
      if (fallbackAvailable && isRetryableAnthropicOutageError(err)) {
        const retryableStatus = getAnthropicRetryableStatus(err);
        const reason = fallbackReasonFor(err);
        markAnthropicOutageOpen({ reason });

        if (params.signalFallbackRetry) {
          throw new LlmFallbackRetrySignal({
            fallbackModel,
            reason,
            retryableStatus,
          });
        }

        return runOpenAiCompletion({
          params,
          model: fallbackModel,
          startTime,
          metadata: fallbackMetadata(params, {
            primaryModel: params.model,
            fallbackModel,
            fallbackTriggered: true,
            fallbackReason: reason,
            retryableStatus,
          }),
        });
      }
      throw err;
    }
  }

  if (isOpenAiTextModel(params.model)) {
    return runOpenAiCompletion({
      params,
      model: params.model,
      startTime,
      metadata: params.metadata,
    });
  }

  return '';
}
