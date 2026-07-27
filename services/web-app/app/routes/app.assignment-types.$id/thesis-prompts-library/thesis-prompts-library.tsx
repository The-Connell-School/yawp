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
  CATEGORY_LABEL,
  COGNITIVE_MOVE_LABEL,
  COLLECTION_LABEL,
  FACET_KEYS,
  type FacetValues,
  type OptionCounts,
  SOURCE_NEED_LABEL,
  type ThesisCategory,
  type ThesisCognitiveMove,
  type ThesisCollection,
  type ThesisLibraryEntry,
  type ThesisSourceNeed,
} from './data';

type Props = {
  prompts: ThesisLibraryEntry[];
  facets: FacetValues;
  optionCounts: OptionCounts;
  totalCount: number;
  onSelectPrompt: (prompt: string) => void;
};

type FacetSpec = {
  facetKey: keyof OptionCounts;
  paramKey: string;
  title: string;
  renderLabel?: (v: string) => string;
  /** Hide the section until it offers a real choice. */
  minValues?: number;
};

const FACET_SECTIONS: FacetSpec[] = [
  {
    facetKey: 'collections',
    paramKey: FACET_KEYS.collections,
    title: 'Collection',
    renderLabel: (v) => COLLECTION_LABEL[v as ThesisCollection],
    // Only worth showing once the teacher has prompts of their own.
    minValues: 2,
  },
  {
    facetKey: 'categories',
    paramKey: FACET_KEYS.categories,
    title: 'Category',
    renderLabel: (v) => CATEGORY_LABEL[v as ThesisCategory],
  },
  { facetKey: 'subjects', paramKey: FACET_KEYS.subjects, title: 'Subject' },
  {
    facetKey: 'textsOrUnits',
    paramKey: FACET_KEYS.textsOrUnits,
    title: 'Text',
  },
  {
    facetKey: 'cognitiveMoves',
    paramKey: FACET_KEYS.cognitiveMoves,
    title: 'Cognitive mode',
    renderLabel: (v) => COGNITIVE_MOVE_LABEL[v as ThesisCognitiveMove],
  },
  {
    facetKey: 'sourceNeeds',
    paramKey: FACET_KEYS.sourceNeeds,
    title: 'Source text',
    renderLabel: (v) => SOURCE_NEED_LABEL[v as ThesisSourceNeed],
  },
  {
    facetKey: 'gradeBands',
    paramKey: FACET_KEYS.gradeBands,
    title: 'Grade band',
    renderLabel: (v) => `Grade ${v}`,
  },
];

export function ThesisPromptsLibrary({
  prompts,
  facets,
  optionCounts,
  totalCount,
  onSelectPrompt,
}: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState(
    searchParams.get(FACET_KEYS.search) ?? ''
  );
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  useEffect(() => {
    setSearchInput(searchParams.get(FACET_KEYS.search) ?? '');
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

  type ActiveChip = { paramKey: string; value: string; label: string };
  const activeChips = useMemo<ActiveChip[]>(() => {
    const out: ActiveChip[] = [];
    for (const f of FACET_SECTIONS) {
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
      out.push({ paramKey: FACET_KEYS.search, value: q, label: `“${q}”` });
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
    prompts.length === totalCount
      ? `${totalCount} prompts`
      : `${prompts.length} of ${totalCount} prompts`;

  return (
    <Accordion type="single" collapsible>
      <AccordionItem value="library">
        <AccordionTrigger className="py-2 text-base">
          Prompt Library
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

            <main className="min-w-0 flex-1 lg:max-w-[720px]">
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

              {prompts.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  No prompts match the current filters.
                </p>
              ) : (
                <ul className="flex min-w-0 flex-col gap-3">
                  {prompts.map((p) => (
                    <PromptCard
                      key={p.id}
                      prompt={p}
                      onSelect={() => onSelectPrompt(p.prompt)}
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

function PromptCard({
  prompt,
  onSelect,
}: {
  prompt: ThesisLibraryEntry;
  onSelect: () => void;
}) {
  const text = prompt.textsOrUnits[0];
  const move = prompt.cognitiveMoves[0];

  return (
    <li className="min-w-0">
      <button
        type="button"
        onClick={onSelect}
        className="block w-full min-w-0 cursor-pointer rounded-lg border bg-card p-4 text-left text-card-foreground shadow-sm transition hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex w-full min-w-0 flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <h3 className="min-w-0 break-words text-base font-semibold leading-snug">
              {prompt.title}
            </h3>
            <Badge variant="secondary" size="sm" className="w-fit shrink-0">
              {prompt.category
                ? CATEGORY_LABEL[prompt.category]
                : COLLECTION_LABEL[prompt.collection]}
            </Badge>
          </div>

          <p className="line-clamp-3 whitespace-normal break-words text-sm font-normal leading-6 text-muted-foreground">
            {prompt.prompt}
          </p>

          <div className="flex flex-wrap gap-2">
            {text ? (
              <Badge variant="outline" size="sm">
                {text}
              </Badge>
            ) : null}
            {prompt.subjects[0] ? (
              <Badge variant="outline" size="sm">
                {prompt.subjects[0]}
              </Badge>
            ) : null}
            {move ? (
              <Badge variant="outline" size="sm">
                {COGNITIVE_MOVE_LABEL[move]}
              </Badge>
            ) : null}
            {prompt.gradeBands.length > 0 ? (
              <Badge variant="outline" size="sm">
                Grades {prompt.gradeBands.join(', ')}
              </Badge>
            ) : null}
          </div>
        </div>
      </button>
    </li>
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
  facets: FacetValues;
  optionCounts: OptionCounts;
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
          const values = facets[f.facetKey] as string[];
          if (!values || values.length < (f.minValues ?? 1)) return null;
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
