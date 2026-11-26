import { purposeToAsk } from '~/domain/lesson-planner/lesson-ask';
import { monthlyFreeTierPolicy } from '~/domain/free-tier/monthly-policy.server';
import { applyDeckChoice, fileUploadedDeck, keptDeckBlock, withKeptDeck } from '~/domain/lesson-planner/uploaded-deck.server';
import { lessonPlannerMonthlyQuotaEnforced } from '~/domain/free-tier/monthly-quota-cap.server';
import { recentArtFrom } from '~/domain/lesson-planner/recent-art';
import { plannerHistory } from '~/domain/lesson-planner/planner-history';
import {
  MAX_PENDING_UPLOAD_IDS,
  PENDING_UPLOAD_MS,
  readUploadPart,
  UPLOAD_TOOL,
  type LessonUpload,
} from '~/domain/lesson-planner/lesson-uploads';
import { organizationHasPendingFreeTierLessonPlannerMetering } from '~/domain/free-tier/locked-preview.server';
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
import { DEFAULT_ANTHROPIC_MODEL } from '~/config/default-anthropic-model';
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
import { chooseCheckedAgainst, teacherPages, withQuotationsLabel } from '~/domain/lesson-planner/teacher-pages.server';
import { getLessonPlannerReviewFlags } from '~/domain/feature-flags/feature-flags.server';
import { withResolvedPictures } from '~/domain/lesson-planner/picture-lookup.server';
import { withoutArtTalk } from '~/domain/lesson-planner/reply-art-talk';
import { withoutProcessTalk, withStartersOnDays, withUnitMapFirst } from '~/domain/lesson-planner/reply-shape';
import { visualKitFor } from '~/domain/lesson-planner/work-visuals';
import { withoutRunawayBlanks } from '~/domain/lesson-planner/runaway-blanks';
import { pictureModelCalls } from '~/domain/lesson-planner/picture-model.server';
import { withWriteSlidesAsFiled } from '~/domain/lesson-planner/write-slides-filed';
import { withDeckMatchingPlan } from '~/domain/lesson-planner/deck-plan-minutes';
import { fileLaterHandout } from '~/domain/lesson-planner/file-later-handout.server';
import { checkQuotations, preparedSourceOf, withQuotationCheck } from '~/domain/lesson-planner/quotation-check.server';
import { withFactCheck } from '~/domain/lesson-planner/fact-check.server';
import { factCheckCall } from '~/domain/lesson-planner/fact-check-model.server';
import { fetchWorkText, sourceTextFailure, warmSourceTexts, workForText } from '~/domain/lesson-planner/source-texts.server';
import { aboutSettledQuotation, checkNoteWords, withCheckNote } from '~/domain/lesson-planner/check-note';
import { withExcerptsFromSource } from '~/domain/lesson-planner/excerpt-source';
import { withCompanionsChecked } from '~/domain/lesson-planner/companion-check.server';
import { LESSON_REPAIR_SCHEMA, withLessonRepair, type Problem } from '~/domain/lesson-planner/lesson-repair.server';
import { pictureShelf } from '~/domain/lesson-planner/picture-shelf.server';
import { withResolvedPlaces } from '~/domain/lesson-planner/context-slides.server';
import { isExitTicketBuilderV3Enabled } from '~/domain/assignment-types/exit-ticket-builder-v3-gate.server';
import { readLessonLength } from '~/domain/lesson-planner/lesson-length';
import { asksForDeck } from '~/domain/lesson-planner/suggestions';
import { loadStackContents } from '~/domain/lesson-planner/stack-contents.server';
import {
  firstMessageTitle,
  shouldRenameLesson,
} from '~/domain/lesson-planner/lesson-name';
import { findWritingExerciseTypeIds } from '~/domain/lesson-planner/yawp-catalog.server';
import { TEMPLATE_DAYS, TEMPLATE_SLOTS } from '~/domain/lesson-planner/lesson-templates';
import { frameworkContext, readWeekFramework } from '~/domain/lesson-planner/plan-days';
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
  planningProgressClock,
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
// The whole conversation, as far back as a real one goes: a structure the
// teacher laid out at the start has to still be there (Brian's run 5).
const MAX_HISTORY_MESSAGES = 80;
const MAX_HISTORY_CHARS = 36_000;
// Lessons are long: a deck with speaker notes, a handout, and the quoted text
// of a Quick Writing Lesson run well past a report. A tight ceiling truncates
// mid-artifact, which a teacher reads as bad material rather than as a cut-off.
// Raised from 120 s on Nov 22: lessons ran 100 to 115 s, and one with a
// passage on its slides ran out at 120 s while still writing.
const PLANNER_REQUEST_DEADLINE_MS = 240_000;
/**
 * A failure before this leaves time for a whole second try under the deadline
 * (a lesson takes 90 to 130 s): one more try. 45 s until the re-test (Nov 22),
 * where a Romeo and Juliet lesson failed at 69 s and 75 s and the teacher got
 * nothing.
 */
