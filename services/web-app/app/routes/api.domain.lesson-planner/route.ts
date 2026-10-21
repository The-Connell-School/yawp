import { monthlyFreeTierPolicy } from '~/domain/free-tier/monthly-policy.server';
import {
  MAX_PENDING_UPLOAD_IDS,
  PENDING_UPLOAD_MS,
  readUploadPart,
  UPLOAD_TOOL,
  type LessonUpload,
} from '~/domain/lesson-planner/lesson-uploads';
import {
  beginMonthlyOperation,
  replayMonthlyOperation,
  finishMonthlyOperation,
  failMonthlyOperation,
  monthlyOperationResponse,
  type Reservation,
} from '~/domain/free-tier/monthly-operations.server';
import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { prisma } from '~/utils/db.server';
import { AgentType, getLLMCompletion } from '~/utils/getLLMCompletion';
import { requireMutableRequest } from '~/utils/auth.server';
import { requireLessonPlannerAccess } from '~/utils/lesson-planner/lesson-planner-access.server';
import {
  LessonPlanQuotaExceededError,
  assertCanCreateLessonPlan,
  lessonPlanQuotaMessage,
} from '~/utils/lesson-planner/lesson-planner-quota.server';
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
import { getLessonPlannerReviewFlags } from '~/domain/feature-flags/feature-flags.server';
import { readLessonLength } from '~/domain/lesson-planner/lesson-length';
import { asksForDeck } from '~/domain/lesson-planner/suggestions';
import { loadStackContents } from '~/domain/lesson-planner/stack-contents.server';
import {
  firstMessageTitle,
  shouldRenameLesson,
} from '~/domain/lesson-planner/lesson-name';
import { findWritingExerciseTypeIds } from '~/domain/lesson-planner/yawp-catalog.server';
import { TEMPLATE_SLOTS } from '~/domain/lesson-planner/lesson-templates';
import { buildLessonPlannerSystemPromptBlocks } from './build-system-prompt';
import {
  buildLessonPlannerAdmissionPolicy,
  lessonPlannerRateLimitMessage,
} from '~/utils/lesson-planner/lesson-planner-admission.server';
import {
  describeProviderError,
  isProviderConfigurationError,
} from '~/utils/getLLMCompletion/llm-provider-errors.server';
import {
  AiRateLimitError,
  aiAdmissionErrorResponse,
  reserveAiRequest,
} from '~/utils/ai-admission.server';
import { computeIpHash } from '~/utils/ai-usage-log.server';
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
  'The lesson planner cannot reach the model it writes with. This is a setup problem on our end, not something your retry can fix — please tell whoever runs your Yawp! instance.';
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
const PLANNER_MAX_TOKENS = 12_000;
// The repair pass rewrites one deck and nothing else.
const DECK_REPAIR_MAX_TOKENS = 6_000;
const DECK_REPAIR_DEADLINE_MS = 60_000;
// Enough rounds to walk the catalog: class report, Daily Pages search, writing
// lesson list plus lookup, the Lounge, and the assignable types.
const PLANNER_MAX_TOOL_ROUNDS = 8;
const DECK_REPAIR_SYSTEM =
  'You fix malformed slide-deck JSON. You output a single JSON object and nothing else — no prose, no code fence, no apology.';

