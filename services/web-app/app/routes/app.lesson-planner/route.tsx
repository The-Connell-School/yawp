import { useEffect, useRef, useState } from 'react';
import {
  Link,
  redirect,
  useFetcher,
  useLoaderData,
  useRevalidator,
  useSearchParams,
  type LoaderFunctionArgs,
} from 'react-router';
import {
  BookmarkCheck,
  BookmarkPlus,
  CornerDownRight,
  FileText,
  Lightbulb,
  Loader2,
  ChevronDown,
  Plus,
  Printer,
  Send,
} from 'lucide-react';
import { Button } from '~/components/ui/button';
import { Textarea } from '~/components/ui/textarea';
import { cn } from '~/utils/misc';
import { prisma } from '~/utils/db.server';
import { getLessonPlannerAccess } from '~/utils/lesson-planner/lesson-planner-access.server';
import { RECOMMENDED_LESSON_PLANNER_PROMPTS } from '~/routes/api.domain.lesson-planner/build-system-prompt';
import { parseAssistantMessage } from '~/components/ai-chat/parse-assistant-message';
import {
  MarkdownContent,
  printAssistantMessage,
} from '~/components/ai-chat/assistant-markdown';
import { SlideDeckCard } from '~/components/ai-chat/slide-deck-card';
import { readSlideDeck } from '~/domain/lesson-planner/slide-deck';
import {
  DECK_SLOT,
  readLessonMaterials,
} from '~/domain/lesson-planner/lesson-material';
import { MaterialCard } from '~/components/ai-chat/material-card';
import { LessonAskCard } from '~/components/ai-chat/lesson-ask-card';
import {
  asksWorthShowing,
  readLessonAsks,
} from '~/domain/lesson-planner/lesson-ask';
import {
  partsSummary,
  splitReplyParts,
} from '~/domain/lesson-planner/reply-parts';
import { linkMaterialTitles } from '~/domain/lesson-planner/lesson-material';
import { LessonResourceCard } from '~/components/ai-chat/lesson-resource-card';
import { DailyPagesCard } from '~/components/ai-chat/daily-pages-card';
import { ExitTicketCard } from '~/components/ai-chat/exit-ticket-card';
import { UnitPlanCard } from '~/components/ai-chat/unit-plan-card';
import { readUnitPlan } from '~/domain/lesson-planner/unit-plan';
import { findWritingExerciseTypeIds } from '~/domain/lesson-planner/yawp-catalog.server';
import {
  looksLikeLessonPlan,
  mentionsRoomPersonality,
  openingAsksAboutATaughtLesson,
  withStandardSuggestions,
} from '~/domain/lesson-planner/suggestions';
import { loadLessonSeed } from '~/domain/lesson-planner/lesson-seed.server';
import { LessonRail } from './lesson-rail';
import { PromptTiles } from './prompt-tiles';
import { useRotatingPlaceholder } from './rotating-placeholder';
import {
  PlanningProgressBar,
  type PlanningProgressState,
} from '~/components/ai-chat/planning-progress-bar';
import { PLANNING_PROGRESS_START } from '~/domain/lesson-planner/planning-progress';

type PacketAudience = 'teacher' | 'student';

/** Shown when the turn never made it back — distinct from one the server refused. */
const PLANNER_UNREACHABLE =
  'That lesson did not come back. Please check your connection and try again.';

type ChatMessage = {
  /** Absent only for an optimistic user turn that has not been written yet. */
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  /** Set when this reply is kept in the printable packet. */
  keptAudience?: PacketAudience | null;
};

