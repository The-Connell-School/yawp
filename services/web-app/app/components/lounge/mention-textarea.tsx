import { useId, useMemo, useRef, useState } from 'react';
import {
  encodeMentions,
  findMentionQuery,
  type PickedMention,
} from '~/domain/lounge/mentions';
import type { LoungeMentionCandidate } from '~/domain/lounge/lounge.server';
import { Textarea } from '~/components/ui/textarea';
import { cn } from '~/utils/misc';

/**
 * A textarea with an @mention picker. The teacher sees "@Brian Connell";
 * a hidden input named `name` carries the body with mention tokens.
 */
export function MentionTextarea({
  name,
  id,
  candidates,
  defaultText = '',
  defaultMentions = [],
  rows = 4,
  placeholder,
  onTextChange,
  className,
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
}: {
  name: string;
  id?: string;
  candidates: LoungeMentionCandidate[];
  defaultText?: string;
  defaultMentions?: PickedMention[];
  rows?: number;
  placeholder?: string;
  onTextChange?: (text: string) => void;
  className?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}) {
  const generatedId = useId();
  const textareaId = id ?? generatedId;
  const listId = `${textareaId}-mentions`;
  const ref = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState(defaultText);
  const [mentions, setMentions] = useState<PickedMention[]>(defaultMentions);
  const [query, setQuery] = useState<{ query: string; start: number; end: number } | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const matches = useMemo(() => {
    if (!query) return [];
    const q = query.query.toLowerCase();
    return candidates
      .filter((c) => !q || c.label.toLowerCase().split(/\s+/).some((w) => w.startsWith(q)) || c.label.toLowerCase().startsWith(q))
      .slice(0, 6);
  }, [candidates, query]);
  const open = matches.length > 0;

  function refreshQuery(value: string, caret: number) {
    const found = findMentionQuery(value.slice(0, caret));
    setQuery(found ? { ...found, end: caret } : null);
    setActiveIndex(0);
  }

  function update(value: string, caret: number) {
    setText(value);
    onTextChange?.(value);
    refreshQuery(value, caret);
  }

  function pick(candidate: LoungeMentionCandidate) {
    if (!query) return;
    const inserted = `@${candidate.label} `;
    const next = text.slice(0, query.start) + inserted + text.slice(query.end);
    const caret = query.start + inserted.length;
    setText(next);
    onTextChange?.(next);
    setMentions((current) =>
      current.some((m) => m.userId === candidate.userId)
        ? current
        : [...current, { userId: candidate.userId, label: candidate.label }]
    );
    setQuery(null);
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(caret, caret);
    });
  }

  return (
    <div className="relative">
      <input type="hidden" name={name} value={encodeMentions(text, mentions)} />
      <Textarea
        ref={ref}
        id={textareaId}
        rows={rows}
        value={text}
        placeholder={placeholder}
        className={cn('text-base leading-relaxed', className)}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${activeIndex}` : undefined}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        onChange={(event) => update(event.target.value, event.target.selectionStart ?? event.target.value.length)}
        onClick={(event) => refreshQuery(text, event.currentTarget.selectionStart ?? text.length)}
        onBlur={() => setQuery(null)}
        onKeyDown={(event) => {
          if (!open) return;
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActiveIndex((i) => (i + 1) % matches.length);
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIndex((i) => (i - 1 + matches.length) % matches.length);
          } else if (event.key === 'Enter' || event.key === 'Tab') {
            event.preventDefault();
            pick(matches[activeIndex]);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            setQuery(null);
          }
        }}
      />
      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="People you can mention"
          className="absolute left-2 top-full z-20 mt-1 min-w-64 overflow-hidden rounded-lg border bg-background py-1 shadow-lg"
        >
          {matches.map((candidate, index) => (
            <li
              key={candidate.userId}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              className={cn('cursor-pointer px-3 py-2 text-sm', index === activeIndex && 'bg-secondary')}
              onMouseDown={(event) => {
                event.preventDefault();
                pick(candidate);
              }}
              onMouseEnter={() => setActiveIndex(index)}
            >
              <span className="font-medium">{candidate.label}</span>
              {candidate.detail ? (
                <span className="text-muted-foreground"> · {candidate.detail}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
