import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { prisma } from '~/utils/db.server';
import crypto from 'node:crypto';
import { AgentType, getLLMCompletion } from '~/utils/getLLMCompletion';
import { requireMutableRequest } from '~/utils/auth.server';
import { requireReporterAccess } from '~/utils/reporter/reporter-access.server';
import {
  handleReporterToolCall,
  REPORTER_TOOLS,
} from '~/domain/reporter/reporter-tools.server';
import { buildReporterSystemPromptBlocks } from './build-system-prompt';
import {
  AiRateLimitError,
  reserveAiRequest,
} from '~/utils/ai-admission.server';
import {
  computeIpHash,
  logDeniedUsage,
} from '~/utils/ai-usage-log.server';

const REPORTER_FAILED =
  'The reporter could not put that together. Please try again.';
const MAX_REPORTER_MESSAGE_CHARS = 4_000;
const MAX_HISTORY_MESSAGES = 20;
const MAX_HISTORY_CHARS = 24_000;
const REPORTER_REQUEST_DEADLINE_MS = 60_000;
const REPORTER_REQUESTS_PER_MINUTE = 8;
const REPORTER_REQUESTS_PER_HOUR_PER_ORG = 80;
const REPORTER_ADMISSION_POLICY = {
  membershipLimit: REPORTER_REQUESTS_PER_MINUTE,
  membershipWindowMs: 60_000,
  organizationLimit: REPORTER_REQUESTS_PER_HOUR_PER_ORG,
  organizationWindowMs: 60 * 60_000,
};

const POST = z
  .object({
    intent: z.enum(['chat', 'confirm-growth-plan']).default('chat'),
    message: z
      .string()
      .trim()
      .min(1)
      .max(MAX_REPORTER_MESSAGE_CHARS)
      .optional(),
    conversationId: z.string().optional(),
    growthPlanProposal: z.string().max(20_000).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.intent === 'chat' && !value.message) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['message'],
        message: 'Message is required.',
      });
    }
    if (value.intent === 'confirm-growth-plan' && !value.growthPlanProposal) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['growthPlanProposal'],
        message: 'Growth plan proposal is required.',
      });
    }
  });

const growthPlanConfirmationSchema = z
  .object({
    student: z.string().min(1),
    studentName: z.string().min(1),
    focus: z.string().min(1).max(500),
    targetSkills: z.array(z.string().min(1)).min(1).max(5),
    body: z.string().min(1).max(12_000),
    checkInInDays: z.number().int().min(1).max(180).optional(),
  })
  .strict();

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

  if (data.intent === 'confirm-growth-plan') {
    let proposal: z.infer<typeof growthPlanConfirmationSchema>;
    try {
      proposal = growthPlanConfirmationSchema.parse(
        JSON.parse(data.growthPlanProposal ?? '')
      );
    } catch {
      return dataResponse(
        { error: 'The growth plan confirmation is invalid.' },
        { status: 400 }
      );
    }
    const result = JSON.parse(
      await handleReporterToolCall('save_growth_plan', proposal, {
        membershipId: ctx.membershipId,
        organizationId: ctx.organizationId,
      })
    ) as { error?: string; saved?: boolean };
    if (result.error || !result.saved) {
      return dataResponse(
        { error: 'The growth plan could not be saved.' },
        { status: 400 }
      );
    }
    return dataResponse({
      growthPlanSaved: true,
      studentName: proposal.studentName,
    });
  }

  try {
    await reserveAiRequest({
      membershipId: ctx.membershipId,
      organizationId: ctx.organizationId,
      feature: 'reporter',
      policy: REPORTER_ADMISSION_POLICY,
    });
  } catch (error) {
    if (!(error instanceof AiRateLimitError)) {
      // A store failure is not an admission decision, so it is not logged as one.
      return dataResponse({ error: REPORTER_FAILED }, { status: 503 });
    }
    void logDeniedUsage({
      route: 'routes/api.domain.reporter',
      feature: 'reporter',
      membershipId: ctx.membershipId,
      organizationId: ctx.organizationId,
      requestId: crypto.randomUUID(),
      units: 1,
      decision: 'DENIED_USER',
      ipHash: computeIpHash(request),
    });
    return dataResponse(
      {
        error:
          'Too many reporter requests. Please wait a moment and try again.',
      },
      {
        status: 429,
        headers: { 'Retry-After': String(error.retryAfterSeconds) },
      }
    );
  }

  const priorMessages = boundedHistory(
    [...(conversation?.messages ?? [])].reverse()
  );
  const isNewConversation = !conversation;

  const system = buildReporterSystemPromptBlocks({
    teacherName: null,
    organizationName: access.membership.organization.name,
  });

  const messages: { role: AgentType; content: string; name?: string }[] = [
    ...priorMessages.map((message) => ({
      role: message.role as AgentType,
      content: message.content,
    })),
    { role: AgentType.User, content: data.message! },
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
      attribution: {
        organizationId: ctx.organizationId,
        membershipId: ctx.membershipId,
        route: 'routes/api.domain.reporter',
        requestId: crypto.randomUUID(),
        ipHash: computeIpHash(request),
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
            title: deriveTitle(data.message!),
          },
          include: { messages: true },
        }));

      await transaction.reporterConversation.update({
        where: { id: persistedConversation.id },
        data: {
          updatedAt: new Date(),
          messages: {
            create: [
              {
                role: AgentType.User,
                content: data.message!,
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
    growthPlanProposals: [...ctx.pendingGrowthPlanSaves.values()].map(
      (plan) => ({
        student: plan.studentMembershipId,
        studentName: plan.studentName,
        focus: plan.focus,
        targetSkills: plan.targetSkills,
        body: plan.body,
        ...(plan.checkInAt
          ? {
              checkInInDays: Math.max(
                1,
                Math.min(
                  180,
                  Math.ceil(
                    (plan.checkInAt.getTime() - Date.now()) /
                      (24 * 60 * 60 * 1_000)
                  )
                )
              ),
            }
          : {}),
      })
    ),
  });
}
