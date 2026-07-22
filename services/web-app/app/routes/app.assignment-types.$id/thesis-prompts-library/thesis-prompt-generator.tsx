import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useFetcher } from 'react-router';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { Button } from '~/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet';
import { Textarea } from '~/components/ui/textarea';
import type {
  GeneratedPrompt,
  GeneratorMessage,
} from './prompt-generator';

const GENERATOR_ACTION = '/api/domain/thesis-prompt-generator';

const STARTER_PROMPTS = [
  'A prompt about ambition and its costs for 10th graders reading Macbeth',
  'A general prompt (no text) about a problem in the student’s community',
  'A prompt comparing two characters in the novel we just finished',
];

type GeneratorTurn = {
  role: 'user' | 'assistant';
  /** The chat text shown in the bubble. */
  content: string;
  /** Distinct prompt drafts offered on this turn (assistant only). */
  options?: GeneratedPrompt[];
};

type GeneratorFetcherData = {
  success: boolean;
  reply?: string;
  options?: GeneratedPrompt[];
  message?: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the drafted prompt body when the teacher chooses to use it. */
  onUsePrompt: (promptBody: string) => void;
};

/** Flatten display turns into the {role, content} history the API expects. */
function toApiMessages(turns: GeneratorTurn[]): GeneratorMessage[] {
  return turns.map((turn) => {
    if (turn.role === 'assistant' && turn.options && turn.options.length > 0) {
      const rendered = turn.options
        .map((option, index) => `Option ${index + 1}: ${option.title}\n${option.body}`)
        .join('\n\n');
      return {
        role: 'assistant',
        content: `${turn.content}\n\n${rendered}`,
      };
    }
    return { role: turn.role, content: turn.content };
  });
}

