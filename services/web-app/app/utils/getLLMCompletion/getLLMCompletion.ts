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

export async function getLLMCompletion(params: Params) {
  const startTime = Date.now();

  if (params.model.includes('claude')) {
    const system = params.system?.replace(/\t/g, '');
    const messages = params.messages.map(({ name: _, ...m }) => ({
      ...m,
      content: m.content.replace(/\t/g, ''),
    }));

    try {
      const message = await anthropic.messages.create({
        max_tokens: params.maxTokens ?? 1024,
        model: params.model,
        system,
        messages,
        temperature: params.temperature ?? 0.6,
      });

      const durationMs = Date.now() - startTime;
      const responseText =
        message.content[0].type === 'text' ? message.content[0].text : '';

      await logLlmCall({
        model: params.model,
        provider: 'anthropic',
        systemPrompt: system,
        messages,
        response: responseText,
        inputTokens: message.usage?.input_tokens,
        outputTokens: message.usage?.output_tokens,
        totalTokens:
          (message.usage?.input_tokens ?? 0) +
          (message.usage?.output_tokens ?? 0),
        durationMs,
        metadata: params.metadata,
      });

      return responseText;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      await logLlmCall({
        model: params.model,
        provider: 'anthropic',
        systemPrompt: system,
        messages,
        error: err instanceof Error ? err.message : String(err),
        durationMs,
        metadata: params.metadata,
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
        metadata: params.metadata,
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
        metadata: params.metadata,
      });
      throw err;
    }
  }

  return '';
}