export async function loader({ request }: LoaderFunctionArgs) {
  const access = await getLessonPlannerAccess(request);
  if (!access.allowed) {
    // Keep the feature invisible for orgs without it / non-teachers.
    throw redirect('/app');
  }

  const url = new URL(request.url);
  const selectedId = url.searchParams.get('c');

  const conversations = await prisma.lessonPlanConversation.findMany({
    where: { membershipId: access.membership.id, deletedAt: null },
    // packetTitle when the teacher named the lesson: naming it on the packet
    // should rename it everywhere, not just on that page.
    select: {
      id: true,
      title: true,
      packetTitle: true,
      updatedAt: true,
      publishedAt: true,
      // Whether this lesson has a stack to open onto. A published lesson opens
      // on the stack rather than the conversation, and one with nothing kept
      // would open on a page saying so.
      _count: {
        select: {
          messages: { where: { keptAt: { not: null } } },
          materials: true,
        },
      },
    },
    orderBy: [{ publishedAt: 'desc' }, { updatedAt: 'desc' }],
    take: 30,
  });

  const selected =
    selectedId != null
      ? await prisma.lessonPlanConversation.findFirst({
          where: {
            id: selectedId,
            membershipId: access.membership.id,
            deletedAt: null,
          },
          select: {
            id: true,
            title: true,
            unitId: true,
            unitDay: true,
            messages: {
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
              select: {
                id: true,
                role: true,
                content: true,
                keptAudience: true,
              },
            },
            materials: {
              select: { sourceMessageId: true, blockKey: true, kind: true },
            },
          },
        })
      : null;

  // Opened from a Class Summary next step: rebuild the opening ask on the
  // server from the stored insight, so the URL carries ids rather than text a
  // client could rewrite.
  const seed = selected
    ? null
    : await loadLessonSeed({
        membershipId: access.membership.id,
        classAssignmentId: url.searchParams.get('from'),
        stepIndex: url.searchParams.get('step'),
      });

  // Which days of this unit already have a lesson, so the board offers a way
  // back into a built day rather than building it a second time — and where
  // the map itself lives, so a day has a way home.
  const builtDays: Record<number, string> = {};
  let unitMapConversation: string | null = null;
  if (selected?.unitId) {
    const siblings = await prisma.lessonPlanConversation.findMany({
      where: { unitId: selected.unitId, deletedAt: null },
      select: { id: true, unitDay: true },
    });
    for (const sibling of siblings) {
      if (sibling.unitDay === null) unitMapConversation = sibling.id;
      else builtDays[sibling.unitDay] = sibling.id;
    }
  }

  // Needed to turn what the planner wrote into real assignments: the warm-up at
  // one end of the lesson and the check for understanding at the other. A class
  // starter has to reach its own sheet rather than Daily Pages, which grades
  // for depth a three-minute starter never asked for. Any of the three being
  // null for an org just means no button on that offer.
  const {
    dailyPages: dailyPagesTypeId,
    classStarter: classStarterTypeId,
    exitTicket: exitTicketTypeId,
  } = await findWritingExerciseTypeIds({
    membershipId: access.membership.id,
    organizationId: access.membership.organization.id,
  });

  return {
    dailyPagesTypeId,
    classStarterTypeId,
    exitTicketTypeId,
    conversations: conversations.map((conversation) => ({
      id: conversation.id,
      title: conversation.packetTitle?.trim() || conversation.title,
      published: Boolean(conversation.publishedAt),
      sectionCount:
        conversation._count.messages + conversation._count.materials,
    })),
    builtDays,
    unitMapConversation,
    selectedConversation: selected
      ? {
          id: selected.id,
          title: selected.title,
          unitId: selected.unitId,
          unitDay: selected.unitDay,
          messages: selected.messages as ChatMessage[],
          // "<messageId>:<blockKey>" for every material already in the packet,
          // so each card knows whether it has been added.
          addedMaterials: selected.materials.map(
            (material) => `${material.sourceMessageId}:${material.blockKey}`
          ),
          // What the lesson already holds, so the planner is not offered to
          // build something it has.
          lessonHas: {
            deck: selected.materials.some(
              (material) => material.kind === 'slides'
            ),
            handout: selected.materials.some((material) =>
              ['handout', 'sample', 'exit-ticket'].includes(material.kind)
            ),
          },
        }
      : null,
    recommendedPrompts: RECOMMENDED_LESSON_PLANNER_PROMPTS,
    seed,
  };
}

type LessonPlannerActionData = {
  conversationId?: string;
  messageId?: string;
  reply?: string;
  isNewConversation?: boolean;
  error?: string;
  unitId?: string | null;
  /** Set when the turn was a "build this day" click. */
  unitDay?: number | null;
  openedNewDay?: boolean;
};

