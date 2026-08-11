import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useFetcher } from 'react-router';
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { Button } from '~/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet';
import { Textarea } from '~/components/ui/textarea';
import {
  COGNITIVE_MOVE_LABEL,
  PROMPT_TYPE_LABEL,
  SERIOUSNESS_LABEL,
} from './data';
import type { GeneratedPrompt, GeneratorMessage } from './prompt-generator';

const GENERATOR_ACTION = '/api/domain/daily-pages-prompt-generator';
const SAVE_ACTION = '/api/domain/daily-pages-prompt-save';

const STARTER_PROMPTS = [
  'A playful warm-up about identity for 9th graders',
  'Something to pair with the ending of Of Mice and Men',
  'A hypothetical that gets 11th graders arguing about free will',
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

type SaveFetcherData = {
  success: boolean;
  message?: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Assignment type the saved prompt belongs to ("My prompts" is per type). */
  assignmentTypeId: string;
  /** Called with the drafted prompt when the teacher chooses to use it. */
  onUsePrompt: (prompt: string) => void;
};

/** Identity of a draft for save bookkeeping — the text is what gets stored. */
function promptKey(option: GeneratedPrompt): string {
  return option.prompt.trim();
}

/**
 * The library-style tag line for a draft ("Agree / disagree · Moderate ·
 * Take a stance"). The model tags drafts with the library's own vocabulary, but
 * tagging is best-effort — anything missing is simply left off. Pure and
 * exported so it is unit-tested without a DOM.
 */
export function formatOptionTags(option: GeneratedPrompt): string[] {
  const tags: string[] = [];
  if (option.type) tags.push(PROMPT_TYPE_LABEL[option.type]);
  if (option.seriousness) tags.push(SERIOUSNESS_LABEL[option.seriousness]);
  for (const move of option.cognitiveMoves ?? []) {
    tags.push(COGNITIVE_MOVE_LABEL[move]);
  }
  return tags;
}

/** Flatten display turns into the {role, content} history the API expects. */
function toApiMessages(turns: GeneratorTurn[]): GeneratorMessage[] {
  return turns.map((turn) => {
    if (turn.role === 'assistant' && turn.options && turn.options.length > 0) {
      const rendered = turn.options
        .map((option, index) => `Option ${index + 1}: ${option.prompt}`)
        .join('\n');
      return {
        role: 'assistant',
        content: `${turn.content}\n\n${rendered}`,
      };
    }
    return { role: turn.role, content: turn.content };
  });
}

export function DailyPagesPromptGenerator({
  open,
  onOpenChange,
  assignmentTypeId,
  onUsePrompt,
}: Props) {
  const fetcher = useFetcher<GeneratorFetcherData>();
  const saveFetcher = useFetcher<SaveFetcherData>();
  const [turns, setTurns] = useState<GeneratorTurn[]>([]);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const lastHandled = useRef<GeneratorFetcherData | null>(null);
  const lastSaveHandled = useRef<SaveFetcherData | null>(null);
  const pendingSaveKey = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isThinking = fetcher.state !== 'idle';

  // Reset the conversation each time the sheet is opened fresh.
  useEffect(() => {
    if (open) {
      setTurns([]);
      setInput('');
      setError(null);
      setSavedKeys(new Set());
      lastHandled.current = null;
      lastSaveHandled.current = null;
      pendingSaveKey.current = null;
    }
  }, [open]);

  // A save that failed shouldn't keep claiming the prompt is in the library.
  useEffect(() => {
    if (saveFetcher.state !== 'idle' || !saveFetcher.data) return;
    if (lastSaveHandled.current === saveFetcher.data) return;
    lastSaveHandled.current = saveFetcher.data;
    if (saveFetcher.data.success) return;

    const failedKey = pendingSaveKey.current;
    if (failedKey) {
      setSavedKeys((prev) => {
        const next = new Set(prev);
        next.delete(failedKey);
        return next;
      });
    }
    setError(
      saveFetcher.data.message ??
        "That prompt couldn't be saved. Please try again."
    );
  }, [saveFetcher.state, saveFetcher.data]);

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

  /**
   * Keep a draft in the teacher's "My prompts" collection. Optimistic: the
   * button flips to "Saved" right away and only reverts if the write fails.
   * Saving is idempotent server-side, so re-saving the same prompt is a no-op.
   */
  function savePrompt(option: GeneratedPrompt) {
    const key = promptKey(option);
    if (savedKeys.has(key)) return;
    setError(null);
    setSavedKeys((prev) => new Set(prev).add(key));
    pendingSaveKey.current = key;
    saveFetcher.submit(
      {
        assignmentTypeId,
        prompt: option.prompt,
        facets: JSON.stringify({
          type: option.type,
          seriousness: option.seriousness,
          cognitiveMoves: option.cognitiveMoves,
        }),
      },
      { method: 'post', action: SAVE_ACTION }
    );
  }

  /** Using a prompt keeps it too — anything assigned lands in "My prompts". */
  function usePrompt(option: GeneratedPrompt) {
    savePrompt(option);
    onUsePrompt(option.prompt);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col overflow-hidden sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Generate a prompt</SheetTitle>
          <SheetDescription>
            Describe the freewrite you have in mind and work with the assistant
            to draft prompts in the style of the library. When you like one, use
            it to start an assignment.
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
                  <p className="whitespace-pre-wrap leading-6">{turn.content}</p>
                ) : (
                  <FormattedReply text={turn.content} />
                )}
                {turn.role === 'assistant' &&
                turn.options &&
                turn.options.length > 0 ? (
                  <PromptOptionsCarousel
                    options={turn.options}
                    onUse={usePrompt}
                    onSave={savePrompt}
                    isSaved={(option) => savedKeys.has(promptKey(option))}
                  />
                ) : null}
              </div>
            </div>
          ))}

          {isThinking ? (
            <p className="text-sm text-muted-foreground">Drafting…</p>
          ) : null}
        </div>

        {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}

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
    .map((block): ReplyBlock => {
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
    .filter((block: ReplyBlock) =>
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

/**
 * A pageable set of drafted prompts: arrows to move between options, with
 * "Use this prompt" on whichever option is showing. Daily Pages prompts are
 * one-liners, so the prompt itself is the headline — the library-style tag line
 * sits underneath.
 */
function PromptOptionsCarousel({
  options,
  onUse,
  onSave,
  isSaved,
}: {
  options: GeneratedPrompt[];
  onUse: (option: GeneratedPrompt) => void;
  onSave: (option: GeneratedPrompt) => void;
  isSaved: (option: GeneratedPrompt) => boolean;
}) {
  const [index, setIndex] = useState(0);
  const count = options.length;
  const activeIndex = Math.min(index, count - 1);
  const active = options[activeIndex];
  if (!active) return null;
  const tags = formatOptionTags(active);
  const saved = isSaved(active);

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
          {count > 1 ? (
            <p className="text-xs text-muted-foreground">
              Option {activeIndex + 1} of {count}
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

      <p className="px-1 text-[17px] leading-relaxed text-foreground">
        {active.prompt}
      </p>

      {tags.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-xs text-muted-foreground">
          {tags.map((tag, tagIndex) => (
            <span key={tag} className="flex items-center gap-2">
              {tagIndex > 0 ? <span aria-hidden>·</span> : null}
              <span>{tag}</span>
            </span>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={saved}
          onClick={() => onSave(active)}
        >
          {saved ? (
            <>
              <CheckIcon className="mr-1.5 h-4 w-4" />
              Saved
            </>
          ) : (
            'Save prompt'
          )}
        </Button>
        <Button type="button" size="sm" onClick={() => onUse(active)}>
          Use this prompt
        </Button>
      </div>
      <p className="text-right text-xs text-muted-foreground">
        Saved prompts show up under <strong>My prompts</strong> in the Prompt
        Library. Using a prompt saves it too.
      </p>
    </div>
  );
}
