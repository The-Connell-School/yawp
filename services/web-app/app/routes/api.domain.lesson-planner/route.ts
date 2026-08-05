import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { prisma } from '~/utils/db.server';
import { AgentType, getLLMCompletion } from '~/utils/getLLMCompletion';
import { requireMutableRequest } from '~/utils/auth.server';
import { requireLessonPlannerAccess } from '~/utils/lesson-planner/lesson-planner-access.server';
import {
  handleLessonPlannerToolCall,
  LESSON_PLANNER_TOOLS,
} from '~/domain/lesson-planner/lesson-planner-tools.server';
import { repairSlideDeck } from '~/domain/lesson-planner/repair-slide-deck.server';
import { markFailedDecks } from '~/domain/lesson-planner/slide-deck';
import {
  collectToolLinks,
  verifyLessonLinks,
} from '~/domain/lesson-planner/lesson-links';
import { buildLessonPlannerSystemPrompt } from './build-system-prompt';
import {
  AiRateLimitError,
  reserveAiRequest,
} from '~/utils/ai-admission.server';

const PLANNER_FAILED =
  'The lesson planner could not put that together. Please try again.';
// Roomier than the reporter's cap: a teacher pasting a prompt, a rubric, or a
// draft handout into the planner is a normal turn, not an attack.
const MAX_PLANNER_MESSAGE_CHARS = 6_000;
const MAX_HISTORY_MESSAGES = 20;
const MAX_HISTORY_CHARS = 24_000;
// Lessons are long: a deck with speaker notes, a handout, and the quoted text
// of a Quick Writing Lesson run well past a report. A tight ceiling truncates
// mid-artifact, which a teacher reads as bad material rather than as a cut-off.
const PLANNER_REQUEST_DEADLINE_MS = 120_000;
// A full lesson plan plus a ten-slide deck with speaker notes runs well past
// 8k. Hitting the ceiling cuts the deck's JSON mid-object, and a cut-off deck
// cannot be rendered at all — the teacher just loses it.
const PLANNER_MAX_TOKENS = 16_000;
// The repair pass rewrites one deck and nothing else.
const DECK_REPAIR_MAX_TOKENS = 8_000;
const DECK_REPAIR_DEADLINE_MS = 60_000;
// Enough rounds to walk the catalog: class report, Daily Pages search, writing
// lesson list plus lookup, the Lounge, and the assignable types.
const PLANNER_MAX_TOOL_ROUNDS = 8;
const PLANNER_REQUESTS_PER_MINUTE = 6;
const PLANNER_REQUESTS_PER_HOUR_PER_ORG = 60;
const DECK_REPAIR_SYSTEM =
  'You fix malformed slide-deck JSON. You output a single JSON object and nothing else — no prose, no code fence, no apology.';
const PLANNER_ADMISSION_POLICY = {
  membershipLimit: PLANNER_REQUESTS_PER_MINUTE,
  membershipWindowMs: 60_000,
  organizationLimit: PLANNER_REQUESTS_PER_HOUR_PER_ORG,
  organizationWindowMs: 60 * 60_000,
};

const POST = z
  .object({
    intent: z.enum(['chat']).default('chat'),
    message: z.string().trim().min(1).max(MAX_PLANNER_MESSAGE_CHARS),
    conversationId: z.string().optional(),
    /** The Class Summary next step this session was opened from, if any. */
    originClassAssignmentId: z.string().optional(),
  })
  .strict();

