import { useEffect, useRef, useState } from 'react';
import {
  redirect,
  useFetcher,
  useLoaderData,
  useSearchParams,
  type LoaderFunctionArgs,
} from 'react-router';
import {
  CornerDownRight,
  Loader2,
  Plus,
  Printer,
  Search,
  Send,
} from 'lucide-react';
import { Button } from '~/components/ui/button';
import { SeeHowItWorksLink } from '~/components/how-it-works/guide';
import { Textarea } from '~/components/ui/textarea';
import { cn } from '~/utils/misc';
import { prisma } from '~/utils/db.server';
import { getReporterAccess } from '~/utils/reporter/reporter-access.server';
import { RECOMMENDED_REPORTER_PROMPTS } from '~/routes/api.domain.reporter/build-system-prompt';
import { parseAssistantMessage } from '~/components/ai-chat/parse-assistant-message';
import {
  MarkdownContent,
  printAssistantMessage,
} from '~/components/ai-chat/assistant-markdown';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

export async function loader({ request }: LoaderFunctionArgs) {
  const access = await getReporterAccess(request);
  if (!access.allowed) {
    // Keep the feature invisible for orgs without it / non-teachers.
    throw redirect('/app');
  }

  const url = new URL(request.url);
  const selectedId = url.searchParams.get('c');

  const conversations = await prisma.reporterConversation.findMany({
    where: { membershipId: access.membership.id, deletedAt: null },
    select: { id: true, title: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
    take: 30,
  });

  const selected =
    selectedId != null
      ? await prisma.reporterConversation.findFirst({
          where: {
            id: selectedId,
            membershipId: access.membership.id,
            deletedAt: null,
          },
          select: {
            id: true,
            title: true,
            // id tiebreak: legacy rows share one createdAt per turn (they were
            // written in a single nested create), and their cuids are
            // sequential — this keeps question-before-answer order for them.
            messages: {
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
              select: { role: true, content: true },
            },
          },
        })
      : null;

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
    recommendedPrompts: RECOMMENDED_REPORTER_PROMPTS,
  };
}

type ReporterActionData = {
  conversationId?: string;
  reply?: string;
  isNewConversation?: boolean;
  error?: string;
  growthPlanProposals?: GrowthPlanProposal[];
  growthPlanSaved?: boolean;
  studentName?: string;
};

type GrowthPlanProposal = {
  student: string;
  studentName: string;
  focus: string;
  targetSkills: string[];
  body: string;
  checkInInDays?: number;
};

