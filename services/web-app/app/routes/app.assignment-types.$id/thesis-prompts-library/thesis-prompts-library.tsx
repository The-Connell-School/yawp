import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { SearchIcon } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { PreviewAssignmentCreationControl } from '~/components/free-tier/preview-assignment-creation-control';
import { cn } from '~/utils/misc';
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  FACET_KEYS,
  type FacetValues,
  type OptionCounts,
  COLLECTION_LABEL,
  type ThesisCategory,
  type ThesisLibraryEntry,
} from './data';
import {
  formatThesisPromptMetaLine,
  THESIS_LIBRARY_INITIAL_VISIBLE,
  thesisPromptPrimaryLine,
} from './thesis-prompts-library-ui';

type Props = {
  prompts: ThesisLibraryEntry[];
  facets: FacetValues;
  optionCounts: OptionCounts;
  totalCount: number;
  onSelectPrompt: (prompt: string) => void;
  assignmentCreationLocked?: boolean;
};

type CategoryPill = { kind: 'all' } | { kind: 'mine' } | { kind: 'category'; value: ThesisCategory };

export function ThesisPromptsLibrary({
  prompts,
  facets,
  totalCount,
  onSelectPrompt,
  assignmentCreationLocked = false,
}: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState(
    searchParams.get(FACET_KEYS.search) ?? ''
  );
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setSearchInput(searchParams.get(FACET_KEYS.search) ?? '');
  }, [searchParams]);

  useEffect(() => {
    setExpanded(false);
  }, [searchParams, prompts.length]);

  function commitSearch(value: string) {
    const next = new URLSearchParams(searchParams);
    const trimmed = value.trim();
    if (trimmed) next.set(FACET_KEYS.search, trimmed);
    else next.delete(FACET_KEYS.search);
    setSearchParams(next, { preventScrollReset: true });
  }

  function readSelected(key: string): Set<string> {
    return new Set(searchParams.get(key)?.split(',').filter(Boolean) ?? []);
  }

  const selectedCategories = readSelected(FACET_KEYS.categories);
  const selectedCollections = readSelected(FACET_KEYS.collections);

  const activePill = useMemo((): CategoryPill['kind'] | ThesisCategory => {
    if (selectedCollections.has('mine') && selectedCategories.size === 0) {
      return 'mine';
    }
    if (selectedCategories.size === 1) {
      return [...selectedCategories][0] as ThesisCategory;
    }
    return 'all';
  }, [selectedCategories, selectedCollections]);

  function selectPill(pill: CategoryPill) {
    const next = new URLSearchParams(searchParams);
    next.delete(FACET_KEYS.categories);
    next.delete(FACET_KEYS.collections);
    if (pill.kind === 'mine') {
      next.set(FACET_KEYS.collections, 'mine');
    } else if (pill.kind === 'category') {
      next.set(FACET_KEYS.categories, pill.value);
    }
    setSearchParams(next, { preventScrollReset: true });
  }

  const categoryPills = CATEGORY_ORDER.filter((c) =>
    facets.categories.includes(c)
  );

  const subtitle =
    prompts.length === totalCount
      ? `${totalCount} prompts · pick one or write your own`
      : `${prompts.length} of ${totalCount} prompts · pick one or write your own`;

  const visiblePrompts = expanded
    ? prompts
    : prompts.slice(0, THESIS_LIBRARY_INITIAL_VISIBLE);
  const hiddenCount = Math.max(0, prompts.length - THESIS_LIBRARY_INITIAL_VISIBLE);

  const showingOnlyMine =
    selectedCollections.has('mine') && !selectedCollections.has('library');

  return (
    <section
      aria-labelledby="thesis-prompt-library-heading"
      className="flex flex-col gap-3"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id="thesis-prompt-library-heading"
          className="text-base font-semibold text-foreground"
        >
          Prompt library
        </h2>
        <span className="text-[13px] text-muted-foreground">{subtitle}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative flex h-9 min-w-[200px] max-w-[360px] flex-1 items-center">
          <SearchIcon
            aria-hidden
            className="pointer-events-none absolute left-3 h-[15px] w-[15px] text-muted-foreground"
          />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onBlur={() => commitSearch(searchInput)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitSearch(searchInput);
              }
            }}
            placeholder="Search prompts"
            aria-label="Search prompts"
            className="h-9 bg-input-background pl-9"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          <FilterPill
            pressed={activePill === 'all'}
            onClick={() => selectPill({ kind: 'all' })}
          >
            All
          </FilterPill>
          {categoryPills.map((category) => (
            <FilterPill
              key={category}
              pressed={activePill === category}
              onClick={() => selectPill({ kind: 'category', value: category })}
            >
              {CATEGORY_LABEL[category]}
            </FilterPill>
          ))}
          <FilterPill
            pressed={activePill === 'mine'}
            onClick={() => selectPill({ kind: 'mine' })}
          >
            {COLLECTION_LABEL.mine}
          </FilterPill>
        </div>
      </div>

      {prompts.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          {showingOnlyMine
            ? 'You haven’t saved any prompts yet. Use New → Generate a prompt, then “Save prompt” (or “Use this prompt”) to keep one here.'
            : 'No prompts match the current filters.'}
        </p>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <ul className="m-0 list-none p-0">
              {visiblePrompts.map((prompt, index) => (
                <PromptRow
                  key={prompt.id}
                  prompt={prompt}
                  isFirst={index === 0}
                  assignmentCreationLocked={assignmentCreationLocked}
                  onSelect={() => onSelectPrompt(prompt.prompt)}
                />
              ))}
            </ul>
          </div>

          {!expanded && hiddenCount > 0 ? (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="self-start text-[13px] font-medium text-primary hover:underline"
            >
              Show {hiddenCount} more prompts
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}

function FilterPill({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        'h-[30px] shrink-0 rounded-full border px-3 text-[13px] text-foreground transition-colors',
        pressed
          ? 'border-foreground bg-muted'
          : 'border-border bg-card hover:bg-muted/50'
      )}
    >
      {children}
    </button>
  );
}

function PromptRow({
  prompt,
  isFirst,
  onSelect,
  assignmentCreationLocked = false,
}: {
  prompt: ThesisLibraryEntry;
  isFirst: boolean;
  onSelect: () => void;
  assignmentCreationLocked?: boolean;
}) {
  const primary = thesisPromptPrimaryLine(prompt);
  const meta = formatThesisPromptMetaLine(prompt);

  const useButton = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={assignmentCreationLocked ? undefined : onSelect}
      className="h-8 shrink-0 rounded-full bg-card px-3 text-[13px] font-medium"
    >
      Use prompt
    </Button>
  );

  return (
    <li
      className={cn(
        'flex gap-4 px-4 py-3.5',
        !isFirst && 'border-t border-border'
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="m-0 text-sm leading-normal text-foreground">{primary}</p>
        {meta ? (
          <p className="m-0 text-xs leading-normal text-muted-foreground">
            {meta}
          </p>
        ) : null}
      </div>
      {assignmentCreationLocked ? (
        <PreviewAssignmentCreationControl>{useButton}</PreviewAssignmentCreationControl>
      ) : (
        useButton
      )}
    </li>
  );
}
