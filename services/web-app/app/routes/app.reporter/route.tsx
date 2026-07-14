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
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { Button } from '~/components/ui/button';
import { Textarea } from '~/components/ui/textarea';
import { cn } from '~/utils/misc';
import { isLlmRetryResponse } from '~/utils/llm-retry-ui';
import { prisma } from '~/utils/db.server';
import { getReporterAccess } from '~/utils/reporter/reporter-access.server';
import { RECOMMENDED_REPORTER_PROMPTS } from '~/routes/api.domain.reporter/build-system-prompt';
import { parseAssistantMessage } from './parse-assistant-message';

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
  retrying?: boolean;
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
        pendingSubmission.conversationKey === (selectedConversation?.id ?? 'new')
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

    // The primary LLM provider is down; retry the same turn once on the
    // fallback provider (shared 202 contract — see llm-retry-ui.ts).
    if (isLlmRetryResponse(fetcher.data)) {
      if (submission) {
        fetcher.submit(
          {
            message: submission.message,
            llmRetry: 'fallback',
            ...(submission.conversationKey !== 'new'
              ? { conversationId: submission.conversationKey }
              : {}),
          },
          { method: 'post', action: '/api/domain/reporter' }
        );
      }
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
            <Search size={20} className="text-primary" />
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
              onClick={() => printReport(body)}
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

// Scoped styling for rendered Markdown (no typography plugin in this app).
const MARKDOWN_CLASS = cn(
  'text-sm leading-relaxed text-foreground/90',
  '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
  '[&_h1]:mb-2 [&_h1]:mt-5 [&_h1]:text-base [&_h1]:font-semibold [&_h1]:text-foreground',
  '[&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-foreground',
  '[&_h3]:mb-1 [&_h3]:mt-4 [&_h3]:text-[13px] [&_h3]:font-semibold [&_h3]:uppercase [&_h3]:tracking-wide [&_h3]:text-muted-foreground',
  '[&_p]:my-2',
  '[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:marker:text-primary/60',
  '[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:marker:text-muted-foreground',
  '[&_li]:my-1 [&_li]:pl-1',
  '[&_strong]:font-semibold [&_strong]:text-foreground [&_em]:italic',
  '[&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2',
  '[&_hr]:my-4 [&_hr]:border-border',
  '[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-primary/40 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground',
  '[&_code]:rounded [&_code]:bg-foreground/[0.06] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs',
  // Tables: rounded, bordered card with a soft header and row dividers.
  '[&_table]:my-3 [&_table]:block [&_table]:w-full [&_table]:overflow-hidden [&_table]:overflow-x-auto [&_table]:rounded-xl [&_table]:border [&_table]:border-border [&_table]:text-[13px]',
  '[&_thead]:bg-foreground/[0.035]',
  '[&_th]:whitespace-nowrap [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-[11px] [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground',
  '[&_tbody_tr]:border-t [&_tbody_tr]:border-border/70',
  '[&_tbody_tr:hover]:bg-foreground/[0.02]',
  '[&_td]:px-3 [&_td]:py-2 [&_td]:align-top [&_td]:tabular-nums',
  // Collapsible detail blocks (click-to-expand deep dives).
  '[&_details]:my-3 [&_details]:rounded-xl [&_details]:border [&_details]:border-border [&_details]:bg-foreground/[0.02] [&_details]:px-3 [&_details]:py-2',
  '[&_details[open]]:bg-foreground/[0.03]',
  '[&_summary]:cursor-pointer [&_summary]:select-none [&_summary]:font-medium [&_summary]:text-foreground [&_summary]:marker:text-primary',
  '[&_summary]:hover:text-primary',
  '[&_details>*:not(summary)]:mt-2'
);

/** Markdown → sanitized HTML. Browser-only (DOMPurify needs a DOM). */
function markdownToSafeHtml(content: string): string {
  const parsed = marked.parse(content, { async: false, gfm: true }) as string;
  return DOMPurify.sanitize(parsed, {
    ADD_TAGS: ['details', 'summary'],
    ADD_ATTR: ['open'],
  });
}

/**
 * Render assistant Markdown as sanitized HTML. To avoid a hydration mismatch
 * (DOMPurify only runs in the browser) we render plain text on the server and
 * the first client paint, then upgrade to formatted HTML after mount.
 */
function MarkdownContent({ content }: { content: string }) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    setHtml(markdownToSafeHtml(content));
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

// Self-contained print styles (the popup can't see the app's Tailwind).
const PRINT_CSS = `
  * { box-sizing: border-box; }
  body {
    font: 14px/1.6 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    color: #1a1a1a; margin: 0; padding: 40px; -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .report { max-width: 720px; margin: 0 auto; }
  .brand { display: flex; align-items: center; gap: 8px; border-bottom: 2px solid #c05a3e; padding-bottom: 10px; margin-bottom: 20px; }
  .brand strong { font-size: 15px; color: #c05a3e; }
  .brand span { color: #6b7280; font-size: 12px; margin-left: auto; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 15px; margin: 22px 0 8px; }
  h3 { font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: #6b7280; margin: 18px 0 6px; }
  p { margin: 8px 0; }
  ul, ol { margin: 8px 0; padding-left: 22px; }
  li { margin: 4px 0; }
  strong { font-weight: 600; }
  hr { border: none; border-top: 1px solid #e5e7eb; margin: 18px 0; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
  thead { background: #f5f3f0; }
  th { text-align: left; text-transform: uppercase; font-size: 10px; letter-spacing: .05em; color: #6b7280; padding: 8px 10px; }
  td { padding: 8px 10px; border-top: 1px solid #eee; vertical-align: top; }
  details { border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px 12px; margin: 12px 0; }
  summary { font-weight: 600; }
  blockquote { border-left: 3px solid #c05a3e66; margin: 10px 0; padding-left: 12px; color: #4b5563; }
  @page { margin: 1.5cm; }
`;

/**
 * Open a clean, print-styled copy of a single report in a new window and invoke
 * the browser's print dialog — the teacher picks "Save as PDF" (or a printer).
 * No dependencies or server rendering; the popup is self-styled so it doesn't
 * depend on the app's Tailwind.
 */
function printReport(markdown: string) {
  if (typeof window === 'undefined') return;
  const inner = markdownToSafeHtml(markdown);
  const win = window.open('', '_blank', 'width=880,height=1100');
  if (!win) return; // popup blocked
  const stamp = new Date().toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  win.document.write(
    `<!doctype html><html><head><meta charset="utf-8" />` +
      `<title>Yawp Reporter</title><style>${PRINT_CSS}</style></head>` +
      `<body><main class="report">` +
      `<div class="brand"><strong>Yawp Reporter</strong><span>${stamp}</span></div>` +
      inner +
      `</main></body></html>`
  );
  win.document.close();
  win.focus();
  const run = () => {
    // Expand any collapsed detail blocks so nothing is hidden in the PDF.
    win.document
      .querySelectorAll('details')
      .forEach((node) => node.setAttribute('open', ''));
    win.print();
  };
  // Give the popup a tick to lay out before printing.
  if (win.document.readyState === 'complete') setTimeout(run, 50);
  else win.onload = () => setTimeout(run, 50);
}