const PLANNER_RETRY_WITHIN_MS = 95_000;
const HEARTBEAT_MS = 10_000;
// A full lesson plan plus a ten-slide deck with speaker notes runs well past
// 8k. Hitting the ceiling cuts the deck's JSON mid-object, and a cut-off deck
// cannot be rendered at all — the teacher just loses it.
// 16k since Nov 22: the passage now goes on the slide and the handout.
const PLANNER_MAX_TOKENS = 16_000;
// The repair pass rewrites one deck and nothing else.
const DECK_REPAIR_MAX_TOKENS = 6_000;
const DECK_REPAIR_DEADLINE_MS = 60_000;
/** A whole deck written from the plan, when the reply lost it: more room, and more time. */
const DECK_REBUILD_MAX_TOKENS = 10_000;
const DECK_REBUILD_DEADLINE_MS = 100_000;
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
    /** What the chat shows for a turn a button sent (Kevin, Oct 25, note 5). */
    displayText: z.string().trim().min(1).max(200).optional(),
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
    /**
     * Asked for on the stack page, not in the chat (Brian's run 6, item 2):
     * the deck is built where the teacher is working, and both turns are kept
     * as the stack's, one compact line in the chat.
     */
    surface: z.enum(['stack']).optional(),
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
      // A line every ten seconds while nothing else is said: a minute-long
      // repair pass in silence dropped the teacher's connection on the
      // preview, and the saved lesson never reached the screen (Nov 22).
      let last = Date.now();
      const heartbeat = setInterval(() => {
        if (Date.now() - last >= HEARTBEAT_MS) write({ type: 'keepalive' });
      }, HEARTBEAT_MS);
      try {
        const outcome = await run((progress) => {
          last = Date.now();
          write({ type: 'progress', ...progress });
        });
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
        clearInterval(heartbeat);
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

// Brian's run 5 (item 2): every teacher message, and the planner's replies
// in what is left of the budget, older ones as their outline.
function boundedHistory(
  messages: Array<{ role: string; content: string }>
): Array<{ role: string; content: string }> {
  return plannerHistory(messages, MAX_HISTORY_CHARS);
}

/**
 * A streamed turn answers at once, before anything else is done (round 3,
 * Nov 22: two of sixteen turns sent nothing for eight minutes, then worked on
 * a second try). The first line goes out the moment the request arrives; the
 * checks before the planner (the teacher, the lesson, the month's allowance)
 * run inside the stream, and what they answer arrives as its last line.
 */
export async function action(args: ActionFunctionArgs) {
  let streamed = false;
  try {
    streamed = (await args.request.clone().formData()).get('stream') === '1';
  } catch {
    streamed = false;
  }
  if (!streamed) return turnAction(args);
  // eslint-disable-next-line no-console
  console.info(`[lesson-planner] turn accepted at ${new Date().toISOString()}`);
  return streamFromStart(() => turnAction(args));
}

/** A finished answer of any shape as the stream's last line. */
async function doneLine(answer: unknown): Promise<Record<string, unknown>> {
  if (answer instanceof Response) {
    let payload: unknown;
    try {
      payload = await answer.json();
    } catch {
      payload = { error: PLANNER_FAILED };
    }
    return { type: 'done', status: answer.status, payload };
  }
  if (answer && typeof answer === 'object' && 'data' in answer && 'init' in answer) {
    const { data, init } = answer as { data: unknown; init?: { status?: number } | null };
    return { type: 'done', status: init?.status ?? 200, payload: data };
  }
  return { type: 'done', status: 200, payload: answer };
}

function streamFromStart(handle: () => Promise<unknown>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const line = (event: Record<string, unknown>) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      line({ type: 'progress', ...PLANNING_PROGRESS_START });
      const heartbeat = setInterval(() => line({ type: 'keepalive' }), HEARTBEAT_MS);
      try {
        let answer: unknown;
        try {
          answer = await handle();
        } catch (thrown) {
          answer = thrown instanceof Response ? thrown : null;
        }
        clearInterval(heartbeat);
        if (answer instanceof Response && (answer.headers.get('Content-Type') ?? '').includes('ndjson') && answer.body) {
          const reader = answer.body.getReader();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
        } else if (answer === null) {
          line({ type: 'done', status: 500, payload: { error: PLANNER_FAILED } });
        } else {
          line(await doneLine(answer));
        }
      } catch {
        line({ type: 'done', status: 500, payload: { error: PLANNER_FAILED } });
      } finally {
        clearInterval(heartbeat);
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' },
  });
}