export function ThesisPromptGenerator({
  open,
  onOpenChange,
  onUsePrompt,
}: Props) {
  const fetcher = useFetcher<GeneratorFetcherData>();
  const [turns, setTurns] = useState<GeneratorTurn[]>([]);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const lastHandled = useRef<GeneratorFetcherData | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isThinking = fetcher.state !== 'idle';

  // Reset the conversation each time the sheet is opened fresh.
  useEffect(() => {
    if (open) {
      setTurns([]);
      setInput('');
      setError(null);
      lastHandled.current = null;
    }
  }, [open]);

  // Append the assistant's reply once a response arrives (dedup by identity).
  useEffect(() => {
    if (fetcher.state !== 'idle' || !fetcher.data) return;
    if (lastHandled.current === fetcher.data) return;
    lastHandled.current = fetcher.data;

    if (fetcher.data.success && fetcher.data.reply) {
      setTurns((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: fetcher.data!.reply as string,
          options: fetcher.data!.options ?? [],
        },
      ]);
    } else {
      setError(
        fetcher.data.message ??
          'The prompt generator is unavailable right now. Please try again.'
      );
    }
  }, [fetcher.state, fetcher.data]);

  // Keep the newest message in view.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [turns, isThinking]);

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isThinking) return;
    setError(null);
    const nextTurns: GeneratorTurn[] = [
      ...turns,
      { role: 'user', content: trimmed },
    ];
    setTurns(nextTurns);
    setInput('');
    fetcher.submit(
      { messages: JSON.stringify(toApiMessages(nextTurns)) },
      { method: 'post', action: GENERATOR_ACTION }
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col overflow-hidden sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Generate a prompt</SheetTitle>
          <SheetDescription>
            Describe the essay you have in mind and work with the assistant to
            draft a prompt in the style of the library. When you like it, use it
            to start an assignment.
          </SheetDescription>
        </SheetHeader>

        <div
          ref={scrollRef}
          className="mt-4 flex-1 space-y-4 overflow-y-auto pr-1"
        >
          {turns.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Try one of these to get started:
              </p>
              <div className="flex flex-col gap-2">
                {STARTER_PROMPTS.map((starter) => (
                  <button
                    key={starter}
                    type="button"
                    onClick={() => send(starter)}
                    className="rounded-lg border bg-card p-3 text-left text-sm text-card-foreground transition hover:bg-accent hover:text-accent-foreground"
                  >
                    {starter}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {turns.map((turn, index) => (
            <div
              key={index}
              className={
                turn.role === 'user' ? 'flex justify-end' : 'flex justify-start'
              }
            >
              <div
                className={
                  turn.role === 'user'
                    ? 'max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2 text-sm text-primary-foreground'
                    : 'w-full space-y-3'
                }
              >
                {turn.role === 'user' ? (
                  <p className="whitespace-pre-wrap leading-6">
                    {turn.content}
                  </p>
                ) : (
                  <FormattedReply text={turn.content} />
                )}
                {turn.role === 'assistant' &&
                turn.options &&
                turn.options.length > 0 ? (
                  <PromptOptionsCarousel
                    options={turn.options}
                    onUse={onUsePrompt}
                  />
                ) : null}
              </div>
            </div>
          ))}

          {isThinking ? (
            <p className="text-sm text-muted-foreground">Drafting…</p>
          ) : null}
        </div>

        {error ? (
          <p className="mt-2 text-sm text-destructive">{error}</p>
        ) : null}

        <form
          className="mt-3 flex items-end gap-2 border-t pt-3"
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
            placeholder="Describe the prompt you want or just say what you're teaching"
            rows={2}
            className="min-h-[44px] resize-none"
            disabled={isThinking}
          />
          <Button type="submit" disabled={isThinking || !input.trim()}>
            Send
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

type ReplyBlock =
  | { kind: 'paragraph'; text: string }
  | { kind: 'bullet' | 'ordered'; items: string[] };

/**
 * Split an assistant reply into paragraph / bullet / ordered-list blocks. Pure
 * and exported so the formatting is unit-tested without a DOM. Keeps just enough
 * Markdown to make replies skimmable — no dependency, no raw HTML.
 */
export function parseReplyBlocks(text: string): ReplyBlock[] {
  return text
    .trim()
    .split(/\n\s*\n/)
    .map((block) => {
      const lines = block.split('\n').filter((line) => line.trim().length > 0);
      const isBulleted =
        lines.length > 0 && lines.every((line) => /^\s*[-*•]\s+/.test(line));
      const isNumbered =
        lines.length > 0 && lines.every((line) => /^\s*\d+[.)]\s+/.test(line));

      if (isBulleted || isNumbered) {
        return {
          kind: isNumbered ? 'ordered' : 'bullet',
          items: lines.map((line) =>
            line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '')
          ),
        };
      }
      return { kind: 'paragraph', text: block };
    })
    .filter(
      (block) =>
        block.kind === 'paragraph'
          ? block.text.trim().length > 0
          : block.items.length > 0
    );
}

/** Split a line into plain and `**bold**` segments. Pure and exported. */
export function parseInlineSegments(
  text: string
): Array<{ bold: boolean; text: string }> {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter((part) => part.length > 0)
    .map((part) => {
      const bold = /^\*\*([^*]+)\*\*$/.exec(part);
      return bold ? { bold: true, text: bold[1] } : { bold: false, text: part };
    });
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  return parseInlineSegments(text).map((segment, i) =>
    segment.bold ? (
      <strong key={`${keyPrefix}-${i}`}>{segment.text}</strong>
    ) : (
      <span key={`${keyPrefix}-${i}`}>{segment.text}</span>
    )
  );
}

/**
 * A deliberately small Markdown renderer for the assistant's chat replies —
 * just enough to keep them lively and skimmable (short paragraphs, bullet /
 * numbered lists, and **bold**) without pulling in a Markdown dependency or
 * ever setting raw HTML.
 */
function FormattedReply({ text }: { text: string }) {
  return (
    <div className="space-y-2 leading-6">
      {parseReplyBlocks(text).map((block, blockIndex) => {
        if (block.kind === 'paragraph') {
          return (
            <p key={blockIndex} className="whitespace-pre-line">
              {renderInline(block.text, `${blockIndex}`)}
            </p>
          );
        }
        const ListTag = block.kind === 'ordered' ? 'ol' : 'ul';
        return (
          <ListTag
            key={blockIndex}
            className={
              block.kind === 'ordered'
                ? 'list-decimal space-y-1 pl-5'
                : 'list-disc space-y-1 pl-5'
            }
          >
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>
                {renderInline(item, `${blockIndex}-${itemIndex}`)}
              </li>
            ))}
          </ListTag>
        );
      })}
    </div>
  );
}

/** A pageable set of drafted prompts: arrows to move between options, with a
 * "Use this prompt" action on whichever option is showing. */
function PromptOptionsCarousel({
  options,
  onUse,
}: {
  options: GeneratedPrompt[];
  onUse: (promptBody: string) => void;
}) {
  const [index, setIndex] = useState(0);
  const count = options.length;
  const active = options[Math.min(index, count - 1)];
  if (!active) return null;

  return (
    <div className="space-y-3 rounded-lg border bg-muted/40 p-4">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={count <= 1}
          onClick={() => setIndex((i) => (i - 1 + count) % count)}
          aria-label="Previous option"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1 text-center">
          <h3 className="truncate text-base font-semibold">{active.title}</h3>
          {count > 1 ? (
            <p className="text-xs text-muted-foreground">
              Option {Math.min(index, count - 1) + 1} of {count}
            </p>
          ) : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={count <= 1}
          onClick={() => setIndex((i) => (i + 1) % count)}
          aria-label="Next option"
        >
          <ChevronRightIcon className="h-4 w-4" />
        </Button>
      </div>
      <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
        {active.body}
      </p>
      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={() => onUse(active.body)}>
          Use this prompt
        </Button>
      </div>
    </div>
  );
}
