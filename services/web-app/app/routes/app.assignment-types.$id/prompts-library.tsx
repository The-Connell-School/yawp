// AP History Essay prompt library. Mirrors the Daily Pages library shape
// from PR #111: stacked accordion filter panel on the left (search + facets
// with checkbox + count), vertical list of prompt rows on the right with
// active-filter chips and a count summary at the top. Mobile collapses the
// filter panel into a left-side sheet behind a Filter button.
//
// Filter logic: AND across facets, OR within a facet (matching Daily Pages).
// Click a row → calls onSelectPrompt with the LibraryPrompt; the parent
// route opens the create-assignment sheet pre-populated from it.

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
  DIFFICULTY_LABEL,
  type Difficulty,
  type EssayType,
  type LibraryPrompt,
  type Period,
  type Reasoning,
  REASONING_LABEL,
} from './library-data';

const FACET_KEYS = {
  search: 'q',
  type: 'type',
  period: 'period',
  era: 'era',
  reasoning: 'reasoning',
  difficulty: 'difficulty',
} as const;

type FacetKey = 'type' | 'period' | 'era' | 'reasoning' | 'difficulty';

type FacetSpec = {
  key: FacetKey;
  paramKey: string;
  title: string;
  values: (prompts: LibraryPrompt[]) => string[];
  renderLabel?: (v: string) => string;
  valueOf: (p: LibraryPrompt) => string;
};

