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
  buildUnitContext,
  markFailedUnitPlans,
} from '~/domain/lesson-planner/unit-plan';
import {
  createUnitDayConversation,
  createUnitFromMap,
  loadUnitMap,
  resolveUnitDay,
} from '~/domain/lesson-planner/lesson-unit.server';
import {
  collectToolLinks,
  verifyLessonLinks,
} from '~/domain/lesson-planner/lesson-links';
import { verifyLessonResources } from '~/domain/lesson-planner/lesson-resource';
import { shouldRenameLesson } from '~/domain/lesson-planner/lesson-name';
import { findExitTicketTypeId } from '~/domain/lesson-planner/yawp-catalog.server';
import { buildLessonPlannerSystemPrompt } from './build-system-prompt';
import {
  describeProviderError,
  isProviderConfigurationError,
} from '~/utils/getLLMCompletion/llm-provider-errors.server';
import {
  AiRateLimitError,
  reserveAiRequest,
} from '~/utils/ai-admission.server';
import {
  PLANNING_PROGRESS_START,
  planningProgressForTool,
  planningProgressWriting,
  type PlanningProgress,
} from '~/domain/lesson-planner/planning-progress';

const PLANNER_FAILED =
  'The lesson planner could not put that together. Please try again.';
/**
 * Said instead of PLANNER_FAILED when the model refused the deployment rather
 * than the request — a key it will not accept, a model name that is not there.
 * "Try again" is false advice for these: the next attempt fails identically
 * until someone changes an environment variable, and a teacher retrying in
 * front of a class deserves to be told that.
 */
const PLANNER_MISCONFIGURED =
  'The lesson planner cannot reach the model it writes with. This is a setup problem on our end, not something your retry can fix — please tell whoever runs your YAWP! instance.';
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
    /**
     * Set by "Build this day": which day of the unit the teacher asked for.
     * The lesson is written into that day's own conversation, not the map's.
     */
    unitDay: z.coerce.number().int().min(1).max(60).optional(),
    /** The day's title from the map, so the new lesson is named before it exists. */
    unitDayTitle: z.string().trim().max(120).optional(),
    /**
     * Opt in to the progress stream. Absent, the turn answers with one JSON
     * body exactly as it always has — so the streaming path can be turned off
     * at the client without touching the server.
     */
    stream: z.enum(['1']).optional(),
  })
  .strict();

/**
 * The turn's outcome, held as data rather than a Response.
 *
 * A streamed turn has already sent its headers by the time it knows whether it
 * worked, so a failure cannot become a 500 — it travels in the last line of the
 * stream instead, and the client reads `error` exactly as it does today.
 */
type TurnOutcome = { status: number; payload: Record<string, unknown> };