export default function ReporterRoute() {
  const { conversations, selectedConversation, recommendedPrompts } =
    useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const fetcher = useFetcher<ReporterActionData>();

  const [messages, setMessages] = useState<ChatMessage[]>(
    selectedConversation?.messages ?? []
  );
  const [input, setInput] = useState('');
  const [growthPlanProposals, setGrowthPlanProposals] = useState<
    GrowthPlanProposal[]
  >([]);
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
  const processedData = useRef<ReporterActionData | null>(null);

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

    if (fetcher.data.growthPlanSaved) {
      setGrowthPlanProposals([]);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `Growth plan saved for ${fetcher.data!.studentName ?? 'the student'}.`,
        },
      ]);
      return;
    }

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
      // when they reopen that report.
      if (!submittedHere) return;
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: fetcher.data!.reply! },
      ]);
      setGrowthPlanProposals(fetcher.data.growthPlanProposals ?? []);
      if (fetcher.data.conversationId && !conversationId) {
        setPendingConversationId(fetcher.data.conversationId);
        const next = new URLSearchParams(searchParams);
        next.set('c', fetcher.data.conversationId);
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
      },
      { method: 'post', action: '/api/domain/reporter' }
    );
  }

  function confirmGrowthPlan(proposal: GrowthPlanProposal) {
    if (isSending) return;
    fetcher.submit(
      {
        intent: 'confirm-growth-plan',
        growthPlanProposal: JSON.stringify(proposal),
        ...(conversationId ? { conversationId } : {}),
      },
      { method: 'post', action: '/api/domain/reporter' }
    );
  }

  const hasMessages = messages.length > 0;

  return (
    <section className="flex h-full w-full">
      {/* Conversation history */}
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-secondary/40 md:flex">
        <div className="p-3">
          <Button
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={() => {
              // Clear immediately: the loader refresh only resets the
              // transcript when the selected conversation actually changes.
              setPendingConversationId(null);
              setMessages([]);
              const next = new URLSearchParams(searchParams);
              next.delete('c');
              setSearchParams(next);
            }}
          >
            <Plus size={16} /> New report
          </Button>
        </div>
        <div className="no-scrollbar flex-1 overflow-y-auto px-2 pb-3">
          {conversations.length === 0 ? (
            <p className="px-2 py-4 text-sm text-muted-foreground">
              Your past reports will show up here.
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
            <Search size={20} className="shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold leading-none">
                Yawp Reporter
              </h2>
              <p className="hidden text-sm text-muted-foreground sm:block">
                Ask about your classes and students in plain language.
              </p>
            </div>
            <SeeHowItWorksLink to="/app/reporter/how-it-works" />
            <div className="flex shrink-0 items-center gap-2 md:hidden">
              <label className="sr-only" htmlFor="reporter-mobile-history">
                Past reports
              </label>
              <select
                id="reporter-mobile-history"
                aria-label="Past reports"
                value={selectedConversation?.id ?? ''}
                onChange={(event) => {
                  if (!event.target.value) return;
                  const next = new URLSearchParams(searchParams);
                  next.set('c', event.target.value);
                  setSearchParams(next);
                }}
                className="h-9 max-w-32 rounded-md border bg-background px-2 text-sm"
              >
                <option value="">Past reports</option>
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
                aria-label="New report"
                onClick={() => {
                  setPendingConversationId(null);
                  setMessages([]);
                  const next = new URLSearchParams(searchParams);
                  next.delete('c');
                  setSearchParams(next);
                }}
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
              <ReporterEmptyState
                prompts={recommendedPrompts}
                onPick={send}
                disabled={isSending}
              />
            ) : (
              messages.map((message, index) => (
                <MessageBubble
                  key={index}
                  message={message}
                  isLast={index === messages.length - 1}
                  onSuggestion={send}
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
                Pulling the numbers…
              </div>
            ) : null}
            {growthPlanProposals.map((proposal) => (
              <div
                key={proposal.student}
                className="rounded-xl border border-primary/30 bg-primary/5 p-4"
                role="status"
              >
                <p className="text-sm font-medium">
                  Save this growth plan for {proposal.studentName}?
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Nothing is persisted until you confirm this exact proposal.
                </p>
                <Button
                  type="button"
                  size="sm"
                  className="mt-3"
                  disabled={isSending}
                  onClick={() => confirmGrowthPlan(proposal)}
                >
                  Save growth plan
                </Button>
              </div>
            ))}
          </div>
        </div>

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
              placeholder="Ask Yawp Reporter…"
              aria-label="Message Yawp Reporter"
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

function ReporterEmptyState({
  prompts,
  onPick,
  disabled,
}: {
  prompts: Array<{ id: string; label: string; prompt: string }>;
  onPick: (prompt: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-6 py-10 text-center">
      <div className="flex flex-col items-center gap-2">
        <div className="rounded-2xl bg-primary/10 p-3 text-primary">
          <Search size={28} />
        </div>
        <h3 className="text-xl font-semibold">What would you like to know?</h3>
        <p className="max-w-md text-sm text-muted-foreground">
          Yawp Reporter reads your classes, assignments, and released grades to
          answer questions and build reports. Try one of these, or just ask.
        </p>
      </div>
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
  disabled,
}: {
  message: ChatMessage;
  isLast: boolean;
  onSuggestion: (text: string) => void;
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
  // Only offer print/PDF on substantial replies (a report), not one-liners.
  const isReport = /(^|\n)#{1,3}\s/.test(body) || /\n\|.*\|/.test(body);

  return (
    <div className="flex gap-3" data-role="assistant">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/15">
        <Search size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="rounded-2xl rounded-tl-sm border border-border/60 bg-card px-4 py-3 text-foreground shadow-sm">
          <MarkdownContent content={body} />
        </div>
        {isReport ? (
          <div className="mt-1.5 flex justify-end">
            <button
              type="button"
              onClick={() => printAssistantMessage(body, 'Yawp Reporter')}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
            >
              <Printer size={13} />
              Print / Save as PDF
            </button>
          </div>
        ) : null}
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