const FACETS: FacetSpec[] = [
  {
    key: 'type',
    paramKey: FACET_KEYS.type,
    title: 'Essay type',
    values: (ps) => unique(ps.map((p) => p.type)),
    valueOf: (p) => p.type,
  },
  {
    key: 'period',
    paramKey: FACET_KEYS.period,
    title: 'Period',
    values: (ps) => unique(ps.map((p) => p.period)),
    valueOf: (p) => p.period,
  },
  {
    key: 'era',
    paramKey: FACET_KEYS.era,
    title: 'Era',
    values: (ps) => unique(ps.map((p) => p.era)).sort(),
    valueOf: (p) => p.era,
  },
  {
    key: 'reasoning',
    paramKey: FACET_KEYS.reasoning,
    title: 'Reasoning',
    values: (ps) => unique(ps.map((p) => p.reasoning)),
    renderLabel: (v) => REASONING_LABEL[v as Reasoning],
    valueOf: (p) => p.reasoning,
  },
  {
    key: 'difficulty',
    paramKey: FACET_KEYS.difficulty,
    title: 'Difficulty',
    values: (ps) => ['intro', 'mid-year', 'exam-ready'],
    renderLabel: (v) => DIFFICULTY_LABEL[v as Difficulty],
    valueOf: (p) => p.difficulty,
  },
];

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export function PromptsLibrary({
  prompts,
  onSelectPrompt,
}: {
  prompts: LibraryPrompt[];
  onSelectPrompt: (prompt: LibraryPrompt) => void;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState(
    searchParams.get(FACET_KEYS.search) ?? ''
  );
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  useEffect(() => {
    setSearchInput(searchParams.get(FACET_KEYS.search) ?? '');
  }, [searchParams]);

  function readSelected(key: string): Set<string> {
    return new Set(
      searchParams.get(key)?.split(',').filter(Boolean) ?? []
    );
  }

  function toggleFacet(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    const current = new Set(
      next.get(key)?.split(',').filter(Boolean) ?? []
    );
    if (current.has(value)) current.delete(value);
    else current.add(value);
    if (current.size === 0) next.delete(key);
    else next.set(key, [...current].join(','));
    setSearchParams(next, { preventScrollReset: true });
  }

  function commitSearch(value: string) {
    const next = new URLSearchParams(searchParams);
    const trimmed = value.trim();
    if (trimmed) next.set(FACET_KEYS.search, trimmed);
    else next.delete(FACET_KEYS.search);
    setSearchParams(next, { preventScrollReset: true });
  }

  function clearAll() {
    const next = new URLSearchParams(searchParams);
    Object.values(FACET_KEYS).forEach((k) => next.delete(k));
    setSearchParams(next, { preventScrollReset: true });
    setSearchInput('');
  }

  const hasAnyFilter = Object.values(FACET_KEYS).some((k) =>
    searchParams.has(k)
  );

  const visiblePrompts = useMemo(() => {
    const q = (searchParams.get(FACET_KEYS.search) ?? '').trim().toLowerCase();
    return prompts.filter((p) => {
      for (const f of FACETS) {
        const sel = readSelected(f.paramKey);
        if (sel.size > 0 && !sel.has(f.valueOf(p))) return false;
      }
      if (q && !p.prompt.toLowerCase().includes(q)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompts, searchParams]);

  type ActiveChip = { paramKey: string; value: string; label: string };
  const activeChips = useMemo<ActiveChip[]>(() => {
    const out: ActiveChip[] = [];
    for (const f of FACETS) {
      const sel =
        searchParams.get(f.paramKey)?.split(',').filter(Boolean) ?? [];
      for (const v of sel) {
        out.push({
          paramKey: f.paramKey,
          value: v,
          label: f.renderLabel ? f.renderLabel(v) : v,
        });
      }
    }
    const q = searchParams.get(FACET_KEYS.search);
    if (q) {
      out.push({
        paramKey: FACET_KEYS.search,
        value: q,
        label: `“${q}”`,
      });
    }
    return out;
  }, [searchParams]);

  function removeChip(chip: ActiveChip) {
    const next = new URLSearchParams(searchParams);
    if (chip.paramKey === FACET_KEYS.search) {
      next.delete(FACET_KEYS.search);
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

  // Counts per option, computed against the *other* selected filters so the
  // counts on a facet reflect what would happen if that option were toggled.
  // Simple approximation: count against the full corpus pre-filter.
  const optionCounts = useMemo(() => {
    const counts: Record<FacetKey, Record<string, number>> = {
      type: {},
      period: {},
      era: {},
      reasoning: {},
      difficulty: {},
    };
    for (const p of prompts) {
      for (const f of FACETS) {
        const v = f.valueOf(p);
        counts[f.key][v] = (counts[f.key][v] ?? 0) + 1;
      }
    }
    return counts;
  }, [prompts]);

  const filterPanel = (
    <FilterPanel
      prompts={prompts}
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
    visiblePrompts.length === prompts.length
      ? `${prompts.length} prompts`
      : `${visiblePrompts.length} of ${prompts.length} prompts`;

  return (
    <Accordion type="single" collapsible>
      <AccordionItem value="library">
        <AccordionTrigger className="group py-2 text-base">
          Prompt Library
          <span className="ml-2 hidden text-sm text-muted-foreground group-data-[state=open]:inline">
            {prompts.length}
          </span>
        </AccordionTrigger>
        <AccordionContent>
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
                    <SheetTitle>Filter prompts</SheetTitle>
                  </SheetHeader>
                  <div className="mt-4">{filterPanel}</div>
                </SheetContent>
              </Sheet>
            </div>

            <main className="min-w-0 flex-1 lg:max-w-[760px]">
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

              {visiblePrompts.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  No prompts match the current filters.
                </p>
              ) : (
                <ul className="divide-y divide-border/40">
                  {visiblePrompts.map((p) => (
                    <PromptRow
                      key={p.id}
                      prompt={p}
                      onSelect={() => onSelectPrompt(p)}
                    />
                  ))}
                </ul>
              )}
            </main>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

function PromptRow({
  prompt,
  onSelect,
}: {
  prompt: LibraryPrompt;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className="block w-full cursor-pointer rounded-md py-5 text-left transition-colors hover:bg-foreground/[0.03] focus-visible:bg-foreground/[0.03] focus-visible:outline-none"
      >
        <div className="mb-2 flex items-center gap-2 px-2">
          <Badge
            variant={prompt.type === 'DBQ' ? 'default' : 'secondary'}
            size="sm"
          >
            {prompt.type}
          </Badge>
          <span className="text-xs text-muted-foreground">{prompt.period}</span>
          <span className="text-xs text-muted-foreground" aria-hidden>
            ·
          </span>
          <span className="text-xs text-muted-foreground">{prompt.era}</span>
          {prompt.sourceCount != null ? (
            <>
              <span className="text-xs text-muted-foreground" aria-hidden>
                ·
              </span>
              <span className="text-xs text-muted-foreground">
                {prompt.sourceCount} sources
              </span>
            </>
          ) : null}
        </div>
        <p className="px-2 text-[17px] leading-relaxed text-foreground">
          {prompt.prompt}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 px-2 text-xs text-muted-foreground/80">
          <span>{REASONING_LABEL[prompt.reasoning]}</span>
          <span aria-hidden>·</span>
          <span>{DIFFICULTY_LABEL[prompt.difficulty]}</span>
          {prompt.skillEmphasis.length > 0 ? (
            <>
              <span aria-hidden>·</span>
              <span>{prompt.skillEmphasis.join(', ')}</span>
            </>
          ) : null}
        </div>
      </button>
    </li>
  );
}

function FilterPanel({
  prompts,
  optionCounts,
  readSelected,
  onToggle,
  hasAnyFilter,
  onClearAll,
  searchInput,
  onSearchInputChange,
  onSearchCommit,
}: {
  prompts: LibraryPrompt[];
  optionCounts: Record<FacetKey, Record<string, number>>;
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
        {FACETS.map((f) => {
          const values = f.values(prompts);
          if (!values || values.length === 0) return null;
          const counts = optionCounts[f.key] ?? {};
          const selected = readSelected(f.paramKey);
          return (
            <AccordionItem
              key={f.key}
              value={f.key}
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
                    const label = f.renderLabel ? f.renderLabel(v) : v;
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
                          <span className="flex-1 truncate">{label}</span>
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
