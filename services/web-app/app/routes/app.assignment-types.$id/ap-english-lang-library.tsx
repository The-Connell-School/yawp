import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { FilterIcon, XIcon } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '~/components/ui/accordion';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '~/components/ui/sheet';
import {
  AP_ENGLISH_LANG_COLLECTION_LABEL,
  AP_ENGLISH_LANG_FACET_KEYS,
  type ApEnglishLangFacetValues,
  type ApEnglishLangFilterableEntry,
  type ApEnglishLangOptionCounts,
  collectionOf,
  formatApEnglishLangFacetValue,
  formatApEnglishLangFrqType,
} from './ap-english-lang-library-filters';

export type ApEnglishLangLibraryEntry = ApEnglishLangFilterableEntry;

type Props = {
  entries: ApEnglishLangLibraryEntry[];
  facets: ApEnglishLangFacetValues;
  optionCounts: ApEnglishLangOptionCounts;
  totalCount: number;
  onSelectEntry: (entry: ApEnglishLangLibraryEntry) => void;
};

type FacetSpec = {
  facetKey: keyof ApEnglishLangOptionCounts;
  paramKey: string;
  title: string;
  renderLabel: (value: string) => string;
};

const FACET_SECTIONS: FacetSpec[] = [
  {
    facetKey: 'collections',
    paramKey: AP_ENGLISH_LANG_FACET_KEYS.collections,
    title: 'Collection',
    renderLabel: (value) =>
      AP_ENGLISH_LANG_COLLECTION_LABEL[
        value as keyof typeof AP_ENGLISH_LANG_COLLECTION_LABEL
      ] ?? value,
  },
  {
    facetKey: 'frqTypes',
    paramKey: AP_ENGLISH_LANG_FACET_KEYS.frqTypes,
    title: 'Question type',
    renderLabel: formatApEnglishLangFrqType,
  },
  {
    facetKey: 'focusSkills',
    paramKey: AP_ENGLISH_LANG_FACET_KEYS.focusSkills,
    title: 'Focus skill',
    renderLabel: formatApEnglishLangFacetValue,
  },
  {
    facetKey: 'difficulties',
    paramKey: AP_ENGLISH_LANG_FACET_KEYS.difficulties,
    title: 'Difficulty',
    renderLabel: formatApEnglishLangFacetValue,
  },
];

