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
  AP_LIT_FACET_KEYS,
  type ApEnglishLitFacetValues,
  type ApEnglishLitLibraryEntry,
  type ApEnglishLitOptionCounts,
  frqTypeLabel,
  humanizeFacetValue,
} from './ap-english-lit-facets';

export type { ApEnglishLitLibraryEntry } from './ap-english-lit-facets';

type Props = {
  entries: ApEnglishLitLibraryEntry[];
  facets: ApEnglishLitFacetValues;
  optionCounts: ApEnglishLitOptionCounts;
  totalCount: number;
  onSelectEntry: (entry: ApEnglishLitLibraryEntry) => void;
};

type FacetSpec = {
  facetKey: keyof ApEnglishLitOptionCounts;
  paramKey: string;
  title: string;
  renderLabel: (value: string) => string;
};

const FACET_SECTIONS: FacetSpec[] = [
  {
    facetKey: 'frqTypes',
    paramKey: AP_LIT_FACET_KEYS.frqTypes,
    title: 'Question type',
    renderLabel: frqTypeLabel,
  },
  {
    facetKey: 'focusSkills',
    paramKey: AP_LIT_FACET_KEYS.focusSkills,
    title: 'Focus',
    renderLabel: humanizeFacetValue,
  },
  {
    facetKey: 'difficulties',
    paramKey: AP_LIT_FACET_KEYS.difficulties,
    title: 'Difficulty',
    renderLabel: humanizeFacetValue,
  },
  {
    facetKey: 'skillEmphases',
    paramKey: AP_LIT_FACET_KEYS.skillEmphases,
    title: 'Rubric emphasis',
    renderLabel: humanizeFacetValue,
  },
];

const ALL_PARAM_KEYS = Object.values(AP_LIT_FACET_KEYS);

