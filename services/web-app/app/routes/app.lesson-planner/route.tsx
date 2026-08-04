import { useEffect, useRef, useState } from 'react';
import {
  Link,
  redirect,
  useFetcher,
  useLoaderData,
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
import { loadLessonSeed } from '~/domain/lesson-planner/lesson-seed.server';

type PacketAudience = 'teacher' | 'student';

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
    select: { id: true, title: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
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
            messages: {
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
              select: {
                id: true,
                role: true,
                content: true,
                keptAudience: true,
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

  return {
    conversations: conversations.map((conversation) => ({
      id: conversation.id,
      title: conversation.title,
    })),
    selectedConversation: selected
      ? {
          id: selected.id,
          title: selected.title,
          messages: selected.messages as ChatMessage[],
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
};

export default function LessonPlannerRoute() {
  const { conversations, selectedConversation, recommendedPrompts, seed } =
    useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const fetcher = useFetcher<LessonPlannerActionData>();

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
  const conversationId = selectedConversation?.id ?? pendingConversationId;
  const conversationKey = conversationId ?? 'new';
  const transcriptRef = useRef<HTMLDivElement>(null);
  // Track the last fetcher result we merged so switching conversations (which
  // re-runs this effect with the same stale data) can't re-append a reply.
  const processedData = useRef<LessonPlannerActionData | null>(null);

  const isSending = fetcher.state !== 'idle';

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConversation?.id]);

  // Merge the assistant reply back in once the action resolves.
  useEffect(() => {
    if (fetcher.state !== 'idle' || !fetcher.data) return;
    if (processedData.current === fetcher.data) return;
    processedData.current = fetcher.data;
    const submission = pendingSubmission;
    const submittedHere = submission?.conversationKey === conversationKey;
    setPendingSubmission(null);

    if (fetcher.data.error) {
      if (submittedHere) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: fetcher.data!.error! },
        ]);
      }
      return;
    }
    if (fetcher.data.reply) {
      // If the teacher switched conversations while this turn was in flight,
      // don't append the reply here — the turn is persisted and will be there
      // when they reopen that lesson.
      if (!submittedHere) return;
      setMessages((prev) => [
        ...prev,
        {
          id: fetcher.data!.messageId,
          role: 'assistant',
          content: fetcher.data!.reply!,
        },
      ]);
      if (fetcher.data.conversationId && !conversationId) {
        setPendingConversationId(fetcher.data.conversationId);
        const next = new URLSearchParams(searchParams);
        next.set('c', fetcher.data.conversationId);
        // The seed has been consumed by the first turn; drop it from the URL so
        // a refresh doesn't re-prefill the composer.
        next.delete('from');
        next.delete('step');
        // Replace so the browser back button doesn't bounce between states.
        setSearchParams(next, { replace: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);

  useEffect(() => {
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

  const keptCount = messages.filter((message) => message.keptAudience).length;

  function send(message: string) {
    const trimmed = message.trim();
    if (!trimmed || isSending) return;
    setMessages((prev) => [...prev, { role: 'user', content: trimmed }]);
    setPendingSubmission({ message: trimmed, conversationKey });
    setInput('');
    fetcher.submit(
      {
        intent: 'chat',
        message: trimmed,
        ...(conversationId ? { conversationId } : {}),
        ...(!conversationId && seed
          ? { originClassAssignmentId: seed.classAssignmentId }
          : {}),
      },
      { method: 'post', action: '/api/domain/lesson-planner' }
    );
  }

  const hasMessages = messages.length > 0;

  return (
    <section className="flex h-full w-full">
      {/* Lesson history */}
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-secondary/40 md:flex">
        <div className="p-3">
          <Button
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={startNewLesson}
          >
            <Plus size={16} /> New lesson
          </Button>
        </div>
        <div className="px-3 pb-2">
          <Link
            to="/app/lesson-planner/library"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-primary"
          >
            <FileText size={14} />
            Lesson library
          </Link>
        </div>
        <div className="no-scrollbar flex-1 overflow-y-auto px-2 pb-3">
          {conversations.length === 0 ? (
            <p className="px-2 py-4 text-sm text-muted-foreground">
              Your saved lessons will show up here.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {conversations.map((conversation) => (
                <li key={conversation.id}>
                  <button
                    type="button"
                    onClick={() => {
                      const next = new URLSearchParams(searchParams);
                      next.set('c', conversation.id);
                      next.delete('from');
                      next.delete('step');
                      setSearchParams(next);
                    }}
                    className={cn(
                      'w-full truncate rounded-lg px-3 py-2 text-left text-sm text-muted-foreground hover:bg-foreground/5 hover:text-foreground',
                      {
                        'bg-primary/10 text-primary hover:bg-primary/10':
                          conversation.id === conversationId,
                      }
                    )}
                  >
                    {conversation.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* Chat */}
      <div className="flex h-full min-w-0 flex-1 flex-col">
        <div className="border-b bg-secondary px-4 py-3">
          <div className="mx-auto flex w-full max-w-3xl items-center gap-2">
            <Lightbulb size={20} className="shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold leading-none">
                YAWP! Lesson Planner
              </h2>
              <p className="hidden text-sm text-muted-foreground sm:block">
                Talk through a lesson for your actual students.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2 md:hidden">
              <label
                className="sr-only"
                htmlFor="lesson-planner-mobile-history"
              >
                Saved lessons
              </label>
              <select
                id="lesson-planner-mobile-history"
                aria-label="Saved lessons"
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
                <option value="">Saved lessons</option>
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
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
            {!hasMessages ? (
              <LessonPlannerEmptyState
                prompts={recommendedPrompts}
                seedContext={seed?.context ?? null}
                onPick={send}
                disabled={isSending}
              />
            ) : (
              messages.map((message, index) => (
                <MessageBubble
                  key={message.id ?? index}
                  message={message}
                  isLast={index === messages.length - 1}
                  onSuggestion={send}
                  onKeep={setKept}
                  disabled={isSending}
                />
              ))
            )}
            {isSending &&
            pendingSubmission?.conversationKey === conversationKey ? (
              <div
                className="flex items-center gap-2 text-sm text-muted-foreground"
                role="status"
                aria-live="polite"
              >
                <Loader2 size={16} className="animate-spin" />
                Planning the lesson…
              </div>
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
                  {keptCount} {keptCount === 1 ? 'section' : 'sections'}
                </strong>{' '}
                in this lesson
              </p>
              <Link
                to={`/app/lesson-planner/${conversationId}/packet`}
                className="ml-auto text-sm font-medium text-primary hover:underline"
              >
                Open lesson packet
              </Link>
            </div>
          </div>
        ) : null}

        <div className="border-t bg-background px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
          <form
            className="mx-auto flex w-full max-w-3xl items-end gap-2 pr-12"
            onSubmit={(event) => {
              event.preventDefault();
              send(input);
            }}
          >
            <Textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  send(input);
                }
              }}
              rows={1}
              placeholder="Describe the lesson and your class…"
              aria-label="Message the Lesson Planner"
              className="max-h-40 min-h-[44px] flex-1 resize-none max-sm:text-base"
              disabled={isSending}
            />
            <Button
              type="submit"
              size="icon"
              disabled={isSending || input.trim().length === 0}
              aria-label="Send message"
            >
              <Send size={18} />
            </Button>
          </form>
        </div>
      </div>
    </section>
  );
}

function LessonPlannerEmptyState({
  prompts,
  seedContext,
  onPick,
  disabled,
}: {
  prompts: Array<{ id: string; label: string; prompt: string }>;
  seedContext: string | null;
  onPick: (prompt: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-6 py-10 text-center">
      <div className="flex flex-col items-center gap-2">
        <div className="rounded-2xl bg-primary/10 p-3 text-primary">
          <Lightbulb size={28} />
        </div>
        <h3 className="text-xl font-semibold">What are we teaching?</h3>
        <p className="max-w-md text-sm text-muted-foreground">
          Tell the planner the skill, the class, and what your students are
          like. It builds the lesson — slides, activities, handouts, exit
          tickets — around the room you actually teach.
        </p>
      </div>
      {seedContext ? (
        <div
          className="w-full max-w-xl rounded-xl border border-primary/30 bg-primary/5 p-4 text-left"
          data-testid="lesson-planner-seed"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            From your class summary
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{seedContext}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            We started the message for you below — add anything about this class
            before you send it.
          </p>
        </div>
      ) : null}
      <div className="grid w-full max-w-xl grid-cols-1 gap-2 sm:grid-cols-2">
        {prompts.map((prompt) => (
          <button
            key={prompt.id}
            type="button"
            disabled={disabled}
            onClick={() => onPick(prompt.prompt)}
            className="rounded-xl border bg-background p-3 text-left text-sm hover:border-primary hover:bg-primary/5 disabled:opacity-50"
          >
            <span className="font-medium">{prompt.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  isLast,
  onSuggestion,
  onKeep,
  disabled,
}: {
  message: ChatMessage;
  isLast: boolean;
  onSuggestion: (text: string) => void;
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

  const { body, suggestions } = parseAssistantMessage(message.content);
  // Only offer print/PDF on substantial replies (a lesson), not one-liners.
  const isArtifact = /(^|\n)#{1,3}\s/.test(body) || /\n\|.*\|/.test(body);

  return (
    <div className="flex gap-3" data-role="assistant">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/15">
        <Lightbulb size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="rounded-2xl rounded-tl-sm border border-border/60 bg-card px-4 py-3 text-foreground shadow-sm">
          <MarkdownContent content={body} />
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {message.id ? (
            message.keptAudience ? (
              <>
                <span className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                  <BookmarkCheck size={13} />
                  {message.keptAudience === 'student'
                    ? 'Kept as a handout'
                    : 'Kept in the lesson'}
                </span>
                <button
                  type="button"
                  onClick={() => onKeep(message.id!, null)}
                  className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
                >
                  Remove
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
                  Keep for the lesson
                </button>
                <button
                  type="button"
                  onClick={() => onKeep(message.id!, 'student')}
                  className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
                >
                  Keep as a handout
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
        {suggestions.length > 0 && isLast ? (
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