async function turnAction({ request }: ActionFunctionArgs) {
  await requireMutableRequest(request);
  const access = await requireLessonPlannerAccess(request);

  const { error, data } = await parseFormData(request, POST);
  if (error) return validationError(error);
  // Bound once here, where the guard above is still in view: the turn itself
  // runs inside a closure, and TypeScript cannot carry the narrowing into it.
  const turn = data;
  if (turn.surface && !turn.conversationId) {
    return dataResponse({ error: 'A stack turn belongs to a lesson.' }, { status: 400 });
  }

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
  const lessonPlannerMetering = monthlyPolicy.lessonPlannerMeteringEnabled;
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
  if (lessonPlannerMetering && turn.requestId) {
    const replay = await replayMonthlyOperation({
      organizationId: ctx.organizationId,
      membershipId: ctx.membershipId,
      feature: 'lesson-planner',
      requestId: turn.requestId,
      input: operationInput,
    });
    if (replay) return monthlyResponse(monthlyOperationResponse(replay));
  }
  if (
    lessonPlannerMetering &&
    !activeConversationForQuota &&
    lessonPlannerMonthlyQuotaEnforced(monthlyPolicy.limits)
  ) {
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
  if (
    !activeConversationForQuota &&
    !lessonPlannerMetering &&
    (monthlyPolicy.meteringLookupFailed ||
      (await organizationHasPendingFreeTierLessonPlannerMetering(
        ctx.organizationId
      )))
  ) {
    return monthlyResponse(
      Response.json({ error: PLANNER_FAILED }, { status: 503 })
    );
  }
  if (!activeConversationForQuota && !lessonPlannerMetering) {
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
    let unitContext: ReturnType<typeof buildUnitContext> = null;
    const unitId = dayTarget?.unitId ?? activeConversation?.unitId ?? null;
    const activeDay = dayTarget
      ? turn.unitDay!
      : (activeConversation?.unitDay ?? null);
    // A day made from a week's framework hears its place in that week.
    let weekContext: string[] = [];
    if (unitId && activeDay != null) {
      const map = await loadUnitMap({ db: prisma, unitId });
      unitContext = map ? buildUnitContext(map, activeDay) : null;
      const unit = await prisma.lessonPlanUnit.findFirst({
        where: { id: unitId, deletedAt: null },
        select: { title: true, framework: true },
      });
      const framework = readWeekFramework(unit?.framework);
      if (framework && unit) weekContext = frameworkContext(framework, unit.title, activeDay);
    }

    // Whether this teacher can actually assign an exit ticket. Without the type
    // there is no button under the block, so the planner is told to stay on the
    // printable ticket rather than offer a door that is not there.
    const exitTicketsAvailable = Boolean(
      (await findWritingExerciseTypeIds(ctx)).exitTicket
    );
    // The v3 hand-off only where the v3 sheet will open it: same flag, same school.
    const exitTicketBuilderV3 =
      exitTicketsAvailable &&
      (await isExitTicketBuilderV3Enabled(ctx.organizationId));

    // Brian's review (B6): with stack v2 on, outputs are built from what the
    // teacher kept, so the planner sees the stack itself, not just its titles.
    const {
      stackV2,
      intakeV2,
      templates: templatesOn,
      deckGallery,
      deckKitV4,
      deckKitV41,
      contextTools,
      foundPictures,
      uploads: uploadsOn,
      teachMySlides,
      refreshMyDeck,
    } = await getLessonPlannerReviewFlags(ctx.organizationId);
    const deckChoices = { teach: teachMySlides, refresh: refreshMyDeck };
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
          select: {
            id: true,
            name: true,
            text: true,
            truncated: true,
            conversationId: true,
            // The teacher's own deck (Nov 1): what they want from it, and its pictures to place.
            keptDeck: true,
            mode: true,
            deckMessageId: true,
            ...(refreshMyDeck || teachMySlides
              ? {
                  pictures: {
                    orderBy: { position: 'asc' as const },
                    select: { id: true, position: true, slideNumbers: true, altText: true, width: true, height: true },
                  },
                }
              : {}),
          },
        })
      : [];
    const attachUploadIds = sources.filter((source) => !source.conversationId).map((source) => source.id);
    // An uploaded deck (Brian, Nov 4): whether its deck has been made, and the
    // teacher's answer to "rework it, or keep it as is?" if this message is one.
    for (const source of sources as Array<(typeof sources)[number] & { deckMessageId?: string | null; deckBuilt?: boolean }>) {
      source.deckBuilt = Boolean(source.deckMessageId);
    }
    await applyDeckChoice({ sources, message: turn.message, choices: deckChoices, membershipId: ctx.membershipId });
    // The lesson's own pictures (Kevin, Nov 6): a Yawp! lesson's deck, or a
    // picture added in the slide editor, belongs to the lesson and not to an
    // upload, so a rebuilt deck would lose them unless they are listed too.
    const lessonPictures =
      activeConversation && (refreshMyDeck || teachMySlides)
        ? await prisma.lessonPlanUploadPicture.findMany({
            where: { conversationId: activeConversation.id, uploadId: null, membershipId: ctx.membershipId },
            orderBy: { position: 'asc' },
            select: { id: true, position: true, slideNumbers: true, altText: true, width: true, height: true },
          })
        : [];
    // Brian's run 3: a lesson built from the teacher's own template keeps its
    // shape. Only the teacher's own, and only with templates on.
    const templateRow =
      templatesOn && turn.templateId
        ? await prisma.lessonPlanTemplate.findFirst({
            where: { id: turn.templateId, membershipId: access.membership.id, deletedAt: null },
            select: { id: true, name: true, slots: true, periodMinutes: true, days: true },
          })
        : null;
    const parsedSlots = templateRow ? TEMPLATE_SLOTS.safeParse(templateRow.slots) : null;
    const parsedDays = templateRow?.days ? TEMPLATE_DAYS.safeParse(templateRow.days) : null;
    const template =
      templateRow && parsedSlots?.success
        ? {
            id: templateRow.id,
            name: templateRow.name,
            slots: parsedSlots.data,
            periodMinutes: templateRow.periodMinutes,
            days: parsedDays?.success ? parsedDays.data : null,
          }
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
        : null) ??
      // A day being built for the first time plans to the unit's period (note 8a).
      (dayTarget && !activeConversation && (unitContext?.day.minutes || conversation?.periodMinutes)
        ? {
            minutes: (unitContext?.day.minutes ?? conversation?.periodMinutes)!,
            classLabel: conversation?.lessonClassLabel ?? null,
          }
        : null);

    // The paintings on this teacher's other recent decks, so a painting is
    // chosen for the lesson rather than reused (Kevin, Oct 22).
    const recentArt = deckGallery
      ? recentArtFrom(
          (
            await prisma.lessonPlanMessage.findMany({
              where: {
                role: AgentType.Assistant,
                content: { contains: '```yawp-slides' },
                conversation: {
                  membershipId: ctx.membershipId,
                  deletedAt: null,
                  ...(activeConversation ? { id: { not: activeConversation.id } } : {}),
                },
              },
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              take: 20,
              select: { content: true },
            })
          ).map((message) => message.content)
        )
      : [];

    // A unit, or a paired lesson, asks what it is for before it is built (Nov 26).
    const askPurpose = intakeV2 && !dayTarget ? purposeToAsk(turn.message, { firstTurn: priorMessages.length === 0 }) : null;
    const system = buildLessonPlannerSystemPromptBlocks({
      teacherName: null,
      lessonLength,
      askPurpose,
      organizationName: access.membership.organization.name,
      lessonInventory: conversation?.materials ?? [],
      stackContents,
      intakeV2,
      unitContext,
      exitTicketsAvailable,
      exitTicketBuilderV3,
      writingPracticeAvailable: ctx.writingPracticeEnabled,
      template,
      deckGallery,
      deckKitV4,
      deckKitV41,
      contextTools,
      foundPictures,
      sources,
      lessonPictures,
      deckChoices,
      recentArt,
      weekContext,
      onStack: turn.surface === 'stack',
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
    // Pictures the planner found this turn (Nov 21): kept with the lesson, or
    // attached to it when this turn writes it.
    const foundPictureIds: string[] = [];

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
      // What the teacher is told while they wait: the lookup in hand, then
      // "Writing the lesson" once the lookups have stopped (bot test, Nov 19).
      const clock = planningProgressClock(report);
      const deadline = AbortSignal.timeout(PLANNER_REQUEST_DEADLINE_MS);
      const startedAt = Date.now();
      // The text a lesson is about, fetched while the planner writes, for the
      // quotation check after it (Nov 22). Never waited on here.
      // A teacher names the work once ("Hamlet's 'To be, or not to be'");
      // a reply is read with more care (re-test, Nov 22: Hamlet and Romeo
      // and Juliet went unchecked).
      const workAsked =
        workForText(turn.message, { mentions: 1 }) ??
        // A follow-up ("For English 11, 50 minutes") names no work: the
        // teacher's earlier messages in the lesson do (round 4, Nov 22: the
        // Gatsby lesson, built after its class question, went unchecked).
        workForText(
          (activeConversation?.messages ?? [])
            .filter((message) => message.role === 'user')
            .map((message) => message.content)
            .join('\n'),
          { mentions: 1 }
        );
      // Every registered text, fetched quietly while lessons are written.
      void warmSourceTexts().catch(() => null);
      if (workAsked) void fetchWorkText(workAsked).catch(() => null);
      const ask = () => getLLMCompletion({
          model: (process.env.AI_MODEL as any) ?? DEFAULT_ANTHROPIC_MODEL,
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
            clock.lookup(name, input, toolRound);
            try {
              // Read from this turn's own documents: never another lesson's.
              if (name === UPLOAD_TOOL.name) return JSON.stringify(readUploadPart(sources, input));
              const result = await handleLessonPlannerToolCall(name, input, ctx);
              for (const link of collectToolLinks(result)) toolLinks.add(link);
              return result;
            } finally {
              clock.lookedUp();
            }
          },
          allowFallbackProvider: false,
          signal: deadline,
          logPayload: 'metadata-only',
          metadata: {
            feature: 'lesson-planner',
          },
        });
      try {
        try {
          reply = await ask();
        } catch (first) {
          // Failed turns on the preview (Nov 22) failed in 5, 22, 69 and 75
          // seconds: a busy or dropped call, not the lesson. One more try, quietly.
          if (deadline.aborted || isProviderConfigurationError(first) || Date.now() - startedAt > PLANNER_RETRY_WITHIN_MS) throw first;
          // eslint-disable-next-line no-console
          console.warn(`[lesson-planner] model call failed early, trying once more: ${describeProviderError(first)}`);
          toolRound = 0;
          reply = await ask();
        }
      } catch (error) {
        // The one place the planner's failures are visible. The LLM log for this
        // feature is metadata-only, so without this line an operator sees that
        // the turn failed and nothing about why — a rejected key, a model name
        // that does not exist, and a request that ran out of time all look the
        // same from the outside. No prompt content: only the shape of the error.
        // eslint-disable-next-line no-console
        clock.stop();
        // How long it ran, how many lookups it made, and whether the deadline
        // ended it, or the lookups ran out: a unit day on the preview failed
        // after a long wait with only "Error" to show for it (Nov 21).
        const ranOut = error instanceof Error && /maximum rounds/i.test(error.message);
        console.error(
          `[lesson-planner] model call failed: ${describeProviderError(error)} · after ${Math.round((Date.now() - startedAt) / 1000)}s · ${toolRound} lookups${deadline.aborted ? ' · deadline reached' : ''}${ranOut ? ' · lookup rounds ran out' : ''}`
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

      // The reply is in hand. The line has said "Writing the lesson" since a
      // few seconds after the last lookup; this is for a reply that came
      // back sooner than that.
      clock.writing();
      // A blank the planner ran on for pages is a short blank (Nov 22).
      reply = withoutRunawayBlanks(reply);

      // The model writes its deck blind — nothing in the reply tells it whether the
      // JSON validated. Give a rejected deck the errors and one more pass before
      // the teacher ever sees the reply; a failed repair changes nothing.
      const repaired = await repairSlideDeck({
        reply,
        // A deck the teacher asked for and the reply lost is written from the
        // lesson's plan (rules test, Nov 23: the Odyssey deck lost to a runaway blank).
        wanted: /\b(?:slide ?deck|slides|deck|powerpoint|presentation)\b/i.test(turn.message),
        repair: async ({ instruction, reason }) => {
          const rebuild = reason === 'no deck in the reply';
          // A deck is being written a second time: up to a minute more, and said so.
          clock.checkingDeck();
          try {
            await reservePlannerAi();
          } catch (admissionError) {
            if (admissionError instanceof AiRateLimitError) {
              throw admissionError;
            }
            throw new Error(PLANNER_FAILED);
          }
          return getLLMCompletion({
            model: (process.env.AI_MODEL as any) ?? DEFAULT_ANTHROPIC_MODEL,
            system: DECK_REPAIR_SYSTEM,
            messages: [{ role: AgentType.User, content: instruction }],
            maxTokens: rebuild ? DECK_REBUILD_MAX_TOKENS : DECK_REPAIR_MAX_TOKENS,
            attribution: {
              organizationId: ctx.organizationId,
              membershipId: ctx.membershipId,
              route: 'routes/api.domain.lesson-planner',
              requestId: crypto.randomUUID(),
              ipHash: computeIpHash(request),
            },
            allowFallbackProvider: false,
            signal: AbortSignal.timeout(rebuild ? DECK_REBUILD_DEADLINE_MS : DECK_REPAIR_DEADLINE_MS),
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
      // Exactly right (13-lesson review, Nov 22: every lesson had an error of
      // fact or quotation). A quotation of a public-domain work is checked
      // against the work itself and corrected; then a second model checks the
      // facts. What neither can fix safely is a note for the teacher. A
      // failure leaves the reply as the planner wrote it.
      let checks: Record<string, string | number> | null = null;
      let pictureReport: Record<string, unknown> | null = null;
      try {
        const checkedAt = Date.now();
        // The work the teacher named; a short follow-up ("now the handout")
        // names none, and the reply's own words say which. A long request that
        // names no registered work is about one that is not registered (Things
        // Fall Apart is not Heart of Darkness, though its lesson names both).
        const followUp = turn.message.trim().split(/\s+/).length < 15;
        const registeredWork = workAsked ?? (followUp ? workForText(reply) : null);
        // The teacher's own pages (plan item 12, Nov 23): for a work Yawp! does
        // not hold whole, what the teacher uploaded is the text, and every
        // quotation is checked and corrected against it.
        const against = chooseCheckedAgainst(registeredWork, teacherPages(sources));
        const checkedWork = against.kind === 'none' ? null : against.work;
        const checkQuotes = async (text: string) =>
          against.kind === 'pages'
            ? { ...checkQuotations(text, against.source, { work: against.work }), work: against.work }
            : await withQuotationCheck(text, { work: checkedWork });
        // A companion poem's lines are checked against the poem itself first (Nov 26).
        const companions = withCompanionsChecked(reply);
        reply = companions.reply;
        const quoted = await checkQuotes(reply);
        reply = quoted.reply;
        const attribution = () => ({
          organizationId: ctx.organizationId,
          membershipId: ctx.membershipId,
          route: 'routes/api.domain.lesson-planner',
          requestId: crypto.randomUUID(),
          ipHash: computeIpHash(request),
        });
        const askFacts = factCheckCall(attribution);
        const facts = askFacts ? await withFactCheck(reply, askFacts, { protect: [...quoted.verified, ...companions.verified] }) : { reply, applied: [], flagged: [] };
        reply = facts.reply;
        // Fix it, don't flag it (plan item 1, Nov 22): what the checks found
        // and could not swap word for word goes to a repair pass, which fixes
        // every place the lesson relies on it. Only what it cannot fix is
        // left for the teacher.
        const problems: Array<Problem & { note: string }> = [
          ...quoted.misplaced.map((miss) => ({
            what: `The lesson places the quotation "${miss.quote.slice(0, 160)}" in ${miss.claimed}; it is in ${miss.actual}.`,
            words: miss.quote.slice(0, 200),
            note: `“${miss.quote.slice(0, 80)}${miss.quote.length > 80 ? '…' : ''}” is in ${miss.actual}, not ${miss.claimed}.`,
          })),
          ...facts.flagged
            .filter((error) => !aboutSettledQuotation(error, [...quoted.verified, ...quoted.misplaced.map((miss) => miss.quote)]))
            .map((error) => {
              const words = checkNoteWords(error.wrong);
              return { what: error.why, words: error.wrong, right: error.right, note: `“${words.slice(0, 80)}${words.length > 80 ? '…' : ''}”: ${error.why}` };
            }),
        ];
        const askRepair = problems.length ? factCheckCall(attribution, { schema: LESSON_REPAIR_SCHEMA, feature: 'lesson-planner-repair', timeoutMs: 35_000, maxTokens: 6_000 }) : undefined;
        const repair = askRepair ? await withLessonRepair(reply, problems, askRepair, { protect: [...quoted.verified, ...companions.verified] }) : { reply, repaired: [], left: problems };
        let requoted: Awaited<ReturnType<typeof withQuotationCheck>> | null = null;
        if (repair.repaired.length) {
          // A repair may quote: it is checked against the work like the rest.
          requoted = await checkQuotes(repair.reply);
          reply = requoted.reply;
        }
        const stillMisplaced = (requoted?.misplaced ?? []).filter((miss) => !quoted.misplaced.some((was) => was.quote === miss.quote));
        // The true lines on the excerpt slides, one to a line, with any lines
        // left out marked (plan item 2, Nov 22), from the text just checked.
        // Not for a text kept only to verify against (Dickinson's 1890 editors
        // changed her words; Homer in a translation the teacher may not use):
        // there the slide would disagree with the handout (Nov 22).
        const checkedSource = against.kind === 'pages' ? against.source : checkedWork ? preparedSourceOf(checkedWork) : null;
        const excerpts = checkedWork && !checkedWork.verifyOnly ? withExcerptsFromSource(reply, checkedSource) : { reply, rewritten: 0 };
        reply = excerpts.reply;
        reply = withCheckNote(reply, [
          ...(repair.left as Array<Problem & { note?: string }>).map((problem) => problem.note ?? problem.what),
          ...stillMisplaced.map((miss) => `“${miss.quote.slice(0, 80)}${miss.quote.length > 80 ? '…' : ''}” is in ${miss.actual}, not ${miss.claimed}.`),
        ]);
        // What the quotations were checked against, or that they were not and
        // how to fix it (Kevin, Nov 23). A text that could not be had in time
        // checked nothing, and says so.
        const finalCheck = requoted ?? quoted;
        // A companion's lines were found in the companion: not "not found" in the work.
        const inCompanion = (quote: string) => companions.verified.some((line) => line.includes(quote.trim()) || quote.includes(line.trim()));
        reply = withQuotationsLabel(reply, checkedSource ? against : against.kind === 'registered' ? { kind: 'unavailable', work: against.work } : { kind: 'none' }, {
          verified: finalCheck.verified.length,
          corrected: quoted.corrections.length + (requoted?.corrections.length ?? 0),
          unverified: finalCheck.unverified.filter((miss) => !inCompanion(miss.quote)).length,
        });
        // Counts only, never the lesson: in the log, and to the client, which
        // shows nothing of it (it lets a test see the checks ran).
        checks = {
          work: against.kind === 'pages' ? 'pages' : (quoted.work?.id ?? 'none'),
          ...(quoted.work && sourceTextFailure(quoted.work) ? { source: sourceTextFailure(quoted.work)! } : {}),
          quotationsCorrected: quoted.corrections.length,
          quotationsVerified: quoted.verified.length,
          quotationsUnverified: quoted.unverified.length,
          quotationsMisplaced: quoted.misplaced.length,
          factsCorrected: facts.applied.length,
          factsFlagged: facts.flagged.length,
          repaired: repair.repaired.length,
          excerptsFromSource: excerpts.rewritten,
          companions: companions.used.map((companion) => companion.id).join(',') || 'none',
          companionVerified: companions.verified.length,
          companionCorrected: companions.corrected,
          leftForTeacher: repair.left.length + stillMisplaced.length,
          ms: Date.now() - checkedAt,
        };
        // eslint-disable-next-line no-console
        console.info(
          `[lesson-planner] accuracy: work ${quoted.work?.id ?? 'none'} · quotations corrected ${quoted.corrections.length}, verified ${quoted.verified.length}, unverified ${quoted.unverified.length}, misplaced ${quoted.misplaced.length} · facts corrected ${facts.applied.length}, flagged ${facts.flagged.length} · ${Date.now() - checkedAt}ms`
        );
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[lesson-planner] accuracy check failed:', error instanceof Error ? error.name : 'error');
      }
      // Minutes that agree (Nov 22): the deck's agenda and slide minutes come
      // from the plan's steps, never written separately.
      reply = withDeckMatchingPlan(reply);
      // The writing on the slides is the writing "Add everything" files (round 3, Nov 22).
      reply = withWriteSlidesAsFiled(reply);
      // A map slide's places are found in Yawp!'s own place list (Nov 19): a
      // pin is never where the model guessed.
      reply = withResolvedPlaces(reply);
      // A picture beside the words (Nov 22, dual coding): what each slide asked
      // for is found by its subject and kept with the lesson. After the reply is
      // in hand and inside its own short limit, so a picture never costs the
      // lesson; a failure leaves the deck as the planner wrote it.
      if (foundPictures) {
        const lookedAt = Date.now();
        try {
          // The picture editor names a subject for each teaching slide that asks
          // for none, and the second look checks each picture before it is kept
          // (Nov 22, night): the whole step inside sixteen seconds.
          const pictureModel = pictureModelCalls(() => ({
            organizationId: ctx.organizationId,
            membershipId: ctx.membershipId,
            route: 'routes/api.domain.lesson-planner',
            requestId: crypto.randomUUID(),
            ipHash: computeIpHash(request),
          }));
          const pictured = await withResolvedPictures(
            reply,
            { membershipId: ctx.membershipId, conversationId: activeConversation?.id ?? null },
            {
              shelf: pictureShelf,
              // A second try for a few subjects is a search, downloads and one more look.
              deadlineMs: 32_000,
              ...pictureModel,
              // The work's vetted pictures, from what the teacher asked for in this lesson.
              kit: visualKitFor(
                [turn.message, ...(activeConversation?.messages ?? []).filter((message) => message.role === 'user').map((message) => message.content)].join('\n')
              ),
            }
          );
          reply = pictured.reply;
          foundPictureIds.push(...pictured.ids);
          // Counts and reasons only, never the lesson: why a picture was not
          // found is otherwise invisible outside the server's log.
          pictureReport = {
            ...pictured.counts,
            named: pictured.named,
            reasons: pictured.empty.reduce<Record<string, number>>((tally, miss) => ({ ...tally, [miss.why]: (tally[miss.why] ?? 0) + 1 }), {}),
            misses: pictured.empty.map((miss) => `${miss.subject.slice(0, 60)}: ${miss.why}${miss.said ? ` (${miss.said})` : ''}`).slice(0, 20),
            ...(pictured.look ? { look: pictured.look } : {}),
            ms: Date.now() - lookedAt,
          };
          if (pictured.counts.wanted || pictured.named) {
            const reasons = pictured.empty.reduce<Record<string, number>>((tally, miss) => ({ ...tally, [miss.why]: (tally[miss.why] ?? 0) + 1 }), {});
            // Counts only, never what the lesson is about.
            // eslint-disable-next-line no-console
            console.info(
              `[lesson-planner] pictures: wanted ${pictured.counts.wanted} · filled ${pictured.counts.filled} (${pictured.counts.reused} reused) · empty ${pictured.counts.empty}${
                pictured.counts.empty ? ` (${Object.entries(reasons).map(([why, n]) => `${why}: ${n}`).join(', ')})` : ''
              } · named ${pictured.named}${
                pictured.look ? ` · looked at ${pictured.look.seen}, turned down ${pictured.look.turnedDown}${pictured.look.unchecked ? `, not answered for ${pictured.look.unchecked}` : ''}` : ''
              } · ${Date.now() - lookedAt}ms`
            );
          }
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error('[lesson-planner] pictures failed:', error instanceof Error ? error.name : 'error');
        }
      }
      // What the reply says is what was made: no weighing of paintings
      // against the teacher's other lessons, no painting the deck does not have.
      reply = withoutArtTalk(reply);
      // No narration of the planner's own process, and a unit's map before
      // its reasons (Kevin, Nov 23: "a wall of text").
      reply = withStartersOnDays(withUnitMapFirst(withoutProcessTalk(reply)));

      // A link the catalog never handed back goes nowhere, and a teacher finds that
      // out in front of a class. Strip the href and keep the words. Done before the
      // reply is stored, so the dead link never enters the conversation's history
      // either.
      reply = verifyLessonLinks(reply, toolLinks).reply;
      // A card promising material is a louder claim than a sentence, so the same
      // rule applies harder: no block survives whose address a tool never returned.
      reply = verifyLessonResources(reply, toolLinks).reply;

      // "Keep it as is" (Brian, Nov 4): their deck, slide for slide, is this
      // reply's deck, so it is in the stack when the teacher opens it.
      const keptDeck = await keptDeckBlock({ sources, choices: deckChoices, membershipId: ctx.membershipId }).catch(() => null);
      if (keptDeck) reply = withKeptDeck(reply, keptDeck.block);

      // A lesson is named after the plan it turned out to be, not after the
      // sentence that started it — otherwise every lesson opened from the pinned
      // suggestion is called "Look at my classes and tell me what they need work
      // on", and the history is unreadable.
      const lessonName = shouldRenameLesson({
        reply,
        priorReplies: priorMessages
          .filter((message) => message.role === AgentType.Assistant)
          .map((message) => message.content),
        // A packet name, or a rename on the stack or in the library (Oct 24 handoff).
        teacherNamedIt: Boolean(activeConversation?.packetTitle?.trim() || activeConversation?.originalTitle),
        stillPlaceholder: (() => {
          const first = priorMessages.find((message) => message.role === AgentType.User);
          return Boolean(activeConversation && first && activeConversation.title === firstMessageTitle(first.content));
        })(),
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
                  // Same class and period as the chat that planned the unit (note 8a).
                  dayMinutes: unitContext?.day.minutes ?? null,
                  from: conversation
                    ? {
                        periodMinutes: conversation.periodMinutes,
                        lessonClassLabel: conversation.lessonClassLabel,
                        originClassAssignmentId: conversation.originClassAssignmentId,
                      }
                    : null,
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

          if (foundPictureIds.length) {
            await transaction.lessonPlanUploadPicture.updateMany({
              where: { id: { in: foundPictureIds }, membershipId: ctx.membershipId, conversationId: null, uploadId: null },
              data: { conversationId: persistedConversation.id },
            });
          }
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
              ...(turn.surface ? { surface: turn.surface } : {}),
              ...(turn.displayText ? { displayText: turn.displayText } : {}),
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
              ...(turn.surface ? { surface: turn.surface } : {}),
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

      // The deck an uploaded deck asked for goes into the lesson's stack now,
      // not when the teacher remembers to add it (Brian, Nov 4). Never fails
      // the turn: the reply, with its deck, is already saved.
      let filed: string[] = [];
      try {
        filed = await fileUploadedDeck({
          conversationId,
          message: { id: assistantMessageId, createdAt: answeredAt, content: reply },
          sources,
          choices: deckChoices,
          keptUploadId: keptDeck?.uploadId ?? null,
          onStack: turn.surface === 'stack',
        });
      } catch (error) {
        console.error('[lesson-planner] uploaded deck not filed', error instanceof Error ? error.message : 'unknown');
      }
      // A handout asked for after the lesson was built ("Build the student
      // handout for this lesson") goes into that lesson, beside the pieces
      // already there: on the preview (Nov 22) it never reached the printed
      // packet, and students were left without the passage.
      try {
        filed = [...filed, ...(await fileLaterHandout({ conversationId, message: { id: assistantMessageId, createdAt: answeredAt, content: reply }, teacherMessage: turn.message }))];
      } catch (error) {
        console.error('[lesson-planner] handout not filed', error instanceof Error ? error.message : 'unknown');
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
          // "<messageId>:<blockKey>" now in the lesson's stack (Nov 4).
          ...(filed.length ? { filed } : {}),
          ...(checks ? { checks } : {}),
          ...(pictureReport ? { pictures: pictureReport } : {}),
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
