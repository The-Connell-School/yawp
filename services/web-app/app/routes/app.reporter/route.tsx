import { useEffect, useRef, useState } from 'react';
import {
  redirect,
  useFetcher,
  useLoaderData,
  useSearchParams,
  type LoaderFunctionArgs,
} from 'react-router';
import { Loader2, Plus, Send, Sparkles } from 'lucide-react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { Button } from '~/components/ui/button';
import { Textarea } from '~/components/ui/textarea';
import { cn } from '~/utils/misc';
import { prisma } from '~/utils/db.server';
import { getReporterAccess } from '~/utils/reporter/reporter-access.server';
import { RECOMMENDED_REPORTER_PROMPTS } from '~/routes/api.domain.reporter/build-system-prompt';

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
            messages: {
              orderBy: { createdAt: 'asc' },
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
  const conversationId = selectedConversation?.id;
  const transcriptRef = useRef<HTMLDivElement>(null);
  // Track the last fetcher result we merged so switching conversations (which
  // re-runs this effect with the same stale data) can't re-append a reply.
  const processedData = useRef<ReporterActionData | null>(null);

  const isSending = fetcher.state !== 'idle';

  // Reset the local transcript when switching between saved conversations.
  useEffect(() => {
    setMessages(selectedConversation?.messages ?? []);
  }, [selectedConversation?.id]);

  // Merge the assistant reply back in once the action resolves.
  useEffect(() => {
    if (fetcher.state !== 'idle' || !fetcher.data) return;
    if (processedData.current === fetcher.data) return;
    processedData.current = fetcher.data;
    if (fetcher.data.error) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: fetcher.data!.error! },
      ]);
      return;
    }
    if (fetcher.data.reply) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: fetcher.data!.reply! },
      ]);
      if (fetcher.data.conversationId && !conversationId) {
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
    setInput('');
    fetcher.submit(
      {
        message: trimmed,
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
            <Sparkles size={20} className="text-primary" />
            <div>
              <h2 className="text-lg font-semibold leading-none">
                Yawp Reporter
              </h2>
              <p className="text-sm text-muted-foreground">
                Ask about your classes and students in plain language.
              </p>
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
                <MessageBubble key={index} message={message} />
              ))
            )}
            {isSending ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 size={16} className="animate-spin" />
                Pulling the numbers…
              </div>
            ) : null}
          </div>
        </div>

        <div className="border-t bg-background px-4 py-3">
          <form
            className="mx-auto flex w-full max-w-3xl items-end gap-2"
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
              placeholder="Ask for a grade report, a student's growth, who needs attention…"
              aria-label="Message Yawp Reporter"
              className="max-h-40 min-h-[44px] flex-1 resize-none"
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
          <Sparkles size={28} />
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

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm',
          isUser
            ? 'whitespace-pre-wrap bg-primary text-primary-foreground'
            : 'bg-secondary text-foreground'
        )}
        data-role={message.role}
      >
        {isUser ? (
          message.content
        ) : (
          <MarkdownContent content={message.content} />
        )}
      </div>
    </div>
  );
}

// Scoped styling for rendered Markdown (no typography plugin in this app).
const MARKDOWN_CLASS = cn(
  'text-sm leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
  '[&_h1]:mb-2 [&_h1]:mt-4 [&_h1]:text-base [&_h1]:font-semibold',
  '[&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-sm [&_h2]:font-semibold',
  '[&_h3]:mb-1 [&_h3]:mt-3 [&_h3]:text-sm [&_h3]:font-semibold',
  '[&_p]:my-2',
  '[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5',
  '[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5',
  '[&_li]:my-1',
  '[&_strong]:font-semibold [&_em]:italic',
  '[&_a]:text-primary [&_a]:underline',
  '[&_hr]:my-3 [&_hr]:border-foreground/15',
  '[&_code]:rounded [&_code]:bg-foreground/10 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs',
  '[&_table]:my-2 [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_table]:border-collapse [&_table]:text-xs',
  '[&_th]:border [&_th]:border-foreground/15 [&_th]:bg-foreground/5 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold',
  '[&_td]:border [&_td]:border-foreground/15 [&_td]:px-2 [&_td]:py-1 [&_td]:align-top'
);

/**
 * Render assistant Markdown as sanitized HTML. To avoid a hydration mismatch
 * (DOMPurify only runs in the browser) we render plain text on the server and
 * the first client paint, then upgrade to formatted HTML after mount.
 */
function MarkdownContent({ content }: { content: string }) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    const parsed = marked.parse(content, {
      async: false,
      gfm: true,
    }) as string;
    setHtml(DOMPurify.sanitize(parsed));
  }, [content]);

  if (html === null) {
    return <div className="whitespace-pre-wrap">{content}</div>;
  }

  return (
    <div
      className={MARKDOWN_CLASS}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