export function ApEnglishLangLibrary({
  entries,
  facets,
  optionCounts,
  totalCount,
  onSelectEntry,
}: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState(
    searchParams.get(AP_ENGLISH_LANG_FACET_KEYS.search) ?? ''
  );
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  useEffect(() => {
    setSearchInput(searchParams.get(AP_ENGLISH_LANG_FACET_KEYS.search) ?? '');
  }, [searchParams]);

  function readSelected(key: string): Set<string> {
    return new Set(searchParams.get(key)?.split(',').filter(Boolean) ?? []);
  }

  function toggleFacet(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    const current = new Set(next.get(key)?.split(',').filter(Boolean) ?? []);
    if (current.has(value)) current.delete(value);
    else current.add(value);
    if (current.size === 0) next.delete(key);
    else next.set(key, [...current].join(','));
    setSearchParams(next, { preventScrollReset: true });
  }

  function commitSearch(value: string) {
    const trimmed = value.trim();
    const current = searchParams.get(AP_ENGLISH_LANG_FACET_KEYS.search) ?? '';
    // Blur fires when a teacher clicks a filter chip or checkbox. Committing an
    // unchanged term there would start a second navigation that races the one
    // the click is about to start, and the search would appear to come back.
    if (trimmed === current) return;

    const next = new URLSearchParams(searchParams);
    if (trimmed) next.set(AP_ENGLISH_LANG_FACET_KEYS.search, trimmed);
    else next.delete(AP_ENGLISH_LANG_FACET_KEYS.search);
    setSearchParams(next, { preventScrollReset: true });
  }

  function clearAll() {
    const next = new URLSearchParams(searchParams);
    Object.values(AP_ENGLISH_LANG_FACET_KEYS).forEach((key) =>
      next.delete(key)
    );
    setSearchParams(next, { preventScrollReset: true });
    setSearchInput('');
  }

  const hasAnyFilter = Object.values(AP_ENGLISH_LANG_FACET_KEYS).some((key) =>
    searchParams.has(key)
  );

  type ActiveChip = { paramKey: string; value: string; label: string };
  const activeChips = useMemo<ActiveChip[]>(() => {
    const out: ActiveChip[] = [];
    for (const facet of FACET_SECTIONS) {
      const selected =
        searchParams.get(facet.paramKey)?.split(',').filter(Boolean) ?? [];
      for (const value of selected) {
        out.push({
          paramKey: facet.paramKey,
          value,
          label: facet.renderLabel(value),
        });
      }
    }
    const query = searchParams.get(AP_ENGLISH_LANG_FACET_KEYS.search);
    if (query) {
      out.push({
        paramKey: AP_ENGLISH_LANG_FACET_KEYS.search,
        value: query,
        label: `“${query}”`,
      });
    }
    return out;
  }, [searchParams]);

  function removeChip(chip: ActiveChip) {
    const next = new URLSearchParams(searchParams);
    if (chip.paramKey === AP_ENGLISH_LANG_FACET_KEYS.search) {
      next.delete(AP_ENGLISH_LANG_FACET_KEYS.search);
      setSearchInput('');
    } else {
      const current = new Set(
        next.get(chip.paramKey)?.split(',').filter(Boolean) ?? []
      );
      current.delete(chip.value);
      if (current.size === 0) next.delete(chip.paramKey);
      else next.set(chip.paramKey, [...current].join(','));
    }
    setSearchParams(next, { preventScrollReset: true });
  }

  const filterPanel = (
    <FilterPanel
      facets={facets}
      optionCounts={optionCounts}
      readSelected={readSelected}
      onToggle={toggleFacet}
      hasAnyFilter={hasAnyFilter}
      onClearAll={clearAll}
      searchInput={searchInput}
      onSearchInputChange={setSearchInput}
      onSearchCommit={() => commitSearch(searchInput)}
    />
  );

  const countLabel =
    entries.length === totalCount
      ? `${totalCount} ${totalCount === 1 ? 'prompt' : 'prompts'}`
      : `${entries.length} of ${totalCount} prompts`;

  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold">AP Language Prompt Library</h2>

      {totalCount === 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
          No AP Language prompts have been published yet.
        </div>
      ) : (
        <div className="flex flex-col gap-6 pt-2 lg:flex-row">
          <aside className="hidden lg:block lg:w-[240px] lg:shrink-0">
            {filterPanel}
          </aside>

          <div className="lg:hidden">
            <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
              <SheetTrigger asChild>
                <Button type="button" variant="outline" size="sm">
                  <FilterIcon className="mr-1.5 h-4 w-4" />
                  Filter
                  {activeChips.length > 0 ? (
                    <span className="ml-1.5 rounded-full bg-foreground/10 px-1.5 text-[11px] leading-5">
                      {activeChips.length}
                    </span>
                  ) : null}
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="w-full overflow-y-auto sm:max-w-sm"
              >
                <SheetHeader>
                  <SheetTitle>Filter AP Language prompts</SheetTitle>
                </SheetHeader>
                <div className="mt-4">{filterPanel}</div>
              </SheetContent>
            </Sheet>
          </div>

          <main className="min-w-0 flex-1">
            <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border/40 pb-3 text-xs text-muted-foreground">
              <span>{countLabel}</span>
              {activeChips.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {activeChips.map((chip) => (
                    <button
                      key={`${chip.paramKey}:${chip.value}`}
                      type="button"
                      aria-label={`Remove filter ${chip.label}`}
                      onClick={() => removeChip(chip)}
                      className="inline-flex items-center gap-1 rounded-full bg-foreground/[0.06] px-2 py-0.5 text-foreground transition-colors hover:bg-foreground/10"
                    >
                      <span>{chip.label}</span>
                      <XIcon className="h-3 w-3" />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {entries.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No AP Language prompts match the current filters.
              </p>
            ) : (
              <div className="grid gap-3">
                {entries.map((entry) => (
                  <LibraryEntryCard
                    key={entry.externalKey}
                    entry={entry}
                    onSelect={() => onSelectEntry(entry)}
                  />
                ))}
              </div>
            )}
          </main>
        </div>
      )}
    </section>
  );
}

/** What the provided material is called, per question type. */
function sourceNoun(frqType: string) {
  return frqType === 'rhetorical_analysis' ? 'Passage' : 'Source';
}

/**
 * The document a card should name. Q2 provides exactly one passage, so naming it
 * is unambiguous; a Q1 packet has several, and the first stands in for the set.
 */
function describeProvidedDocument(entry: ApEnglishLangLibraryEntry) {
  const first = entry.sources[0];
  if (!first) return null;
  return {
    title: first.title,
    attribution: first.attribution,
    words: first.body.trim().split(/\s+/).filter(Boolean).length,
  };
}

function LibraryEntryCard({
  entry,
  onSelect,
}: {
  entry: ApEnglishLangLibraryEntry;
  onSelect: () => void;
}) {
  const providedDocument = describeProvidedDocument(entry);

  return (
    <Button
      type="button"
      variant="unstyled"
      className="h-auto w-full rounded-lg border bg-card p-4 text-left text-card-foreground shadow-sm transition hover:bg-accent hover:text-accent-foreground"
      onClick={onSelect}
    >
      <div className="flex w-full flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <h3 className="text-base font-semibold leading-snug">{entry.title}</h3>
          <div className="flex w-fit shrink-0 flex-wrap gap-2">
            {collectionOf(entry) === 'mine' ? (
              <Badge variant="outline" size="sm" className="w-fit">
                {AP_ENGLISH_LANG_COLLECTION_LABEL.mine}
              </Badge>
            ) : null}
            <Badge variant="secondary" size="sm" className="w-fit">
              {formatApEnglishLangFrqType(entry.frqType)}
            </Badge>
          </div>
        </div>

        <p className="line-clamp-3 whitespace-normal text-sm font-normal leading-6 text-muted-foreground">
          {entry.prompt}
        </p>

        {/*
          The prompt above is only the headnote. Naming the provided document and
          its length tells the teacher at a glance that a real passage is
          attached, and roughly how long it will take a student to read -- a
          bare "1 source" badge reads as though nothing is there.
        */}
        {providedDocument ? (
          <p className="whitespace-normal text-xs font-normal leading-5 text-muted-foreground">
            <span className="font-medium">{sourceNoun(entry.frqType)}:</span>{' '}
            {providedDocument.title} · {providedDocument.attribution}
            {providedDocument.words > 0
              ? ` · ${providedDocument.words} words`
              : ''}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" size="sm">
            {formatApEnglishLangFacetValue(entry.focusSkill)}
          </Badge>
          {entry.difficulty ? (
            <Badge variant="outline" size="sm">
              {formatApEnglishLangFacetValue(entry.difficulty)}
            </Badge>
          ) : null}
          <Badge variant="outline" size="sm">
            {entry.sources.length}{' '}
            {entry.sources.length === 1
              ? sourceNoun(entry.frqType).toLowerCase()
              : `${sourceNoun(entry.frqType).toLowerCase()}s`}
          </Badge>
        </div>
      </div>
    </Button>
  );
}

function FilterPanel({
  facets,
  optionCounts,
  readSelected,
  onToggle,
  hasAnyFilter,
  onClearAll,
  searchInput,
  onSearchInputChange,
  onSearchCommit,
}: {
  facets: ApEnglishLangFacetValues;
  optionCounts: ApEnglishLangOptionCounts;
  readSelected: (key: string) => Set<string>;
  onToggle: (key: string, value: string) => void;
  hasAnyFilter: boolean;
  onClearAll: () => void;
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  onSearchCommit: () => void;
}) {
  return (
    <div className="space-y-2">
      {/* Not sticky: this panel scrolls with the page, and pinning the search
          field would cover the first filter option once a teacher scrolls. */}
      <div className="-mx-1 px-1 pb-2 pt-1">
        <Input
          value={searchInput}
          onChange={(event) => onSearchInputChange(event.target.value)}
          onBlur={onSearchCommit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              onSearchCommit();
            }
          }}
          placeholder="Search AP Language prompts…"
          aria-label="Search AP Language prompts"
          className="h-9"
        />
        {hasAnyFilter ? (
          <div className="mt-1.5 flex justify-end">
            <button
              type="button"
              onClick={onClearAll}
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              Clear all
            </button>
          </div>
        ) : null}
      </div>

      {/* Every facet starts collapsed so the panel opens as a short list of
          categories rather than a wall of options. */}
      <Accordion type="multiple" className="border-none">
        {FACET_SECTIONS.map((facet) => {
          const values = facets[facet.facetKey];
          if (!values || values.length === 0) return null;
          const counts = optionCounts[facet.facetKey] ?? {};
          const selected = readSelected(facet.paramKey);
          return (
            <AccordionItem
              key={facet.facetKey}
              value={facet.facetKey}
              className="border-b border-border/40"
            >
              <AccordionTrigger className="py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:no-underline">
                <span className="flex items-center gap-2">
                  {facet.title}
                  {selected.size > 0 ? (
                    <span className="rounded-full bg-foreground/10 px-1.5 text-[10px] normal-case tracking-normal text-foreground">
                      {selected.size}
                    </span>
                  ) : null}
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <ul className="space-y-1.5 py-1">
                  {values.map((value) => (
                    <li key={value}>
                      <label className="flex cursor-pointer items-center gap-2 py-0.5 text-sm text-foreground">
                        <input
                          type="checkbox"
                          checked={selected.has(value)}
                          onChange={() => onToggle(facet.paramKey, value)}
                          className="h-3.5 w-3.5 rounded border-input accent-foreground"
                        />
                        <span className="flex-1 truncate">
                          {facet.renderLabel(value)}
                        </span>
                        <span className="tabular-nums text-xs text-muted-foreground">
                          {counts[value] ?? 0}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