/** Newline-delimited JSON: one event per line, read as it arrives. */
function progressStream(
  run: (report: (progress: PlanningProgress) => void) => Promise<TurnOutcome>
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const write = (event: Record<string, unknown>) => {
        if (!open) return;
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      write({ type: 'progress', ...PLANNING_PROGRESS_START });
      try {
        const outcome = await run((progress) =>
          write({ type: 'progress', ...progress })
        );
        write({ type: 'done', ...outcome });
      } catch {
        // The turn threw somewhere it was not expected to. The teacher still
        // gets an answer rather than a stream that simply stops.
        write({
          type: 'done',
          status: 500,
          payload: { error: PLANNER_FAILED },
        });
      } finally {
        open = false;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      // Tell nginx not to sit on the events until the body is complete, which
      // would make the whole exercise pointless.
      'X-Accel-Buffering': 'no',
    },
  });
}

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
  // Bound once here, where the guard above is still in view: the turn itself
  // runs inside a closure, and TypeScript cannot carry the narrowing into it.
  const turn = data;

  const ctx = {
    membershipId: access.membership.id,
    organizationId: access.membership.organization.id,
  };

  // Load an existing conversation (scoped to this teacher) or start a new one.
  const conversation = turn.conversationId
    ? await prisma.lessonPlanConversation.findFirst({
        where: {
          id: turn.conversationId,
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

  if (turn.conversationId && !conversation) {
    return dataResponse({ error: 'Conversation not found.' }, { status: 404 });
  }

  // The origin id arrives from the client, so re-check it against the
  // teacher's own classes before storing it.
  let originClassAssignmentId: string | null = null;
  if (!conversation && turn.originClassAssignmentId) {
    const owned = await prisma.classAssignment.findFirst({
      where: {
        id: turn.originClassAssignmentId,
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

  // "Build this day" writes into that day's OWN conversation, not the map's.
  // A day is a whole lesson, and appending eight of them to the thread that
  // wrote the map is what made a unit's packet unteachable. Resolved read-only
  // here — the row is created at persist time, so a failed model call does not
  // leave an empty day the board would advertise as built.
  const dayTarget =
    turn.unitDay !== undefined && conversation
      ? await resolveUnitDay({
          db: prisma,
          ctx,
          fromConversationId: conversation.id,
          day: turn.unitDay,
        })
      : null;

  // An existing day carries the turns already spent on it; a new one carries
  // none. Neither inherits the map conversation's transcript.
  const dayConversation = dayTarget?.conversationId
    ? await prisma.lessonPlanConversation.findFirst({
        where: { id: dayTarget.conversationId, deletedAt: null },
        include: {
          messages: {
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: MAX_HISTORY_MESSAGES,
          },
          materials: {
            orderBy: [{ sourceCreatedAt: 'asc' }, { blockKey: 'asc' }],
            select: { slot: true, kind: true, title: true },
          },
        },
      })
    : null;

  const activeConversation =
    dayConversation ?? (dayTarget ? null : conversation);
  const priorMessages = boundedHistory(
    [...(activeConversation?.messages ?? [])].reverse()
  );
  const isNewConversation = !activeConversation;

  // Where this day sits in the arc. Found through the unit rather than by
  // scanning one transcript: a day lives in its own conversation now and
  // cannot look at its own history to discover the map.
  let unitContext = null;
  const unitId = dayTarget?.unitId ?? activeConversation?.unitId ?? null;
  const activeDay = dayTarget
    ? turn.unitDay!
    : (activeConversation?.unitDay ?? null);
  if (unitId && activeDay != null) {
    const map = await loadUnitMap({ db: prisma, unitId });
    unitContext = map ? buildUnitContext(map, activeDay) : null;
  }

  // Whether this teacher can actually assign an exit ticket. Without the type
  // there is no button under the block, so the planner is told to stay on the
  // printable ticket rather than offer a door that is not there.
  const exitTicketsAvailable = Boolean(await findExitTicketTypeId(ctx));

  const system = buildLessonPlannerSystemPrompt({
    teacherName: null,
    organizationName: access.membership.organization.name,
    lessonInventory: conversation?.materials ?? [],
    unitContext,
    exitTicketsAvailable,
  });

  const messages: { role: AgentType; content: string; name?: string }[] = [
    ...priorMessages.map((message) => ({
      role: message.role as AgentType,
      // Replayed history is the model's only account of what it produced. A
      // deck that failed has to read as failed, or it will insist to the
      // teacher that the deck is there.
      content: markFailedUnitPlans(markFailedDecks(message.content)),
    })),
    { role: AgentType.User, content: turn.message },
  ];

  // Every link the reply is allowed to contain came back from a tool on this
  // request. Anything else it writes, it made up.
  const toolLinks = new Set<string>();

  /**
   * Everything from the model call onwards, as one closure over the setup
   * above — so the streamed and the plain path run identical code and cannot
   * drift. `report` is where the progress bar's milestones come from; on the
   * plain path it is a no-op.
   */
  async function runTurn(
    report: (progress: PlanningProgress) => void
  ): Promise<TurnOutcome> {
    let reply: string;
    let toolRound = 0;
    try {
      reply = await getLLMCompletion({
        model: (process.env.AI_MODEL as any) ?? 'claude-sonnet-4-6',
        system,
        messages,
        maxTokens: PLANNER_MAX_TOKENS,
        maxToolRounds: PLANNER_MAX_TOOL_ROUNDS,
        tools: LESSON_PLANNER_TOOLS,
        handleToolCall: async (name, input) => {
          // Reported before the call, not after: the teacher should see what is
          // being looked up while it is being looked up.
          toolRound += 1;
          report(planningProgressForTool(name, input, toolRound));
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
    } catch (error) {
      // The one place the planner's failures are visible. The LLM log for this
      // feature is metadata-only, so without this line an operator sees that
      // the turn failed and nothing about why — a rejected key, a model name
      // that does not exist, and a request that ran out of time all look the
      // same from the outside. No prompt content: only the shape of the error.
      // eslint-disable-next-line no-console
      console.error(
        `[lesson-planner] model call failed: ${describeProviderError(error)}`
      );
      return {
        status: 500,
        payload: {
          error: isProviderConfigurationError(error)
            ? PLANNER_MISCONFIGURED
            : PLANNER_FAILED,
        },
      };
    }

    // Every tool has returned and the model is writing. This is the long stretch
    // — a lesson with a deck is thousands of tokens — so it gets its own line
    // rather than leaving the last lookup on screen for a minute.
    report(planningProgressWriting());

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
    // A card promising material is a louder claim than a sentence, so the same
    // rule applies harder: no block survives whose address a tool never returned.
    reply = verifyLessonResources(reply, toolLinks).reply;

    // A lesson is named after the plan it turned out to be, not after the
    // sentence that started it — otherwise every lesson opened from the pinned
    // suggestion is called "Look at my classes and tell me what they need work
    // on", and the history is unreadable.
    const lessonName = shouldRenameLesson({
      reply,
      priorReplies: priorMessages
        .filter((message) => message.role === AgentType.Assistant)
        .map((message) => message.content),
      teacherNamedIt: Boolean(activeConversation?.packetTitle?.trim()),
    });

    // Stamp explicit, strictly-increasing timestamps: both rows land in one
    // nested create, so the DB default would give them the same createdAt and
    // leave the question/answer order ambiguous on replay.
    const askedAt = new Date();
    const answeredAt = new Date(askedAt.getTime() + 1);
    let assistantMessageId: string;
    let conversationId: string;
    let unitIdForClient: string | null = null;
    try {
      const written = await prisma.$transaction(async (transaction) => {
        const persistedConversation =
          activeConversation ??
          // A day that did not exist a moment ago is created here, with a lesson
          // ready to go into it.
          (dayTarget
            ? await createUnitDayConversation({
                db: transaction,
                ctx,
                unitId: dayTarget.unitId,
                day: turn.unitDay!,
                title: turn.unitDayTitle || `Day ${turn.unitDay}`,
              })
            : await transaction.lessonPlanConversation.create({
                data: {
                  membershipId: ctx.membershipId,
                  organizationId: ctx.organizationId,
                  title: deriveTitle(turn.message),
                  originClassAssignmentId,
                },
                select: { id: true },
              }));

        await transaction.lessonPlanMessage.create({
          data: {
            conversationId: persistedConversation.id,
            role: AgentType.User,
            content: turn.message,
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
          data: {
            updatedAt: new Date(),
            // A day is named after its place in the unit, which the map already
            // decided; renaming it after whatever the lesson turned out to be
            // would break the one-to-one with the board.
            ...(lessonName && dayTarget === null ? { title: lessonName } : {}),
          },
        });

        // A reply that lays out a map turns this conversation into a unit, so
        // the days built from it have somewhere to live.
        const createdUnitId = await createUnitFromMap({
          db: transaction,
          conversationId: persistedConversation.id,
          reply,
          ctx,
          alreadyInUnit: Boolean(activeConversation?.unitId),
        });

        return {
          conversation: persistedConversation,
          assistantMessage,
          createdUnitId,
        };
      });
      conversationId = written.conversation.id;
      assistantMessageId = written.assistantMessage.id;
      unitIdForClient = written.createdUnitId ?? unitId;
    } catch {
      return { status: 500, payload: { error: PLANNER_FAILED } };
    }

    return {
      status: 200,
      payload: {
        conversationId,
        messageId: assistantMessageId,
        reply,
        isNewConversation,
        unitId: unitIdForClient,
        // Set when the turn was a "build this day" click, so the client knows to
        // move the teacher into that day's own lesson rather than staying on the
        // map and showing them a reply that landed somewhere else.
        unitDay: dayTarget
          ? (turn.unitDay ?? null)
          : (activeConversation?.unitDay ?? null),
        /** True when this click opened a day that did not exist a moment ago. */
        openedNewDay: Boolean(dayTarget && !dayTarget.conversationId),
      },
    };
  }

  // A streamed turn reports its milestones and carries its own failures in the
  // last line; the plain turn is byte-for-byte what it always was, so the
  // client can stop asking for the stream at any time.
  if (turn.stream === '1') return progressStream(runTurn);

  const outcome = await runTurn(() => {});
  // Left unset on success, exactly as before — an explicit 200 is the same
  // response over the wire but not the same object, and this path is supposed
  // to be unchanged.
  return outcome.status === 200
    ? dataResponse(outcome.payload)
    : dataResponse(outcome.payload, { status: outcome.status });
}
