import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
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
  thesisPromptPrimaryLine,
} from './thesis-prompts-library-ui';
import {
  PromptLibraryEmptyState,
  PromptLibraryExpandableTable,
  PromptLibraryFilterPill,
  PromptLibrarySearchField,
  PromptLibraryTableRow,
} from '../assignment-type-prompt-library-table';

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

  useEffect(() => {
    setSearchInput(searchParams.get(FACET_KEYS.search) ?? '');
  }, [searchParams]);

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
        <PromptLibrarySearchField
          value={searchInput}
          onChange={setSearchInput}
          onCommit={commitSearch}
        />

        <div className="flex flex-wrap gap-1.5">
          <PromptLibraryFilterPill
            pressed={activePill === 'all'}
            onClick={() => selectPill({ kind: 'all' })}
          >
            All
          </PromptLibraryFilterPill>
          {categoryPills.map((category) => (
            <PromptLibraryFilterPill
              key={category}
              pressed={activePill === category}
              onClick={() => selectPill({ kind: 'category', value: category })}
            >
              {CATEGORY_LABEL[category]}
            </PromptLibraryFilterPill>
          ))}
          <PromptLibraryFilterPill
            pressed={activePill === 'mine'}
            onClick={() => selectPill({ kind: 'mine' })}
          >
            {COLLECTION_LABEL.mine}
          </PromptLibraryFilterPill>
        </div>
      </div>

      {prompts.length === 0 ? (
        <PromptLibraryEmptyState showingOnlyMine={showingOnlyMine} />
      ) : (
        <PromptLibraryExpandableTable
          itemCount={prompts.length}
          showingOnlyMine={showingOnlyMine}
        >
          {(visibleCount) =>
            prompts.slice(0, visibleCount).map((prompt, index) => (
              <PromptLibraryTableRow
                key={prompt.id}
                isFirst={index === 0}
                primary={thesisPromptPrimaryLine(prompt)}
                meta={formatThesisPromptMetaLine(prompt) || undefined}
                assignmentCreationLocked={assignmentCreationLocked}
                onSelect={() => onSelectPrompt(prompt.prompt)}
              />
            ))
          }
        </PromptLibraryExpandableTable>
      )}
    </section>
  );
}
