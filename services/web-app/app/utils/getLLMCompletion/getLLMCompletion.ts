/* eslint-disable no-console */
import { anthropic } from '~/services/anthropic';
import { openai } from '~/services/openai';
import { prisma } from '~/utils/db.server';

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
  messages: Array<{ content: unknown }>;
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

export async function getLLMCompletion(params: Params) {
  const startTime = Date.now();

  if (params.model.includes('claude')) {
    const system = params.system?.replace(/\t/g, '');
    // Build messages in the SDK's native format (content can be string or block array)
    const messages: Array<{
      role: 'user' | 'assistant';
      content: string | Array<Record<string, unknown>>;
    }> = params.messages.map(({ name: _, ...m }) => ({
      ...m,
      content: m.content.replace(/\t/g, ''),
    }));

    const maxRounds = params.maxToolRounds ?? 3;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let toolRoundCount = 0;
    const hasTools = Boolean(params.tools?.length);

    try {
      for (let round = 0; round <= maxRounds; round++) {
        const message = await anthropic.messages.create({
          max_tokens: params.maxTokens ?? 1024,
          model: params.model,
          system,
          messages: messages as any,
          temperature: params.temperature ?? 0.6,
          ...(params.tools?.length ? { tools: params.tools as any } : {}),
        });

        totalInputTokens += message.usage?.input_tokens ?? 0;
        totalOutputTokens += message.usage?.output_tokens ?? 0;

        if (
          message.stop_reason === 'tool_use' &&
          params.handleToolCall &&
          round < maxRounds
        ) {
          // Append the assistant's full response (contains tool_use blocks)
          messages.push({ role: 'assistant', content: message.content as any });

          // Process each tool call and build tool_result blocks
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

        // If we hit the round limit and the model still wants tools, bail
        if (message.stop_reason === 'tool_use') {
          throw new Error('Tool-use loop exceeded maximum rounds');
        }

        // Extract final text response
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

      // Unreachable — loop always returns or throws — but satisfies TS
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

  if (['gpt-4-turbo-preview'].includes(params.model)) {
    if (!openai) {
      throw new Error('OpenAI not initialized');
    }

    const formattedMessages = [
      ...(params.system
        ? [
            {
              role: 'system' as const,
              content: params.system.replace(/\t/g, ''),
            },
          ]
        : []),
      ...params.messages.map((m) => ({
        ...m,
        content: m.content.replace(/\t/g, ''),
      })),
    ];

    try {
      const message = await openai.chat.completions.create({
        model: params.model,
        max_tokens: params.maxTokens,
        temperature: params.temperature ?? 0.6,
        messages: formattedMessages,
      });

      const durationMs = Date.now() - startTime;
      const responseText = message.choices[0].message.content ?? '';

      await logLlmCall({
        model: params.model,
        provider: 'openai',
        systemPrompt: params.system?.replace(/\t/g, ''),
        messages: formattedMessages,
        response: responseText,
        inputTokens: message.usage?.prompt_tokens,
        outputTokens: message.usage?.completion_tokens,
        totalTokens: message.usage?.total_tokens,
        durationMs,
        metadata: buildLogMetadata({
          metadata: params.metadata,
          messages: formattedMessages,
          hasTools: false,
          toolRoundCount: 0,
        }),
      });

      return responseText;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      await logLlmCall({
        model: params.model,
        provider: 'openai',
        systemPrompt: params.system?.replace(/\t/g, ''),
        messages: formattedMessages,
        error: err instanceof Error ? err.message : String(err),
        durationMs,
        metadata: buildLogMetadata({
          metadata: params.metadata,
          messages: formattedMessages,
          hasTools: false,
          toolRoundCount: 0,
        }),
      });
      throw err;
    }
  }

  return '';
}
