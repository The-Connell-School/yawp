import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { prisma } from '~/utils/db.server';
import { AgentType, getLLMCompletion } from '~/utils/getLLMCompletion';
import { isLlmFallbackRetrySignal } from '~/utils/getLLMCompletion/llm-provider-errors.server';
import { requireMutableRequest } from '~/utils/auth.server';
import { requireReporterAccess } from '~/utils/reporter/reporter-access.server';
import {
  handleReporterToolCall,
  REPORTER_TOOLS,
} from '~/domain/reporter/reporter-tools.server';
import { buildReporterSystemPrompt } from './build-system-prompt';

const REPORTER_FAILED =
  'The reporter could not put that together. Please try again.';

const POST = z.object({
  message: z.string().min(1),
  conversationId: z.string().optional(),
  llmRetry: z.enum(['fallback']).optional(),
});

function deriveTitle(message: string): string {
  const trimmed = message.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= 60) return trimmed || 'New report';
  return `${trimmed.slice(0, 57)}…`;
}

export async function action({ request }: ActionFunctionArgs) {
  await requireMutableRequest(request);
  const access = await requireReporterAccess(request);

  const { error, data } = await parseFormData(request, POST);
  if (error) return validationError(error);

  const ctx = {
    membershipId: access.membership.id,
    organizationId: access.membership.organization.id,
  };

  // Load an existing conversation (scoped to this teacher) or start a new one.
  let conversation = data.conversationId
    ? await prisma.reporterConversation.findFirst({
        where: {
          id: data.conversationId,
          membershipId: ctx.membershipId,
          deletedAt: null,
        },
        include: { messages: { orderBy: { createdAt: 'asc' } } },
      })
    : null;

  if (data.conversationId && !conversation) {
    return dataResponse({ error: 'Conversation not found.' }, { status: 404 });
  }

  const priorMessages = conversation?.messages ?? [];
  const isNewConversation = !conversation;

  const system = buildReporterSystemPrompt({
    teacherName: null,
    organizationName: access.membership.organization.name,
  });

  const messages: { role: AgentType; content: string; name?: string }[] = [
    ...priorMessages.map((message) => ({
      role: message.role as AgentType,
      content: message.content,
    })),
    { role: AgentType.User, content: data.message },
  ];

  let reply: string;
  const forceFallback = data.llmRetry === 'fallback';
  try {
    reply = await getLLMCompletion({
      model: (process.env.AI_MODEL as any) ?? 'claude-sonnet-4-6',
      system,
      messages,
      maxTokens: 1500,
      maxToolRounds: 6,
      tools: REPORTER_TOOLS,
      handleToolCall: (name, input) => handleReporterToolCall(name, input, ctx),
      forceFallback,
      signalFallbackRetry: !forceFallback,
      metadata: {
        feature: 'reporter',
        membershipId: ctx.membershipId,
        organizationId: ctx.organizationId,
        conversationId: conversation?.id,
      },
    });
  } catch (err) {
    if (isLlmFallbackRetrySignal(err)) {
      return dataResponse({ retrying: true }, { status: 202 });
    }
    return dataResponse(
      {
        error: `${REPORTER_FAILED} Error: ${
          err instanceof Error ? err.message : String(err)
        }`,
      },
      { status: 500 }
    );
  }

  // Persist the turn. Create the conversation lazily on first success so failed
  // requests don't leave empty conversations behind.
  if (!conversation) {
    conversation = await prisma.reporterConversation.create({
      data: {
        membershipId: ctx.membershipId,
        organizationId: ctx.organizationId,
        title: deriveTitle(data.message),
      },
      include: { messages: true },
    });
  }

  await prisma.reporterConversation.update({
    where: { id: conversation.id },
    data: {
      updatedAt: new Date(),
      messages: {
        create: [
          { role: AgentType.User, content: data.message },
          { role: AgentType.Assistant, content: reply },
        ],
      },
    },
  });

  return dataResponse({
    conversationId: conversation.id,
    reply,
    isNewConversation,
  });
}