function deriveTitle(message: string): string {
  const trimmed = message.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= 60) return trimmed || 'New lesson';
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
  const access = await requireLessonPlannerAccess(request);

  const { error, data } = await parseFormData(request, POST);
  if (error) return validationError(error);

  const ctx = {
    membershipId: access.membership.id,
    organizationId: access.membership.organization.id,
  };

  // Load an existing conversation (scoped to this teacher) or start a new one.
  const conversation = data.conversationId
    ? await prisma.lessonPlanConversation.findFirst({
        where: {
          id: data.conversationId,
          membershipId: ctx.membershipId,
          deletedAt: null,
        },
        // id tiebreak: rows written in one nested create share a createdAt, and
        // cuids from a single create are sequential — this keeps the
        // question-before-answer order for them too.
        include: {
          messages: {
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: MAX_HISTORY_MESSAGES,
          },
          // What the teacher has filed, so the planner revises what exists
          // instead of building a second copy of it.
          materials: {
            orderBy: [{ sourceCreatedAt: 'asc' }, { blockKey: 'asc' }],
            select: { slot: true, kind: true, title: true },
          },
        },
      })
    : null;

  if (data.conversationId && !conversation) {
    return dataResponse({ error: 'Conversation not found.' }, { status: 404 });
  }

  // The origin id arrives from the client, so re-check it against the
  // teacher's own classes before storing it.
  let originClassAssignmentId: string | null = null;
  if (!conversation && data.originClassAssignmentId) {
    const owned = await prisma.classAssignment.findFirst({
      where: {
        id: data.originClassAssignmentId,
        class: { teachers: { some: { id: ctx.membershipId } } },
      },
      select: { id: true },
    });
    originClassAssignmentId = owned?.id ?? null;
  }

  try {
    await reserveAiRequest({
      membershipId: ctx.membershipId,
      organizationId: ctx.organizationId,
      feature: 'lesson-planner',
      policy: PLANNER_ADMISSION_POLICY,
    });
  } catch (error) {
    if (!(error instanceof AiRateLimitError)) {
      return dataResponse({ error: PLANNER_FAILED }, { status: 503 });
    }
    return dataResponse(
      {
        error:
          'Too many lesson planner requests. Please wait a moment and try again.',
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

  const system = buildLessonPlannerSystemPrompt({
    teacherName: null,
    organizationName: access.membership.organization.name,
    lessonInventory: conversation?.materials ?? [],
  });

  const messages: { role: AgentType; content: string; name?: string }[] = [
    ...priorMessages.map((message) => ({
      role: message.role as AgentType,
      // Replayed history is the model's only account of what it produced. A
      // deck that failed has to read as failed, or it will insist to the
      // teacher that the deck is there.
      content: markFailedDecks(message.content),
    })),
    { role: AgentType.User, content: data.message },
  ];

  // Every link the reply is allowed to contain came back from a tool on this
  // request. Anything else it writes, it made up.
  const toolLinks = new Set<string>();

  let reply: string;
  try {
    reply = await getLLMCompletion({
      model: (process.env.AI_MODEL as any) ?? 'claude-sonnet-4-6',
      system,
      messages,
      maxTokens: PLANNER_MAX_TOKENS,
      maxToolRounds: PLANNER_MAX_TOOL_ROUNDS,
      tools: LESSON_PLANNER_TOOLS,
      handleToolCall: async (name, input) => {
        const result = await handleLessonPlannerToolCall(name, input, ctx);
        for (const link of collectToolLinks(result)) toolLinks.add(link);
        return result;
      },
      allowFallbackProvider: false,
      signal: AbortSignal.timeout(PLANNER_REQUEST_DEADLINE_MS),
      logPayload: 'metadata-only',
      metadata: {
        feature: 'lesson-planner',
      },
    });
  } catch {
    return dataResponse({ error: PLANNER_FAILED }, { status: 500 });
  }

  // The model writes its deck blind — nothing in the reply tells it whether the
  // JSON validated. Give a rejected deck the errors and one more pass before
  // the teacher ever sees the reply; a failed repair changes nothing.
  const repaired = await repairSlideDeck({
    reply,
    repair: ({ instruction, reason }) =>
      getLLMCompletion({
        model: (process.env.AI_MODEL as any) ?? 'claude-sonnet-4-6',
        system: DECK_REPAIR_SYSTEM,
        messages: [{ role: AgentType.User, content: instruction }],
        maxTokens: DECK_REPAIR_MAX_TOKENS,
        allowFallbackProvider: false,
        signal: AbortSignal.timeout(DECK_REPAIR_DEADLINE_MS),
        logPayload: 'metadata-only',
        // Schema vocabulary only — field paths and rules, never the teacher's
        // words — so it survives redaction and makes the failure observable.
        metadata: { feature: 'lesson-planner', deckFailure: reason },
      }),
  });
  reply = repaired.reply;

  // A link the catalog never handed back goes nowhere, and a teacher finds that
  // out in front of a class. Strip the href and keep the words. Done before the
  // reply is stored, so the dead link never enters the conversation's history
  // either.
  reply = verifyLessonLinks(reply, toolLinks).reply;

  // Stamp explicit, strictly-increasing timestamps: both rows land in one
  // nested create, so the DB default would give them the same createdAt and
  // leave the question/answer order ambiguous on replay.
  const askedAt = new Date();
  const answeredAt = new Date(askedAt.getTime() + 1);
  let assistantMessageId: string;
  let conversationId: string;
  try {
    const written = await prisma.$transaction(async (transaction) => {
      const persistedConversation =
        conversation ??
        (await transaction.lessonPlanConversation.create({
          data: {
            membershipId: ctx.membershipId,
            organizationId: ctx.organizationId,
            title: deriveTitle(data.message),
            originClassAssignmentId,
          },
          select: { id: true },
        }));

      await transaction.lessonPlanMessage.create({
        data: {
          conversationId: persistedConversation.id,
          role: AgentType.User,
          content: data.message,
          createdAt: askedAt,
        },
      });
      // Created on its own rather than as a nested write so its id can go back
      // to the client: the teacher needs it to keep this reply in the packet
      // without waiting for a reload.
      const assistantMessage = await transaction.lessonPlanMessage.create({
        data: {
          conversationId: persistedConversation.id,
          role: AgentType.Assistant,
          content: reply,
          createdAt: answeredAt,
        },
        select: { id: true },
      });

      await transaction.lessonPlanConversation.update({
        where: { id: persistedConversation.id },
        data: { updatedAt: new Date() },
      });

      return { conversation: persistedConversation, assistantMessage };
    });
    conversationId = written.conversation.id;
    assistantMessageId = written.assistantMessage.id;
  } catch {
    return dataResponse({ error: PLANNER_FAILED }, { status: 500 });
  }

  return dataResponse({
    conversationId,
    messageId: assistantMessageId,
    reply,
    isNewConversation,
  });
}