export default function LessonPlannerRoute() {
  const {
    conversations,
    selectedConversation,
    recommendedPrompts,
    seed,
    dailyPagesTypeId,
    classStarterTypeId,
    exitTicketTypeId,
    builtDays,
    unitMapConversation,
  } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const fetcher = useFetcher<LessonPlannerActionData>();
  const revalidator = useRevalidator();
  // The streamed turn's result and its milestones. The turn is sent with a raw
  // fetch rather than the fetcher, because a fetcher cannot read a response as
  // it arrives.
  const [streamed, setStreamed] = useState<LessonPlannerActionData | null>(
    null
  );
  const [progress, setProgress] = useState<PlanningProgressState | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>(
    selectedConversation?.messages ?? []
  );
  // A Class Summary hand-off pre-fills the composer instead of auto-sending, so
  // the teacher can add their class's context before spending a turn.
  const [input, setInput] = useState(seed?.prompt ?? '');
  // The conversation created by the last send, until the URL/loader catch up.
  // Without it, a quick follow-up message would start a second conversation.
  const [pendingConversationId, setPendingConversationId] = useState<
    string | null
  >(null);
  // The turn currently in flight and which conversation it belongs to, so a
  // reply can never be appended to a different transcript.
  const [pendingSubmission, setPendingSubmission] = useState<{
    message: string;
    conversationKey: string;
  } | null>(null);
  const [addedMaterials, setAddedMaterials] = useState<Set<string>>(
    () => new Set(selectedConversation?.addedMaterials ?? [])
  );
  const conversationId = selectedConversation?.id ?? pendingConversationId;
  const conversationKey = conversationId ?? 'new';
  const transcriptRef = useRef<HTMLDivElement>(null);
  // Track the last fetcher result we merged so switching conversations (which
  // re-runs this effect with the same stale data) can't re-append a reply.
  const processedData = useRef<LessonPlannerActionData | null>(null);

  // A streamed turn is in flight exactly while there is a bar to draw.
  const isSending = fetcher.state !== 'idle' || progress !== null;
  // Whichever path answered. Only one runs per turn.
  const result = streamed ?? (fetcher.state === 'idle' ? fetcher.data : null);

  // Reset the local transcript when switching between saved conversations.
  useEffect(() => {
    setPendingConversationId(null);
    const persisted = selectedConversation?.messages ?? [];
    // Keep an in-flight question visible if it belongs to this conversation
    // (e.g. the loader refresh after the first turn created the conversation).
    setMessages(
      pendingSubmission &&
        pendingSubmission.conversationKey ===
          (selectedConversation?.id ?? 'new')
        ? [...persisted, { role: 'user', content: pendingSubmission.message }]
        : persisted
    );
    setAddedMaterials(new Set(selectedConversation?.addedMaterials ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConversation?.id]);

  // Merge the assistant reply back in once the action resolves.
  useEffect(() => {
    if (!result) return;
    if (processedData.current === result) return;
    processedData.current = result;
    const submission = pendingSubmission;
    const submittedHere = submission?.conversationKey === conversationKey;
    setPendingSubmission(null);

    if (result.error) {
      if (submittedHere) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: result!.error! },
        ]);
      }
      return;
    }
    if (result.reply) {
      // A "build this day" turn is written into that day's own conversation.
      // Move the teacher into it rather than appending a reply that belongs to
      // a different lesson — the map thread stays the map.
      const landedElsewhere =
        result.unitDay != null &&
        result.conversationId &&
        result.conversationId !== conversationId;
      if (landedElsewhere) {
        const next = new URLSearchParams(searchParams);
        next.set('c', result.conversationId!);
        setPendingConversationId(null);
        setSearchParams(next);
        return;
      }
      // If the teacher switched conversations while this turn was in flight,
      // don't append the reply here — the turn is persisted and will be there
      // when they reopen that lesson.
      if (!submittedHere) return;
      setMessages((prev) => [
        ...prev,
        {
          id: result!.messageId,
          role: 'assistant',
          content: result!.reply!,
        },
      ]);
      if (result.conversationId && !conversationId) {
        setPendingConversationId(result.conversationId);
        const next = new URLSearchParams(searchParams);
        next.set('c', result.conversationId);
        // The seed has been consumed by the first turn; drop it from the URL so
        // a refresh doesn't re-prefill the composer.
        next.delete('from');
        next.delete('step');
        // Replace so the browser back button doesn't bounce between states.
        setSearchParams(next, { replace: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  useEffect(() => {
    // Only a transcript follows its own bottom. The opening page is a page:
    // scrolling it down puts its own heading and box above the fold.
    if (messages.length === 0) return;
    transcriptRef.current?.scrollTo({
      top: transcriptRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages.length, isSending]);

  function startNewLesson() {
    // Clear immediately: the loader refresh only resets the transcript when the
    // selected conversation actually changes.
    setPendingConversationId(null);
    setMessages([]);
    setInput('');
    const next = new URLSearchParams(searchParams);
    next.delete('c');
    next.delete('from');
    next.delete('step');
    setSearchParams(next);
  }

  // Packet edits get their own fetcher so keeping a section never blocks — or
  // is blocked by — a chat turn in flight.
  const packetFetcher = useFetcher();
  // What the in-flight add-material submission was for, so a conflict
  // response can be resolved and, if the teacher confirms, resubmitted with
  // the same identifiers plus the override.
  const pendingMaterialRef = useRef<{
    messageId: string;
    materialKey: string;
  } | null>(null);

  function setKept(messageId: string, audience: PacketAudience | null) {
    if (!conversationId) return;
    setMessages((prev) =>
      prev.map((message) =>
        message.id === messageId
          ? { ...message, keptAudience: audience }
          : message
      )
    );
    packetFetcher.submit(
      {
        intent: audience ? 'keep' : 'drop',
        conversationId,
        messageId,
        ...(audience ? { audience } : {}),
      },
      { method: 'post', action: '/api/domain/lesson-planner/packet' }
    );
  }

  // Filing a revision replaces the version it supersedes, so the card for the
  // older one has to stop claiming to be in the packet. And a slot the
  // teacher hand-edited refuses the same filing instead — ask before a
  // click in the chat erases an edit made in the stack.
  useEffect(() => {
    const data = packetFetcher.data as
      | { replaced?: string; conflict?: boolean }
      | undefined;
    if (!data) return;

    if (data.conflict) {
      const pending = pendingMaterialRef.current;
      pendingMaterialRef.current = null;
      if (!pending || !conversationId) return;
      const token = `${pending.messageId}:${pending.materialKey}`;
      // The optimistic add never actually happened — take the pill back off
      // while the teacher decides.
      setAddedMaterials((prev) => {
        if (!prev.has(token)) return prev;
        const next = new Set(prev);
        next.delete(token);
        return next;
      });
      const replace = window.confirm(
        'This has been edited by hand in the stack. Filing this version will replace those edits. Replace them?'
      );
      if (!replace) return;
      setAddedMaterials((prev) => new Set(prev).add(token));
      packetFetcher.submit(
        {
          intent: 'add-material',
          conversationId,
          messageId: pending.messageId,
          materialKey: pending.materialKey,
          confirmReplace: '1',
        },
        { method: 'post', action: '/api/domain/lesson-planner/packet' }
      );
      return;
    }

    const replaced = data.replaced;
    if (!replaced) return;
    setAddedMaterials((prev) => {
      if (!prev.has(replaced)) return prev;
      const next = new Set(prev);
      next.delete(replaced);
      return next;
    });
  }, [packetFetcher.data, conversationId]);

  // A material goes into the packet on its own — the teacher wanted the
  // handout, not the whole lesson plan wrapped around it.
  function setMaterialAdded(
    messageId: string,
    materialKey: string,
    added: boolean
  ) {
    if (!conversationId) return;
    const token = `${messageId}:${materialKey}`;
    setAddedMaterials((prev) => {
      const next = new Set(prev);
      if (added) next.add(token);
      else next.delete(token);
      return next;
    });
    if (added) pendingMaterialRef.current = { messageId, materialKey };
    packetFetcher.submit(
      {
        intent: added ? 'add-material' : 'remove-material',
        conversationId,
        messageId,
        materialKey,
      },
      { method: 'post', action: '/api/domain/lesson-planner/packet' }
    );
  }

  // Everything in the packet, however it got there. Counting only kept replies
  // left a teacher who filed a handout with no way to reach their own packet.
  const keptCount =
    messages.filter((message) => message.keptAudience).length +
    addedMaterials.size;

  function send(
    message: string,
    /**
     * Set by "Build this day". The lesson is written into that day's own
     * conversation, so the reply comes back from somewhere other than here.
     */
    unitDay?: { day: number; title: string }
  ) {
    const trimmed = message.trim();
    if (!trimmed || isSending) return;
    setMessages((prev) => [...prev, { role: 'user', content: trimmed }]);
    setPendingSubmission({ message: trimmed, conversationKey });
    setInput('');
    setStreamed(null);
    void sendStreaming(trimmed, unitDay);
  }

  /**
   * Send the turn and read the answer as it arrives.
   *
   * A raw fetch rather than the fetcher, because a fetcher resolves once and
   * cannot surface the milestones that arrive in between — which is the whole
   * point. The cost is that react-router no longer revalidates the loader for
   * us, so the turn does it itself once the lesson has landed.
   */
  async function sendStreaming(
    message: string,
    unitDay?: { day: number; title: string }
  ) {
    const body = new URLSearchParams({
      intent: 'chat',
      message,
      stream: '1',
      ...(conversationId ? { conversationId } : {}),
      ...(!conversationId && seed
        ? { originClassAssignmentId: seed.classAssignmentId }
        : {}),
      ...(unitDay
        ? { unitDay: String(unitDay.day), unitDayTitle: unitDay.title }
        : {}),
    });

    setProgress(PLANNING_PROGRESS_START);
    let landed: LessonPlannerActionData | null = null;
    try {
      const response = await fetch('/api/domain/lesson-planner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      if (!response.body) throw new Error('no stream');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffered = '';
      // Events are newline-delimited, and a chunk boundary can land anywhere —
      // including mid-line — so only whole lines are parsed.
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffered += decoder.decode(value, { stream: true });
        const lines = buffered.split('\n');
        buffered = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          let event: any;
          try {
            event = JSON.parse(line);
          } catch {
            continue;
          }
          if (event.type === 'progress') {
            setProgress({ label: event.label, fraction: event.fraction });
          } else if (event.type === 'done') {
            landed = event.payload as LessonPlannerActionData;
          }
        }
      }
    } catch {
      // A dropped connection, a proxy timeout, a closed laptop. The teacher
      // gets a sentence rather than a bar that never finishes.
      landed = { error: PLANNER_UNREACHABLE };
    } finally {
      setProgress(null);
    }

    setStreamed(landed ?? { error: PLANNER_UNREACHABLE });
    // The loader owns the lesson list and which unit days are built, and the
    // fetcher would have refreshed both for us.
    if (landed?.reply) revalidator.revalidate();
  }

  const hasMessages = messages.length > 0;
  // Whether the room's temperament is on the table at all is the teacher's
  // call, not the planner's. Until they raise it, it stays out of the options.
  const teacherRaisedRoomPersonality = mentionsRoomPersonality(
    messages
      .filter((message) => message.role === 'user')
      .map((message) => message.content)
  );
  const firstAssistantIndex = messages.findIndex(
    (message) => message.role === 'assistant'
  );
  // "Look at my classes" picks a topic. When the teacher opened by asking to
  // check a lesson they already taught, the topic is theirs, not the data's.
  const offerDataRoute = !openingAsksAboutATaughtLesson(
    messages.find((message) => message.role === 'user')?.content ?? ''
  );

  return (
    <section className="flex h-full w-full">
      <LessonRail
        lessons={conversations}
        activeId={conversationId ?? null}
        onNewLesson={startNewLesson}
        onSelect={(id) => {
          const next = new URLSearchParams(searchParams);
          next.set('c', id);
          next.delete('from');
          next.delete('step');
          setSearchParams(next);
        }}
      />

      {/* Chat */}
      <div className="flex h-full min-w-0 flex-1 flex-col">
        <div className="border-b bg-secondary px-4 py-3">
          <div className="mx-auto flex w-full max-w-3xl items-center gap-2">
            <Lightbulb size={20} className="shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold leading-none">
                YAWP! Lesson Planner
              </h2>
              {/* A day opened out of a unit is one lesson inside a larger arc,
                  and the way back to the map has to be visible from inside it —
                  otherwise a teacher lands in day 3 with no way home. */}
              {selectedConversation?.unitDay != null && unitMapConversation ? (
                <p
                  className="truncate text-sm text-muted-foreground"
                  data-testid="unit-day-breadcrumb"
                >
                  Day {selectedConversation.unitDay} ·{' '}
                  <button
                    type="button"
                    data-testid="back-to-unit-map"
                    onClick={() => {
                      const next = new URLSearchParams(searchParams);
                      next.set('c', unitMapConversation);
                      setSearchParams(next);
                    }}
                    className="underline hover:text-primary"
                  >
                    Back to the unit map
                  </button>
                </p>
              ) : (
                <p className="hidden text-sm text-muted-foreground sm:block">
                  Talk through a lesson for your actual students.
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2 md:hidden">
              {/* "Switch lesson", not "Your lessons": the rail's link to the
                  full list is called "All your lessons", and one accessible
                  name containing another makes both ambiguous to anything
                  selecting by name — a screen reader included. It is also the
                  truer name, since this picker switches between lessons. */}
              <label
                className="sr-only"
                htmlFor="lesson-planner-mobile-history"
              >
                Switch lesson
              </label>
              <select
                id="lesson-planner-mobile-history"
                aria-label="Switch lesson"
                value={selectedConversation?.id ?? ''}
                onChange={(event) => {
                  if (!event.target.value) return;
                  const next = new URLSearchParams(searchParams);
                  next.set('c', event.target.value);
                  next.delete('from');
                  next.delete('step');
                  setSearchParams(next);
                }}
                className="h-9 max-w-32 rounded-md border bg-background px-2 text-sm"
              >
                <option value="">Switch lesson</option>
                {conversations.map((conversation) => (
                  <option key={conversation.id} value={conversation.id}>
                    {conversation.title}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                size="icon"
                variant="outline"
                aria-label="New lesson"
                onClick={startNewLesson}
              >
                <Plus size={16} />
              </Button>
            </div>
          </div>
        </div>

        <div
          ref={transcriptRef}
          className="no-scrollbar flex-1 overflow-y-auto px-4 py-6"
        >
          <div
            className={cn(
              'mx-auto flex w-full flex-col gap-4',
              // Nothing said yet: the box is the page, so it sits up in the
              // middle of the room rather than pinned to the floor under an
              // empty transcript. Not vertically centred — the tiles run
              // taller than a laptop viewport, and centring a column that
              // overflows puts its own heading above the scroll.
              hasMessages ? 'max-w-3xl' : 'max-w-4xl py-6 sm:py-10'
            )}
          >
            {!hasMessages ? (
              <LessonPlannerEmptyState
                prompts={recommendedPrompts}
                seedContext={seed?.context ?? null}
                onPick={send}
                disabled={isSending}
                input={input}
                onInput={setInput}
                onSend={() => send(input)}
              />
            ) : (
              messages.map((message, index) => (
                <MessageBubble
                  key={message.id ?? index}
                  message={message}
                  isLast={index === messages.length - 1}
                  isOpeningReply={index === firstAssistantIndex}
                  offerDataRoute={offerDataRoute}
                  teacherRaisedRoomPersonality={teacherRaisedRoomPersonality}
                  addedMaterials={addedMaterials}
                  onMaterial={setMaterialAdded}
                  lessonHas={selectedConversation?.lessonHas ?? {}}
                  dailyPagesTypeId={dailyPagesTypeId}
                  classStarterTypeId={classStarterTypeId}
                  exitTicketTypeId={exitTicketTypeId}
                  conversationId={conversationId}
                  builtDays={builtDays}
                  onSuggestion={send}
                  onKeep={setKept}
                  disabled={isSending}
                />
              ))
            )}
            {isSending &&
            pendingSubmission?.conversationKey === conversationKey ? (
              progress ? (
                <PlanningProgressBar progress={progress} />
              ) : (
                <div
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                  role="status"
                  aria-live="polite"
                >
                  <Loader2 size={16} className="animate-spin" />
                  Planning the lesson…
                </div>
              )
            ) : null}
          </div>
        </div>

        {keptCount > 0 && conversationId ? (
          <div
            className="border-t bg-primary/5 px-4 py-2"
            data-testid="lesson-packet-bar"
          >
            <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-x-3 gap-y-1">
              <FileText size={16} className="shrink-0 text-primary" />
              <p className="text-sm">
                <strong>
                  {keptCount} {keptCount === 1 ? 'piece' : 'pieces'}
                </strong>{' '}
                in this lesson's stack
              </p>
              <Link
                to={`/app/lesson-planner/${conversationId}/packet`}
                className="ml-auto text-sm font-medium text-primary hover:underline"
              >
                Open the stack
              </Link>
            </div>
          </div>
        ) : null}

        {/* Once there is a transcript the box belongs under it. Before that it
            is rendered inside the empty state, in the middle of the page. */}
        {hasMessages ? (
          <div className="border-t bg-background px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
            <div className="mx-auto w-full max-w-3xl pr-12">
              <LessonComposer
                value={input}
                onChange={setInput}
                onSend={() => send(input)}
                disabled={isSending}
              />
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/**
 * The one box a teacher types into. It renders in two places — in the middle
 * of an empty page and docked under a transcript — and is the same control in
 * both, so the thing you started typing into is the thing you keep using.
 */
function LessonComposer({
  value,
  onChange,
  onSend,
  disabled,
  hero,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled: boolean;
  /** Centred on an empty page: taller, and the examples cycle inside it. */
  hero?: boolean;
}) {
  const rotating = useRotatingPlaceholder(value.length > 0);

  return (
    <form
      className={cn(
        'flex w-full items-end gap-2',
        hero &&
          'rounded-2xl border bg-background p-2 shadow-[0_12px_40px_-24px_rgba(0,0,0,0.45)] focus-within:border-primary/40'
      )}
      onSubmit={(event) => {
        event.preventDefault();
        onSend();
      }}
    >
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            onSend();
          }
        }}
        rows={hero ? 2 : 1}
        placeholder={hero ? rotating : 'Describe the lesson and your class…'}
        aria-label="Message the Lesson Planner"
        className={cn(
          'flex-1 resize-none max-sm:text-base',
          hero
            ? 'max-h-56 min-h-[76px] border-0 bg-transparent text-base shadow-none focus-visible:ring-0'
            : 'max-h-40 min-h-[44px]'
        )}
        disabled={disabled}
      />
      <Button
        type="submit"
        size="icon"
        disabled={disabled || value.trim().length === 0}
        aria-label="Send message"
        className={cn(hero && 'mb-1 mr-1 h-10 w-10 rounded-xl')}
      >
        <Send size={hero ? 20 : 18} />
      </Button>
    </form>
  );
}

function LessonPlannerEmptyState({
  prompts,
  seedContext,
  onPick,
  disabled,
  input,
  onInput,
  onSend,
}: {
  prompts: Array<{ id: string; label: string; prompt: string }>;
  seedContext: string | null;
  onPick: (prompt: string) => void;
  disabled: boolean;
  input: string;
  onInput: (value: string) => void;
  onSend: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-8">
      <div className="flex w-full max-w-3xl flex-col items-center gap-5 text-center">
        <h3 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          What are we teaching?
        </h3>
        <p className="max-w-lg text-sm text-muted-foreground">
          Say it the way you'd say it to a colleague in the hallway. The planner
          builds the lesson — slides, activities, handouts, exit tickets —
          around the room you actually teach.
        </p>
        <LessonComposer
          hero
          value={input}
          onChange={onInput}
          onSend={onSend}
          disabled={disabled}
        />
      </div>
      {seedContext ? (
        <div
          className="w-full max-w-2xl rounded-xl border border-primary/30 bg-primary/5 p-4 text-left"
          data-testid="lesson-planner-seed"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            From your class summary
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{seedContext}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            We started the message for you above — add anything about this class
            before you send it.
          </p>
        </div>
      ) : null}
      <div className="flex w-full flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Or start from one of these
        </p>
        <PromptTiles prompts={prompts} onPick={onPick} disabled={disabled} />
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  isLast,
  isOpeningReply,
  offerDataRoute,
  teacherRaisedRoomPersonality,
  addedMaterials,
  onMaterial,
  lessonHas,
  dailyPagesTypeId,
  classStarterTypeId,
  exitTicketTypeId,
  conversationId,
  builtDays,
  onSuggestion,
  onKeep,
  disabled,
}: {
  message: ChatMessage;
  isLast: boolean;
  /** The planner's first reply in this lesson. */
  isOpeningReply: boolean;
  /** Whether "look at my classes" answers this lesson's opening question. */
  offerDataRoute: boolean;
  teacherRaisedRoomPersonality: boolean;
  /** "<messageId>:<blockKey>" for every material already in the packet. */
  addedMaterials: Set<string>;
  onMaterial: (messageId: string, materialKey: string, added: boolean) => void;
  /** What the lesson's packet already holds, so it is not offered again. */
  lessonHas: { deck?: boolean; handout?: boolean };
  /** Where a written warm-up becomes a real assignment; null without the type. */
  dailyPagesTypeId: string | null;
  /** The same for a class starter, which most orgs do not have as a type. */
  classStarterTypeId: string | null;
  /** Where the lesson's check becomes a real assignment; null without the type. */
  exitTicketTypeId: string | null;
  conversationId: string | null;
  /** Day number → the conversation each already-built day lives in. */
  builtDays: Record<number, string>;
  onSuggestion: (
    text: string,
    unitDay?: { day: number; title: string }
  ) => void;
  onKeep: (messageId: string, audience: PacketAudience | null) => void;
  disabled: boolean;
}) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end" data-role="user">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground shadow-sm">
          {message.content}
        </div>
      </div>
    );
  }

  const { body: withDeck, suggestions: modelSuggestions } =
    parseAssistantMessage(message.content);
  // A deck is rendered as a deck. A deck that failed to build still gets its
  // JSON stripped — a teacher should never be shown the machinery.
  const deckOutcome = readSlideDeck(withDeck);
  const withoutDeck = deckOutcome.kind === 'none' ? withDeck : deckOutcome.body;
  // A unit map is a board with a way into every day, not a table of prose.
  // Like a deck, a map that failed the schema still gets its JSON stripped.
  const unitOutcome = readUnitPlan(withoutDeck);
  const withMaterials =
    unitOutcome.kind === 'none' ? withoutDeck : unitOutcome.body;
  // A period length and a set of activities are a slider and a checklist, not a
  // sentence the teacher has to type between classes.
  const { asks: requestedAsks, body: withParts } =
    readLessonAsks(withMaterials);
  // Everything the reply hands over, kept in the order it was written: a
  // warm-up prompt belongs at the warm-up, not in a pile below the plan.
  const parts = splitReplyParts(withParts);
  const { materials } = partsSummary(parts);
  // What the prose says, for the reply-level judgements below.
  const body = parts
    .filter((part) => part.kind === 'markdown')
    .map((part) => (part.kind === 'markdown' ? part.text : ''))
    .join('\n\n');
  // Only offer print/PDF on substantial replies (a lesson), not one-liners.
  const isArtifact = /(^|\n)#{1,3}\s/.test(body) || /\n\|.*\|/.test(body);
  // The opening turn always offers the data-driven route, and a delivered plan
  // always offers the two artifacts that come next — in the app's own words,
  // rather than whatever the model happened to think of this run.
  const deliveredPlan = looksLikeLessonPlan(body);
  // The slider belongs in the intake batch and nowhere else: not on the
  // opening reply, where the subject is still open, and not under a finished
  // plan, where every step has already been timed.
  const asks = asksWorthShowing(requestedAsks, {
    topicSettled: !isOpeningReply,
    planAlreadyWritten: deliveredPlan,
  });
  const suggestions = withStandardSuggestions(modelSuggestions, {
    isOpeningReply,
    teacherRaisedRoomPersonality,
    deliveredPlan,
    produced: {
      deck: deckOutcome.kind !== 'none',
      handout: partsSummary(parts).hasHandout,
    },
    inPacket: lessonHas,
    asksForMinutes: asks.some((ask) => ask.kind === 'minutes'),
    offerDataRoute,
  });

  return (
    <div className="flex gap-3" data-role="assistant">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/15">
        <Lightbulb size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="rounded-2xl rounded-tl-sm border border-border/60 bg-card px-4 py-3 text-foreground shadow-sm">
          {/* The reply in its own order: a step, then the thing that step
              hands over, then the next step. Everything used to be lifted out
              and stacked below the plan, so the button to assign a warm-up sat
              inches away from the warm-up. */}
          {parts.map((part, index) => {
            const key = `${message.id ?? 'pending'}:${index}`;
            if (part.kind === 'markdown') {
              return (
                <div key={key} className={index > 0 ? 'mt-3' : undefined}>
                  <MarkdownContent
                    content={linkMaterialTitles(part.text, materials)}
                  />
                </div>
              );
            }
            if (part.kind === 'daily-pages') {
              return (
                <DailyPagesCard
                  key={key}
                  exercise={part.exercise}
                  assignmentTypeId={dailyPagesTypeId}
                  classStarterTypeId={classStarterTypeId}
                  conversationId={conversationId}
                />
              );
            }
            if (part.kind === 'exit-ticket') {
              return (
                <ExitTicketCard
                  key={key}
                  ticket={part.ticket}
                  assignmentTypeId={exitTicketTypeId}
                  conversationId={conversationId}
                />
              );
            }
            if (part.kind === 'resource') {
              return <LessonResourceCard key={key} resource={part.resource} />;
            }
            return (
              <div key={key} className="mt-3">
                <MaterialCard
                  material={part.material}
                  added={
                    !!message.id &&
                    addedMaterials.has(`${message.id}:${part.material.key}`)
                  }
                  onToggle={
                    message.id
                      ? (added) =>
                          onMaterial(message.id!, part.material.key, added)
                      : null
                  }
                  disabled={disabled}
                />
              </div>
            );
          })}
          {unitOutcome.kind === 'unit' ? (
            <div className="mt-3">
              <UnitPlanCard
                unit={unitOutcome.unit}
                onBuildDay={onSuggestion}
                builtDays={builtDays}
                disabled={disabled}
              />
            </div>
          ) : null}
          {unitOutcome.kind === 'unreadable' ? (
            <p
              className={cn('text-sm text-muted-foreground', body && 'mt-3')}
              data-testid="unit-unreadable"
            >
              This unit map didn’t build. Ask for it again — say “write the unit
              map again, one short line per day” and it usually comes through.
            </p>
          ) : null}
          {deckOutcome.kind === 'deck' ? (
            <div className="mt-3">
              <SlideDeckCard
                deck={deckOutcome.deck}
                added={
                  !!message.id &&
                  addedMaterials.has(`${message.id}:${DECK_SLOT}`)
                }
                onToggle={
                  message.id
                    ? (added) => onMaterial(message.id!, DECK_SLOT, added)
                    : null
                }
                disabled={disabled}
                presentHref={
                  message.id && conversationId
                    ? `/present/${conversationId}/${message.id}`
                    : null
                }
                downloadHref={
                  message.id && conversationId
                    ? `/present/${conversationId}/${message.id}.pptx`
                    : null
                }
              />
            </div>
          ) : null}
          {deckOutcome.kind === 'unreadable' ? (
            <p
              className={cn('text-sm text-muted-foreground', body && 'mt-3')}
              data-testid="deck-unreadable"
            >
              This deck didn’t build. Ask for it again — say “rebuild the slide
              deck, shorter” and it usually comes through.
            </p>
          ) : null}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {message.id ? (
            message.keptAudience ? (
              <>
                <span className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                  <BookmarkCheck size={13} />
                  {message.keptAudience === 'student'
                    ? 'In the stack · handout'
                    : 'In the stack'}
                </span>
                <button
                  type="button"
                  onClick={() => onKeep(message.id!, null)}
                  className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
                >
                  Remove from stack
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onKeep(message.id!, 'teacher')}
                  className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
                >
                  <BookmarkPlus size={13} />
                  Add all of this
                </button>
                <button
                  type="button"
                  onClick={() => onKeep(message.id!, 'student')}
                  className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
                >
                  Add all as a handout
                </button>
              </>
            )
          ) : null}
          {isArtifact ? (
            <button
              type="button"
              onClick={() =>
                printAssistantMessage(body, 'YAWP! Lesson Planner')
              }
              className="ml-auto inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
            >
              <Printer size={13} />
              Print this reply
            </button>
          ) : null}
        </div>
        {asks.length > 0 && isLast ? (
          <LessonAskCard
            asks={asks}
            suggestions={suggestions}
            onSend={onSuggestion}
            disabled={disabled}
          />
        ) : null}
        {/* The chips move inside the card when there is one, so a turn never
            has two send buttons racing to consume it. */}
        {suggestions.length > 0 && isLast && asks.length === 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                disabled={disabled}
                onClick={() => onSuggestion(suggestion)}
                className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5 text-sm font-medium text-primary transition hover:border-primary hover:bg-primary/10 disabled:opacity-50"
              >
                <CornerDownRight size={13} className="opacity-60" />
                {suggestion}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
