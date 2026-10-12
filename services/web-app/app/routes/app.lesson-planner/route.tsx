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
  CirclePlay,
  Lightbulb,
  Loader2,
  ChevronDown,
  Plus,
  Printer,
  Send,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  readStackPanelClosed,
  StackPanel,
  writeStackPanelClosed,
} from '~/components/lesson-planner/stack-panel';
import type { StackItem } from '~/domain/lesson-planner/stack-items';
import { Button } from '~/components/ui/button';
import { Textarea } from '~/components/ui/textarea';
import { cn } from '~/utils/misc';
import { prisma } from '~/utils/db.server';
import { getLessonPlannerAccess } from '~/utils/lesson-planner/lesson-planner-access.server';
import { getLessonPlannerReviewFlags } from '~/domain/feature-flags/feature-flags.server';
import { formatClassCardTitle } from '~/utils/class-display';
import { RECOMMENDED_LESSON_PLANNER_PROMPTS } from '~/routes/api.domain.lesson-planner/build-system-prompt';
import { parseAssistantMessage } from '~/components/ai-chat/parse-assistant-message';
import {
  LessonIntakeCard,
  type IntakeClass,
} from '~/components/ai-chat/lesson-intake-card';
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
import { PracticeCard } from '~/components/ai-chat/practice-card';
import {
  loadPracticeContext,
  type PracticeContext,
} from '~/domain/lesson-planner/practice-context.server';
import { UnitPlanCard } from '~/components/ai-chat/unit-plan-card';
import { readUnitPlan } from '~/domain/lesson-planner/unit-plan';
import { findWritingExerciseTypeIds } from '~/domain/lesson-planner/yawp-catalog.server';
import { hidePromptIds } from '~/domain/lesson-planner/prompt-ids';
import { overTime, planMinutes } from '~/domain/lesson-planner/plan-timing';
import { readPlanSteps } from '~/domain/lesson-planner/plan-steps';
import { pieceKeysInReply } from '~/domain/lesson-planner/reply-pieces';
import {
  asksToSwapStarter,
  BUILD_FROM_STACK_REQUESTS,
  isBuildFromStackRequest,
  isFileActionSuggestion,
  looksLikeLessonPlan,
  mentionsRoomPersonality,
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
            periodMinutes: true,
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
              select: {
                id: true,
                sourceMessageId: true,
                blockKey: true,
                kind: true,
                slot: true,
                editedAt: true,
                content: true,
              },
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
  // Writing Fundamentals practice the planner hands over becomes an assignment
  // from inside the lesson; the classes are only loaded where that is possible.
  const practice = await loadPracticeContext({
    request,
    membershipId: access.membership.id,
    writingPracticeEnabled: true,
  });

  // Brian's review: each change ships behind its own flag (see
  // docs/plans/2026-10-11-lesson-planner-brian-review.md).
  const reviewFlags = await getLessonPlannerReviewFlags(
    access.membership.organization.id
  );

  // Intake v2 (A1): the classes come from the teacher's real class list, not
  // from whatever the model guessed. Same scope as list_classes.
  const teacherClasses = reviewFlags.intakeV2
    ? (
        await prisma.class.findMany({
          where: {
            isArchived: false,
            teachers: { some: { id: access.membership.id } },
            school: { organizationId: access.membership.organization.id },
          },
          select: {
            id: true,
            title: true,
            grade: true,
            period: true,
            periodMinutes: true,
          },
          orderBy: [{ schoolYear: 'desc' }, { period: 'asc' }],
          take: 100,
        })
      ).map((klass) => ({
        id: klass.id,
        title: formatClassCardTitle(klass),
        periodMinutes: klass.periodMinutes,
      }))
    : [];

  return {
    reviewFlags,
    teacherClasses,
    practice,
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
          // How long the lesson is, once the teacher said (Brian's run 2, B1).
          periodMinutes: selected.periodMinutes,
          messages: selected.messages as ChatMessage[],
          // "<messageId>:<blockKey>" for every material already in the packet,
          // so each card knows whether it has been added.
          addedMaterials: selected.materials.map(
            (material) => `${material.sourceMessageId}:${material.blockKey}`
          ),
          // A deck the teacher edited by hand (Brian's review, E2), which the
          // chat shows in place of the planner's.
          editedDeck: (() => {
            const deck = selected.materials.find(
              (material) => material.slot === DECK_SLOT && material.editedAt
            );
            return deck
              ? {
                  materialId: deck.id,
                  sourceMessageId: deck.sourceMessageId,
                  content: deck.content,
                }
              : null;
          })(),
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
    practice,
    builtDays,
    unitMapConversation,
    reviewFlags,
    teacherClasses,
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
    intent?: 'add-material' | 'replace-material';
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
        // Plainer words (Brian's run 2): the teacher's edits, and what happens.
        'You edited this in the stack. Replace your edits with this version?'
      );
      if (!replace) return;
      setAddedMaterials((prev) => new Set(prev).add(token));
      packetFetcher.submit(
        {
          intent: pending.intent ?? 'add-material',
          conversationId,
          messageId: pending.messageId,
          materialKey: pending.materialKey,
          confirmReplace: '1',
        },
        { method: 'post', action: '/api/domain/lesson-planner/packet' }
      );
      return;
    }

    // Whatever this filing took the place of stops claiming to be filed: one
    // revision (`replaced`), or every class starter a swap replaced.
    const gone = [
      ...(data.replaced ? [data.replaced] : []),
      ...((data as { replacedTokens?: string[] }).replacedTokens ?? []),
    ];
    if (!gone.length) return;
    setAddedMaterials((prev) => {
      if (!gone.some((token) => prev.has(token))) return prev;
      const next = new Set(prev);
      for (const token of gone) next.delete(token);
      return next;
    });
  }, [packetFetcher.data, conversationId]);

  // Brian's run 2 (A7): the stack beside the chat reloads whenever something
  // was filed or taken out from the chat.
  const [stackVersion, setStackVersion] = useState(0);
  useEffect(() => {
    if (packetFetcher.state === 'idle' && packetFetcher.data) {
      setStackVersion((version) => version + 1);
    }
  }, [packetFetcher.state, packetFetcher.data]);

  // "Add everything to the stack" (Brian's run 2, A4): one piece per step and
  // block, so each can be refined in the stack. Shown as in at once; the
  // answer says which, if any, were left alone because they were hand-edited.
  const keepAllFetcher = useFetcher<{ added?: string[]; skipped?: string[] }>();
  const pendingKeepAll = useRef<string[]>([]);
  function keepAll(messageId: string, keys: string[]) {
    if (!conversationId) return;
    const tokens = keys.map((key) => `${messageId}:${key}`);
    pendingKeepAll.current = tokens;
    setAddedMaterials((prev) => {
      const next = new Set(prev);
      for (const token of tokens) next.add(token);
      return next;
    });
    keepAllFetcher.submit(
      { intent: 'keep-all', conversationId, messageId },
      { method: 'post', action: '/api/domain/lesson-planner/packet' }
    );
  }
  useEffect(() => {
    const data = keepAllFetcher.data;
    if (!data?.added) return;
    const filed = new Set(data.added);
    const notFiled = pendingKeepAll.current.filter((token) => !filed.has(token));
    pendingKeepAll.current = [];
    if (notFiled.length) {
      setAddedMaterials((prev) => {
        const next = new Set(prev);
        for (const token of notFiled) next.delete(token);
        return next;
      });
    }
    if (data.skipped?.length) {
      toast(
        `Left your edited ${data.skipped.length === 1 ? 'piece' : 'pieces'} alone: ${data.skipped.join(', ')}.`
      );
    }
    setStackVersion((version) => version + 1);
  }, [keepAllFetcher.data]);

  // "Replace existing class starter with this one" (Brian's run 2, E1).
  function replaceMaterial(messageId: string, materialKey: string) {
    if (!conversationId) return;
    setAddedMaterials((prev) => new Set(prev).add(`${messageId}:${materialKey}`));
    pendingMaterialRef.current = { messageId, materialKey, intent: 'replace-material' };
    packetFetcher.submit(
      { intent: 'replace-material', conversationId, messageId, materialKey },
      { method: 'post', action: '/api/domain/lesson-planner/packet' }
    );
  }

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

  // The panel opens on its own once there is something in the stack, unless
  // the teacher closed it (remembered on this device).
  const [panelClosed, setPanelClosed] = useState(true);
  useEffect(() => {
    setPanelClosed(readStackPanelClosed());
  }, []);
  function removedFromPanel(piece: StackItem) {
    if (piece.token) {
      setAddedMaterials((prev) => {
        if (!prev.has(piece.token!)) return prev;
        const next = new Set(prev);
        next.delete(piece.token!);
        return next;
      });
    } else if (piece.origin === 'reply') {
      setMessages((prev) =>
        prev.map((message) =>
          message.id === piece.id ? { ...message, keptAudience: null } : message
        )
      );
    }
  }

  // Everything in the packet, however it got there. Counting only kept replies
  // left a teacher who filed a handout with no way to reach their own packet.
  const keptCount =
    messages.filter((message) => message.keptAudience).length +
    addedMaterials.size;

  // Brian's review (B6): "Slide deck from this stack" on the stack screen
  // lands here with ?build=deck and asks once. The parameter is dropped as it
  // is used, so a reload does not ask a second time.
  const buildRequest = searchParams.get('build');
  const buildAsked = useRef(false);
  useEffect(() => {
    if (buildAsked.current || !reviewFlags.stackV2 || !conversationId) return;
    if (!isBuildFromStackRequest(buildRequest)) return;
    buildAsked.current = true;
    const next = new URLSearchParams(searchParams);
    next.delete('build');
    setSearchParams(next, { replace: true });
    send(BUILD_FROM_STACK_REQUESTS[buildRequest]);
    // Runs once per arrival; send is stable enough for a one-shot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildRequest, conversationId, reviewFlags.stackV2]);

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
            {/* The way into the guide stays in the header, where a teacher who
                is new here looks first, and shrinks to its icon on a phone. */}
            <Link
              to="/app/lesson-planner/how-it-works"
              aria-label="See how it works"
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-primary/40 bg-background px-2.5 text-sm font-medium text-primary transition hover:bg-primary/10 sm:px-3"
            >
              <CirclePlay size={16} />
              <span className="hidden sm:inline">See how it works</span>
            </Link>
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
                  teacherRaisedRoomPersonality={teacherRaisedRoomPersonality}
                  addedMaterials={addedMaterials}
                  onMaterial={setMaterialAdded}
                  lessonHas={selectedConversation?.lessonHas ?? {}}
                  dailyPagesTypeId={dailyPagesTypeId}
                  classStarterTypeId={classStarterTypeId}
                  exitTicketTypeId={exitTicketTypeId}
                  practice={practice}
                  conversationId={conversationId}
                  builtDays={builtDays}
                  onSuggestion={send}
                  onKeep={setKept}
                  stackV2={reviewFlags.stackV2}
                  intakeV2={reviewFlags.intakeV2}
                  deckV2={reviewFlags.deckV2}
                  editedDeck={selectedConversation?.editedDeck ?? null}
                  periodMinutes={selectedConversation?.periodMinutes ?? null}
                  previousUserText={
                    messages[index - 1]?.role === 'user'
                      ? messages[index - 1]!.content
                      : null
                  }
                  onReplaceMaterial={replaceMaterial}
                  onKeepAll={keepAll}
                  teacherClasses={teacherClasses}
                  stackHasPieces={keptCount > 0}
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
              {reviewFlags.stackPanel && panelClosed ? (
                <button
                  type="button"
                  onClick={() => {
                    writeStackPanelClosed(false);
                    setPanelClosed(false);
                  }}
                  className="ml-auto hidden text-sm font-medium text-primary hover:underline lg:inline"
                >
                  Show the stack here
                </button>
              ) : null}
              <Link
                to={`/app/lesson-planner/${conversationId}/packet`}
                className={cn(
                  'text-sm font-medium text-primary hover:underline',
                  !(reviewFlags.stackPanel && panelClosed) && 'ml-auto'
                )}
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

      {reviewFlags.stackPanel && conversationId && keptCount > 0 && !panelClosed ? (
        <StackPanel
          conversationId={conversationId}
          version={stackVersion}
          onRemoved={removedFromPanel}
          onClose={() => {
            writeStackPanelClosed(true);
            setPanelClosed(true);
          }}
        />
      ) : null}
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
  teacherRaisedRoomPersonality,
  addedMaterials,
  onMaterial,
  lessonHas,
  dailyPagesTypeId,
  classStarterTypeId,
  exitTicketTypeId,
  practice,
  conversationId,
  builtDays,
  onSuggestion,
  onKeep,
  stackV2 = false,
  stackHasPieces = false,
  intakeV2 = false,
  teacherClasses = [],
  deckV2 = false,
  editedDeck = null,
  periodMinutes = null,
  previousUserText = null,
  onReplaceMaterial = null,
  onKeepAll = null,
  disabled,
}: {
  message: ChatMessage;
  isLast: boolean;
  /** The planner's first reply in this lesson. */
  isOpeningReply: boolean;
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
  /** Writing Fundamentals lessons, and the classes practice can go to. */
  practice: PracticeContext;
  conversationId: string | null;
  /** Day number → the conversation each already-built day lives in. */
  builtDays: Record<number, string>;
  onSuggestion: (
    text: string,
    unitDay?: { day: number; title: string }
  ) => void;
  onKeep: (messageId: string, audience: PacketAudience | null) => void;
  /**
   * Stack v2 (Brian's review, B4 + C6): the whole-reply button only appears
   * under a delivered plan, there is no "Add all as a handout" in the chat,
   * and a plan says plainly that the teacher can take just the pieces.
   */
  stackV2?: boolean;
  /** Something is filed in this lesson's stack. */
  stackHasPieces?: boolean;
  /**
   * Intake v2 (Brian's review, A1–A3): one decision per step, classes from the
   * teacher's real list, no pre-filled length.
   */
  intakeV2?: boolean;
  teacherClasses?: IntakeClass[];
  /** Deck v2 (E2): Edit on the deck card, and an edited deck shown in place. */
  deckV2?: boolean;
  editedDeck?: {
    materialId: string;
    sourceMessageId: string;
    content: string;
  } | null;
  /** The lesson's length, for the over-time flags (Brian's run 2, B2). */
  periodMinutes?: number | null;
  /** What the teacher said just before this reply. */
  previousUserText?: string | null;
  /** "Replace existing class starter with this one" (Brian's run 2, E1). */
  onReplaceMaterial?: ((messageId: string, materialKey: string) => void) | null;
  /** "Add everything to the stack", as separate pieces (Brian's run 2, A4). */
  onKeepAll?: ((messageId: string, keys: string[]) => void) | null;
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
  const deliveredPlan = looksLikeLessonPlan(body, { boldSteps: stackV2 });
  // Brian's run 2 (E1): the reply to "Swap out the class starter prompt"
  // offers each prompt with three choices, one of them "Replace existing".
  const isSwapReply = stackV2 && asksToSwapStarter(previousUserText);
  const offersStarter = parts.some(
    (part) => part.kind === 'daily-pages' && part.exercise.kind === 'class-starter'
  );
  const planOverBy =
    stackV2 && deliveredPlan ? overTime(planMinutes(body), periodMinutes) : null;
  // Brian's run 2 (A3, A4): the plan's steps, each a piece of its own, and
  // everything the reply hands over, for "Add everything to the stack".
  const planSteps =
    stackV2 && deliveredPlan && message.id
      ? readPlanSteps(message.content).filter((step) => step.content.trim())
      : [];
  const replyPieceKeys =
    stackV2 && deliveredPlan ? pieceKeysInReply(message.content) : [];
  const everythingIn =
    Boolean(message.id) &&
    replyPieceKeys.length > 0 &&
    replyPieceKeys.every((key) => addedMaterials.has(`${message.id}:${key}`));
  // The slider belongs in the intake batch and nowhere else: not on the
  // opening reply, where the subject is still open, and not under a finished
  // plan, where every step has already been timed.
  const asks = asksWorthShowing(requestedAsks, {
    topicSettled: !isOpeningReply,
    planAlreadyWritten: deliveredPlan,
  });
  // Library prompt ids never reach a teacher (Brian's run 2, item 21).
  const suggestions = withStandardSuggestions(modelSuggestions.map(hidePromptIds), {
    isOpeningReply,
    teacherRaisedRoomPersonality,
    deliveredPlan,
    produced: {
      deck: deckOutcome.kind !== 'none',
      handout: partsSummary(parts).hasHandout,
    },
    inPacket: lessonHas,
    asksForMinutes: asks.some((ask) => ask.kind === 'minutes'),
    offerDone: stackV2,
    stackHasPieces: stackV2 && stackHasPieces,
    offerStarterSwap: stackV2 && offersStarter && !isSwapReply,
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
                    content={hidePromptIds(
                      linkMaterialTitles(part.text, materials)
                    )}
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
                  added={
                    message.id
                      ? addedMaterials.has(`${message.id}:${part.blockKey}`)
                      : false
                  }
                  onToggle={
                    stackV2 && message.id
                      ? (next) => onMaterial(message.id!, part.blockKey, next)
                      : undefined
                  }
                  onReplace={
                    isSwapReply && message.id && onReplaceMaterial
                      ? () => onReplaceMaterial(message.id!, part.blockKey)
                      : null
                  }
                  disabled={disabled}
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
                  added={
                    !!message.id &&
                    addedMaterials.has(`${message.id}:${part.blockKey}`)
                  }
                  onToggle={
                    message.id
                      ? (added) =>
                          onMaterial(message.id!, part.blockKey, added)
                      : null
                  }
                  disabled={disabled}
                />
              );
            }
            if (part.kind === 'resource') {
              return <LessonResourceCard key={key} resource={part.resource} />;
            }
            if (part.kind === 'practice') {
              return (
                <PracticeCard
                  key={key}
                  practice={part.practice}
                  lessons={practice.lessons}
                  classes={practice.classes}
                  added={
                    message.id
                      ? addedMaterials.has(`${message.id}:${part.blockKey}`)
                      : false
                  }
                  onToggle={
                    stackV2 && message.id
                      ? (next) => onMaterial(message.id!, part.blockKey, next)
                      : null
                  }
                  disabled={disabled}
                />
              );
            }
            return (
              <div key={key} className="mt-3">
                <MaterialCard
                  material={{
                    ...part.material,
                    content: hidePromptIds(part.material.content),
                  }}
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
              {(() => {
                // Deck v2 (Brian's review, E2): a deck the teacher edited
                // replaces the planner's in the chat, rather than sitting
                // beside it. Present and PowerPoint follow the edit.
                const edited =
                  deckV2 && editedDeck && editedDeck.sourceMessageId === message.id
                    ? editedDeck
                    : null;
                const editedParse = edited ? readSlideDeck(edited.content) : null;
                const shown =
                  editedParse?.kind === 'deck' ? editedParse.deck : deckOutcome.deck;
                const deckId = edited ? edited.materialId : message.id;
                return (
                  <SlideDeckCard
                    deck={shown}
                    edited={Boolean(edited)}
                    added={
                      !!message.id &&
                      addedMaterials.has(`${message.id}:${DECK_SLOT}`)
                    }
                    onToggle={
                      message.id
                        ? (added) => {
                            if (
                              !added &&
                              edited &&
                              !window.confirm(
                                'Taking this deck out of the stack also discards your edits to it.'
                              )
                            ) {
                              return;
                            }
                            onMaterial(message.id!, DECK_SLOT, added);
                          }
                        : null
                    }
                    disabled={disabled}
                    presentHref={
                      deckId && conversationId
                        ? `/present/${conversationId}/${deckId}`
                        : null
                    }
                    downloadHref={
                      deckId && conversationId
                        ? `/present/${conversationId}/${deckId}.pptx`
                        : null
                    }
                    editHref={
                      deckV2 && deckId && conversationId
                        ? `/app/lesson-planner/${conversationId}/deck/${deckId}`
                        : null
                    }
                    periodMinutes={deckV2 ? periodMinutes : null}
                    onFit={
                      deckV2 && periodMinutes
                        ? () =>
                            onSuggestion(
                              `Fit the slide deck to ${periodMinutes} minutes, and tell me what you cut.`
                            )
                        : null
                    }
                  />
                );
              })()}
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
        {stackV2 && deliveredPlan && message.id ? (
          <p
            className="mt-2 text-sm text-muted-foreground"
            data-testid="plan-stack-invite"
          >
            You don't have to use all of these. Add the pieces you want to the
            stack, or add the whole lesson.
          </p>
        ) : null}
        {planSteps.length > 0 ? (
          // Brian's run 2 (A3): every step — a reading, a pair talk, a quick
          // write — can go in the stack, not only the writing assignments.
          <div
            data-testid="plan-steps"
            className="mt-2 rounded-xl border border-border/60 bg-card px-3 py-2"
          >
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Steps in this plan
            </p>
            <ul className="flex flex-col">
              {planSteps.map((step) => {
                const isIn = addedMaterials.has(`${message.id}:${step.key}`);
                return (
                  <li
                    key={step.key}
                    data-testid="plan-step"
                    className="flex items-center gap-2 py-1 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate">{step.title}</span>
                    {step.minutes !== null ? (
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {step.minutes} min
                      </span>
                    ) : null}
                    <button
                      type="button"
                      disabled={disabled}
                      data-testid="plan-step-toggle"
                      title={isIn ? 'Click to remove from stack' : undefined}
                      onClick={() => onMaterial(message.id!, step.key, !isIn)}
                      className={cn(
                        'inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium transition disabled:opacity-50',
                        isIn
                          ? 'bg-primary/10 text-primary hover:bg-primary/15'
                          : 'border border-primary/40 text-primary hover:bg-primary/5'
                      )}
                    >
                      {isIn ? <BookmarkCheck size={12} /> : <BookmarkPlus size={12} />}
                      {isIn ? 'In the stack' : 'Add to stack'}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
        {planOverBy !== null && periodMinutes ? (
          // Brian's run 2 (B2): "too much stuff for a 50-minute class".
          <p
            data-testid="plan-over-time"
            className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
          >
            <span>
              This plan runs {periodMinutes + planOverBy} minutes; the period is{' '}
              {periodMinutes}.
            </span>
            <button
              type="button"
              disabled={disabled}
              onClick={() =>
                onSuggestion(
                  `Trim this plan to fit ${periodMinutes} minutes, and tell me what you cut.`
                )
              }
              className="rounded-md border border-amber-300 bg-background px-2 py-0.5 text-xs font-medium text-amber-900 transition hover:bg-amber-100 disabled:opacity-50 dark:text-amber-200"
            >
              Trim it to {periodMinutes} minutes
            </button>
          </p>
        ) : null}
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {message.id && (!stackV2 || deliveredPlan || message.keptAudience) ? (
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
                {stackV2 && everythingIn ? (
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                    <BookmarkCheck size={13} />
                    Everything is in the stack
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      stackV2 && onKeepAll
                        ? onKeepAll(message.id!, replyPieceKeys)
                        : onKeep(message.id!, 'teacher')
                    }
                    className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground disabled:opacity-50"
                  >
                    <BookmarkPlus size={13} />
                    {stackV2 ? 'Add everything to the stack' : 'Add all of this'}
                  </button>
                )}
                {stackV2 ? null : (
                  <button
                    type="button"
                    onClick={() => onKeep(message.id!, 'student')}
                    className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
                  >
                    Add all as a handout
                  </button>
                )}
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
        {asks.length > 0 && isLast && intakeV2 ? (
          // The card's own steps are the choices. The model's free-text chips
          // paired a grade with a scope; they are not shown beside it.
          <LessonIntakeCard
            asks={asks}
            teacherClasses={teacherClasses}
            onSend={onSuggestion}
            disabled={disabled}
          />
        ) : asks.length > 0 && isLast ? (
          <LessonAskCard
            asks={asks}
            suggestions={suggestions}
            onSend={onSuggestion}
            disabled={disabled}
          />
        ) : null}
        {/* The planner offered a file ("Save Lesson Plan as PDF"). Its chip is
            gone — sending those words does nothing — and the stack, where the
            real downloads are, is offered instead (Brian's run 2, S2). */}
        {isLast && conversationId && modelSuggestions.some(isFileActionSuggestion) ? (
          <Link
            to={`/app/lesson-planner/${conversationId}/packet`}
            data-testid="open-stack-for-files"
            className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-background px-3 py-1.5 text-sm font-medium text-primary transition hover:border-primary hover:bg-primary/10"
          >
            <FileText size={13} className="opacity-70" />
            Open the stack to download the lesson plan
          </Link>
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