export function ApEnglishLitLibrary({
  entries,
  facets,
  optionCounts,
  totalCount,
  onSelectEntry,
}: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState(
    searchParams.get(AP_LIT_FACET_KEYS.search) ?? '',
  );
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  useEffect(() => {
    setSearchInput(searchParams.get(AP_LIT_FACET_KEYS.search) ?? '');
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
    const next = new URLSearchParams(searchParams);
    const trimmed = value.trim();
    if (trimmed) next.set(AP_LIT_FACET_KEYS.search, trimmed);
    else next.delete(AP_LIT_FACET_KEYS.search);
    setSearchParams(next, { preventScrollReset: true });
  }

  function clearAll() {
    const next = new URLSearchParams(searchParams);
    ALL_PARAM_KEYS.forEach((k) => next.delete(k));
    setSearchParams(next, { preventScrollReset: true });
    setSearchInput('');
  }

  const hasAnyFilter = ALL_PARAM_KEYS.some((k) => searchParams.has(k));

  type ActiveChip = { paramKey: string; value: string; label: string };
  const activeChips = useMemo<ActiveChip[]>(() => {
    const out: ActiveChip[] = [];
    for (const f of FACET_SECTIONS) {
      const sel = searchParams.get(f.paramKey)?.split(',').filter(Boolean) ?? [];
      for (const v of sel) {
        out.push({ paramKey: f.paramKey, value: v, label: f.renderLabel(v) });
      }
    }
    const q = searchParams.get(AP_LIT_FACET_KEYS.search);
    if (q) {
      out.push({ paramKey: AP_LIT_FACET_KEYS.search, value: q, label: `“${q}”` });
    }
    return out;
  }, [searchParams]);

  function removeChip(chip: ActiveChip) {
    const next = new URLSearchParams(searchParams);
    if (chip.paramKey === AP_LIT_FACET_KEYS.search) {
      next.delete(AP_LIT_FACET_KEYS.search);
      setSearchInput('');
    } else {
      const current = new Set(
        next.get(chip.paramKey)?.split(',').filter(Boolean) ?? [],
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
      ? `${totalCount} prompts`
      : `${entries.length} of ${totalCount} prompts`;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">AP Literature Prompt Library</h2>
      </div>

      <div className="flex flex-col gap-6 pt-1 lg:flex-row">
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
                <SheetTitle>Filter prompts</SheetTitle>
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
              No prompts match the current filters.
            </p>
          ) : (
            <div className="grid gap-3">
              {entries.map((entry) => (
                <EntryCard
                  key={entry.externalKey}
                  entry={entry}
                  onSelect={() => onSelectEntry(entry)}
                />
              ))}
            </div>
          )}
        </main>
      </div>
    </section>
  );
}

function countSuggestedWorks(value: string | null): string[] {
  if (!value) return [];
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function EntryCard({
  entry,
  onSelect,
}: {
  entry: ApEnglishLitLibraryEntry;
  onSelect: () => void;
}) {
  const isOpenQuestion = entry.frqType === 'literary_argument';
  const works = countSuggestedWorks(entry.suggestedWorks);

  return (
    <div className="rounded-lg border bg-card p-4 text-card-foreground shadow-sm">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <h3 className="text-base font-semibold leading-snug">{entry.title}</h3>
          <Badge variant="secondary" size="sm" className="w-fit">
            {frqTypeLabel(entry.frqType)}
          </Badge>
        </div>

        <p className="whitespace-normal text-sm leading-6 text-muted-foreground">
          {entry.prompt}
        </p>

        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" size="sm">
            {humanizeFacetValue(entry.focusSkill)}
          </Badge>
          {entry.difficulty ? (
            <Badge variant="outline" size="sm">
              {humanizeFacetValue(entry.difficulty)}
            </Badge>
          ) : null}
          {entry.skillEmphasis ? (
            <Badge variant="outline" size="sm">
              {humanizeFacetValue(entry.skillEmphasis)}
            </Badge>
          ) : null}
        </div>

        {entry.sources.length > 0 ? (
          <details className="rounded-md border bg-muted/30 p-3">
            <summary className="cursor-pointer text-sm font-medium text-foreground marker:text-muted-foreground">
              View {entry.frqType === 'poetry' ? 'poem' : 'passage'}
            </summary>
            <div className="mt-2 grid gap-2">
              {entry.sources.map((source) => (
                <section
                  key={source.externalKey}
                  className="rounded-md border bg-white p-3"
                >
                  <h4 className="text-sm font-semibold">{source.title}</h4>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {source.attribution}
                  </p>
                  {source.caption ? (
                    <p className="mt-2 text-sm italic text-muted-foreground">
                      {source.caption}
                    </p>
                  ) : null}
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
                    {source.body}
                  </p>
                </section>
              ))}
            </div>
          </details>
        ) : works.length > 0 ? (
          <details className="rounded-md border bg-muted/30 p-3">
            <summary className="cursor-pointer text-sm font-medium text-foreground marker:text-muted-foreground">
              {works.length} suggested {works.length === 1 ? 'work' : 'works'}
            </summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6">
              {works.map((work) => (
                <li key={work}>{work}</li>
              ))}
            </ul>
          </details>
        ) : isOpenQuestion ? (
          <p className="text-xs text-muted-foreground">
            Students choose their own work of literary merit.
          </p>
        ) : null}

        <div className="flex justify-end">
          <Button type="button" size="sm" onClick={onSelect}>
            Use this prompt
          </Button>
        </div>
      </div>
    </div>
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
  facets: ApEnglishLitFacetValues;
  optionCounts: ApEnglishLitOptionCounts;
  readSelected: (key: string) => Set<string>;
  onToggle: (key: string, value: string) => void;
  hasAnyFilter: boolean;
  onClearAll: () => void;
  searchInput: string;
  onSearchInputChange: (v: string) => void;
  onSearchCommit: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="sticky top-0 z-10 -mx-1 bg-background/95 px-1 pb-2 pt-1 backdrop-blur">
        <Input
          value={searchInput}
          onChange={(e) => onSearchInputChange(e.target.value)}
          onBlur={onSearchCommit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onSearchCommit();
            }
          }}
          placeholder="Search prompts…"
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

      <Accordion type="multiple" className="border-none">
        {FACET_SECTIONS.map((f) => {
          const values = facets[f.facetKey];
          if (!values || values.length === 0) return null;
          const counts = optionCounts[f.facetKey] ?? {};
          const selected = readSelected(f.paramKey);
          return (
            <AccordionItem
              key={f.facetKey}
              value={f.facetKey}
              className="border-b border-border/40"
            >
              <AccordionTrigger className="py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:no-underline">
                <span className="flex items-center gap-2">
                  {f.title}
                  {selected.size > 0 ? (
                    <span className="rounded-full bg-foreground/10 px-1.5 text-[10px] normal-case tracking-normal text-foreground">
                      {selected.size}
                    </span>
                  ) : null}
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <ul className="space-y-1.5 py-1">
                  {values.map((v) => {
                    const checked = selected.has(v);
                    const count = counts[v] ?? 0;
                    return (
                      <li key={v}>
                        <label className="flex cursor-pointer items-center gap-2 py-0.5 text-sm text-foreground">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => onToggle(f.paramKey, v)}
                            className="h-3.5 w-3.5 rounded border-input accent-foreground"
                          />
                          <span className="flex-1 truncate">
                            {f.renderLabel(v)}
                          </span>
                          <span className="tabular-nums text-xs text-muted-foreground">
                            {count}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
