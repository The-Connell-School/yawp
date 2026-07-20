import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { prisma } from '~/utils/db.server';
import { AgentType, getLLMCompletion } from '~/utils/getLLMCompletion';
import { requireMutableRequest } from '~/utils/auth.server';
import { requireReporterAccess } from '~/utils/reporter/reporter-access.server';
import {
  commitReporterGrowthPlans,
  handleReporterToolCall,
  REPORTER_TOOLS,
} from '~/domain/reporter/reporter-tools.server';
import { buildReporterSystemPrompt } from './build-system-prompt';

const REPORTER_FAILED =
  'The reporter could not put that together. Please try again.';
const MAX_REPORTER_MESSAGE_CHARS = 4_000;
const MAX_HISTORY_MESSAGES = 20;
const MAX_HISTORY_CHARS = 24_000;
const REPORTER_REQUEST_DEADLINE_MS = 60_000;
const REPORTER_REQUESTS_PER_MINUTE = 8;
const REPORTER_REQUESTS_PER_HOUR_PER_ORG = 80;

const POST = z.object({
  message: z.string().trim().min(1).max(MAX_REPORTER_MESSAGE_CHARS),
  conversationId: z.string().optional(),
}).strict();

function deriveTitle(message: string): string {
  const trimmed = message.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= 60) return trimmed || 'New report';
  return `${trimmed.slice(0, 57)}…`;
}

function boundedHistory(
  messages: Array<{ role: string; content: string }>
): Array<{ role: string; content: string }> {
  const selected: Array<{ role: string; content: string }> = [];
  let chars = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]!;
    if (chars + message.content.length > MAX_HISTORY_CHARS) break;
    selected.unshift(message);
    chars += message.content.length;
  }
  return selected;
}

export async function action({ request }: ActionFunctionArgs) {
  await requireMutableRequest(request);
  const access = await requireReporterAccess(request);

  const { error, data } = await parseFormData(request, POST);
  if (error) return validationError(error);

  const ctx = {
    membershipId: access.membership.id,
    organizationId: access.membership.organization.id,
    pendingGrowthPlanSaves: new Map(),
  };

  const now = Date.now();
  const [recentTeacherRequests, recentOrganizationRequests] = await Promise.all(
    [
      prisma.reporterMessage.count({
        where: {
          role: AgentType.User,
          createdAt: { gte: new Date(now - 60_000) },
          conversation: { membershipId: ctx.membershipId },
        },
      }),
      prisma.reporterMessage.count({
        where: {
          role: AgentType.User,
          createdAt: { gte: new Date(now - 60 * 60_000) },
          conversation: { organizationId: ctx.organizationId },
        },
      }),
    ]
  );
  if (
    recentTeacherRequests >= REPORTER_REQUESTS_PER_MINUTE ||
    recentOrganizationRequests >= REPORTER_REQUESTS_PER_HOUR_PER_ORG
  ) {
    return dataResponse(
      {
        error:
          'Too many reporter requests. Please wait a moment and try again.',
      },
      { status: 429 }
    );
  }

  // Load an existing conversation (scoped to this teacher) or start a new one.
  let conversation = data.conversationId
    ? await prisma.reporterConversation.findFirst({
        where: {
          id: data.conversationId,
          membershipId: ctx.membershipId,
          deletedAt: null,
        },
        // id tiebreak: rows written before we stamped explicit timestamps share
        // one createdAt per turn, and cuids from a single nested create are
        // sequential — this keeps question-before-answer order for them too.
        include: {
          messages: {
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: MAX_HISTORY_MESSAGES,
          },
        },
      })
    : null;

  if (data.conversationId && !conversation) {
    return dataResponse({ error: 'Conversation not found.' }, { status: 404 });
  }

  const priorMessages = boundedHistory(
    [...(conversation?.messages ?? [])].reverse()
  );
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
  try {
    reply = await getLLMCompletion({
      model: (process.env.AI_MODEL as any) ?? 'claude-sonnet-4-6',
      system,
      messages,
      maxTokens: 1500,
      maxToolRounds: 6,
      tools: REPORTER_TOOLS,
      handleToolCall: (name, input) => handleReporterToolCall(name, input, ctx),
      allowFallbackProvider: false,
      signal: AbortSignal.timeout(REPORTER_REQUEST_DEADLINE_MS),
      logPayload: 'metadata-only',
      metadata: {
        feature: 'reporter',
      },
    });
  } catch (err) {
    return dataResponse({ error: REPORTER_FAILED }, { status: 500 });
  }

  // Stamp explicit, strictly-increasing timestamps: both rows land in one
  // nested create, so the DB default would give them the same createdAt and
  // leave the question/answer order ambiguous on replay.
  const askedAt = new Date();
  const answeredAt = new Date(askedAt.getTime() + 1);
  try {
    conversation = await prisma.$transaction(async (transaction) => {
      const persistedConversation =
        conversation ??
        (await transaction.reporterConversation.create({
          data: {
            membershipId: ctx.membershipId,
            organizationId: ctx.organizationId,
            title: deriveTitle(data.message),
          },
          include: { messages: true },
        }));

      if (ctx.pendingGrowthPlanSaves.size > 0) {
        await commitReporterGrowthPlans(
          [...ctx.pendingGrowthPlanSaves.values()],
          transaction
        );
      }

      await transaction.reporterConversation.update({
        where: { id: persistedConversation.id },
        data: {
          updatedAt: new Date(),
          messages: {
            create: [
              {
                role: AgentType.User,
                content: data.message,
                createdAt: askedAt,
              },
              {
                role: AgentType.Assistant,
                content: reply,
                createdAt: answeredAt,
              },
            ],
          },
        },
      });
      return persistedConversation;
    });
  } catch {
    return dataResponse({ error: REPORTER_FAILED }, { status: 500 });
  }

  return dataResponse({
    conversationId: conversation.id,
    reply,
    isNewConversation,
  });
}