const POST = z
  .object({
    intent: z.enum(['chat']).default('chat'),
    message: z.string().trim().min(1).max(MAX_PLANNER_MESSAGE_CHARS),
    conversationId: z.string().optional(),
    requestId: z.string().min(1).max(128).optional(),
    /** The Class Summary next step this session was opened from, if any. */
    originClassAssignmentId: z.string().optional(),
    /**
     * Set by "Build this day": which day of the unit the teacher asked for.
     * The lesson is written into that day's own conversation, not the map's.
     */
    unitDay: z.coerce.number().int().min(1).max(60).optional(),
    /** The day's title from the map, so the new lesson is named before it exists. */
    unitDayTitle: z.string().trim().max(120).optional(),
    /** A lesson started from one of the teacher's templates (run 3). */
    templateId: z.string().min(1).max(64).optional(),
    /** Documents added before the lesson's first message, to attach to it (Oct 21). */
    uploadIds: z
      .string()
      .max(400)
      .regex(/^[\w-]{1,40}(,[\w-]{1,40}){0,9}$/)
      .optional(),
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

const deriveTitle = firstMessageTitle;

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
    writingPracticeEnabled:
      access.membership.organization.writingPracticeEnabled,
  };

  const plannerAdmissionPolicy = buildLessonPlannerAdmissionPolicy(
    access.membership.organization.numOfTeacherSeats
  );

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

  const dayTarget =
    turn.unitDay !== undefined && conversation
      ? await resolveUnitDay({
          db: prisma,
          ctx,
          fromConversationId: conversation.id,
          day: turn.unitDay,
        })
      : null;

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

  const activeConversationForQuota =
    dayConversation ?? (dayTarget ? null : conversation);

  const monthlyPolicy = await monthlyFreeTierPolicy(
    access.membership.organization
  );
  let reservation: Reservation | null = null;
  const operationInput = {
    message: turn.message,
    conversationId: turn.conversationId,
    unitDay: turn.unitDay,
    unitDayTitle: turn.unitDayTitle,
    originClassAssignmentId: turn.originClassAssignmentId,
  };
  // The browser sends stream=1 and consumes terminal NDJSON events, including
  // outcomes decided before generation starts. Keep HTTP status for direct callers.
  async function monthlyResponse(response: Response) {
    if (turn.stream !== '1') return response;
    return new Response(
      `${JSON.stringify({ type: 'done', status: response.status, payload: await response.json() })}\n`,
      {
        status: response.status,
        headers: {
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      }
    );
  }
  if (monthlyPolicy.enabled && turn.requestId) {
    const replay = await replayMonthlyOperation({
      organizationId: ctx.organizationId,
      membershipId: ctx.membershipId,
      feature: 'lesson-planner',
      requestId: turn.requestId,
      input: operationInput,
    });
    if (replay) return monthlyResponse(monthlyOperationResponse(replay));
  }
  if (monthlyPolicy.enabled && !activeConversationForQuota) {
    if (!turn.requestId)
      return monthlyResponse(
        Response.json({ error: 'Request ID is required.' }, { status: 400 })
      );
    const admitted = await beginMonthlyOperation({
      organizationId: ctx.organizationId,
      membershipId: ctx.membershipId,
      feature: 'lesson-planner',
      cap: monthlyPolicy.limits.lessonPlannerMonthly,
      requestId: turn.requestId,
      input: operationInput,
    });
    if (admitted.kind !== 'reserved')
      return monthlyResponse(monthlyOperationResponse(admitted));
    reservation = admitted;
  }
  if (!activeConversationForQuota && !monthlyPolicy.enabled) {
    try {
      await assertCanCreateLessonPlan({
        organizationId: ctx.organizationId,
        plan: access.membership.organization.plan,
      });
    } catch (quotaError) {
      if (quotaError instanceof LessonPlanQuotaExceededError) {
        return dataResponse(
          {
            error: lessonPlanQuotaMessage(quotaError.quota, quotaError.monthly),
          },
          { status: 403 }
        );
      }
      throw quotaError;
    }
  }

  let handedToStream = false;
  try {
    return await runAdmittedPlannerTurn();
  } finally {
    if (reservation && !handedToStream) await failMonthlyOperation(reservation);
  }
  async function runAdmittedPlannerTurn() {
    async function reservePlannerAi(units = 1) {
      await reserveAiRequest({
        membershipId: ctx.membershipId,
        organizationId: ctx.organizationId,
        feature: 'lesson-planner',
        policy: plannerAdmissionPolicy,
        units,
      });
    }

    try {
      await reservePlannerAi();
    } catch (error) {
      const locked = aiAdmissionErrorResponse(error);
      if (locked) return locked;
      if (!(error instanceof AiRateLimitError)) {
        return dataResponse({ error: PLANNER_FAILED }, { status: 503 });
      }
      return dataResponse(
        {
          error: lessonPlannerRateLimitMessage(error),
        },
        {
          status: 429,
          headers: { 'Retry-After': String(error.retryAfterSeconds) },
        }
      );
    }

    const activeConversation = activeConversationForQuota;
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
    const exitTicketsAvailable = Boolean(
      (await findWritingExerciseTypeIds(ctx)).exitTicket
    );

    // Brian's review (B6): with stack v2 on, outputs are built from what the
    // teacher kept, so the planner sees the stack itself, not just its titles.
    const { stackV2, intakeV2, templates: templatesOn, deckGallery, uploads: uploadsOn } = await getLessonPlannerReviewFlags(
      ctx.organizationId
    );
    // The teacher's own documents (Oct 21): this lesson's, and any added
    // before its first message, which this turn attaches. Only theirs.
    const pendingUploadIds = (turn.uploadIds ?? '').split(',').filter(Boolean).slice(0, MAX_PENDING_UPLOAD_IDS);
    const sources: Array<LessonUpload & { conversationId: string | null }> = uploadsOn
      ? await prisma.lessonPlanUpload.findMany({
          where: {
            membershipId: ctx.membershipId,
            OR: [
              ...(activeConversation ? [{ conversationId: activeConversation.id }] : []),
              ...(pendingUploadIds.length
                ? [{ id: { in: pendingUploadIds }, conversationId: null, createdAt: { gt: new Date(Date.now() - PENDING_UPLOAD_MS) } }]
                : []),
            ],
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: { id: true, name: true, text: true, truncated: true, conversationId: true },
        })
      : [];
    const attachUploadIds = sources.filter((source) => !source.conversationId).map((source) => source.id);
    // Brian's run 3: a lesson built from the teacher's own template keeps its
    // shape. Only the teacher's own, and only with templates on.
    const templateRow =
      templatesOn && turn.templateId
        ? await prisma.lessonPlanTemplate.findFirst({
            where: { id: turn.templateId, membershipId: access.membership.id, deletedAt: null },
            select: { id: true, name: true, slots: true, periodMinutes: true },
          })
        : null;
    const parsedSlots = templateRow ? TEMPLATE_SLOTS.safeParse(templateRow.slots) : null;
    const template =
      templateRow && parsedSlots?.success
        ? { id: templateRow.id, name: templateRow.name, slots: parsedSlots.data, periodMinutes: templateRow.periodMinutes }
        : null;
    const stackContents =
      stackV2 && activeConversation
        ? await loadStackContents(activeConversation.id, {
            // A deck is built from the pieces, not from the last deck (C1).
            leaveOutDeck: asksForDeck(turn.message),
          })
        : [];

    // How long this lesson is (Brian's run 2, B1): from this very message when
    // the teacher just said, otherwise what they said earlier in the lesson.
    const heardLength = readLessonLength(turn.message);
    const lessonLength =
      heardLength ??
      (template?.periodMinutes && !activeConversation?.periodMinutes
        ? { minutes: template.periodMinutes, classLabel: null }
        : null) ??
      (activeConversation?.periodMinutes
        ? {
            minutes: activeConversation.periodMinutes,
            classLabel: activeConversation.lessonClassLabel ?? null,
          }
        : null);

    const system = buildLessonPlannerSystemPromptBlocks({
      teacherName: null,
      lessonLength,
      organizationName: access.membership.organization.name,
      lessonInventory: conversation?.materials ?? [],
      stackContents,
      intakeV2,
      unitContext,
      exitTicketsAvailable,
      writingPracticeAvailable: ctx.writingPracticeEnabled,
      template,
      deckGallery,
      sources,
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
          attribution: {
            organizationId: ctx.organizationId,
            membershipId: ctx.membershipId,
            route: 'routes/api.domain.lesson-planner',
            requestId: crypto.randomUUID(),
            ipHash: computeIpHash(request),
          },
          maxToolRounds: PLANNER_MAX_TOOL_ROUNDS,
          tools: sources.length ? [...LESSON_PLANNER_TOOLS, UPLOAD_TOOL] : LESSON_PLANNER_TOOLS,
          handleToolCall: async (name, input) => {
            // Reported before the call, not after: the teacher should see what is
            // being looked up while it is being looked up.
            toolRound += 1;
            report(planningProgressForTool(name, input, toolRound));
            // Read from this turn's own documents: never another lesson's.
            if (name === UPLOAD_TOOL.name) return JSON.stringify(readUploadPart(sources, input));
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
        repair: async ({ instruction, reason }) => {
          try {
            await reservePlannerAi();
          } catch (admissionError) {
            if (admissionError instanceof AiRateLimitError) {
              throw admissionError;
            }
            throw new Error(PLANNER_FAILED);
          }
          return getLLMCompletion({
            model: (process.env.AI_MODEL as any) ?? 'claude-sonnet-4-6',
            system: DECK_REPAIR_SYSTEM,
            messages: [{ role: AgentType.User, content: instruction }],
            maxTokens: DECK_REPAIR_MAX_TOKENS,
            attribution: {
              organizationId: ctx.organizationId,
              membershipId: ctx.membershipId,
              route: 'routes/api.domain.lesson-planner',
              requestId: crypto.randomUUID(),
              ipHash: computeIpHash(request),
            },
            allowFallbackProvider: false,
            signal: AbortSignal.timeout(DECK_REPAIR_DEADLINE_MS),
            logPayload: 'metadata-only',
            // Schema vocabulary only — field paths and rules, never the teacher's
            // words — so it survives redaction and makes the failure observable.
            metadata: {
              feature: 'lesson-planner-deck-repair',
              deckFailure: reason,
            },
          });
        },
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

          if (attachUploadIds.length) {
            await transaction.lessonPlanUpload.updateMany({
              where: { id: { in: attachUploadIds }, membershipId: ctx.membershipId, conversationId: null },
              data: { conversationId: persistedConversation.id },
            });
          }
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
              ...(lessonName && dayTarget === null
                ? { title: lessonName }
                : {}),
              ...(heardLength
                ? {
                    periodMinutes: heardLength.minutes,
                    lessonClassLabel: heardLength.classLabel,
                  }
                : {}),
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

          if (reservation)
            await finishMonthlyOperation(transaction, reservation, {
              conversationId: persistedConversation.id,
              messageId: assistantMessage.id,
              reply,
              isNewConversation,
              unitId: createdUnitId ?? unitId,
              unitDay: dayTarget
                ? (turn.unitDay ?? null)
                : (activeConversation?.unitDay ?? null),
              openedNewDay: Boolean(dayTarget && !dayTarget.conversationId),
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
    if (turn.stream === '1') {
      const response = progressStream(async (progress) => {
        try {
          return await runTurn(progress);
        } finally {
          if (reservation) await failMonthlyOperation(reservation);
        }
      });
      handedToStream = true;
      return response;
    }

    const outcome = await runTurn(() => {});
    // Left unset on success, exactly as before — an explicit 200 is the same
    // response over the wire but not the same object, and this path is supposed
    // to be unchanged.
    return outcome.status === 200
      ? dataResponse(outcome.payload)
      : dataResponse(outcome.payload, { status: outcome.status });
  }
}
