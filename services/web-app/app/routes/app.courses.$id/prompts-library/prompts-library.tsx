import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { FilterIcon, XIcon } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '~/components/ui/accordion';
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
  COGNITIVE_MOVE_LABEL,
  type CognitiveMove,
  FACET_KEYS,
  type FacetValues,
  type LibraryPrompt,
  type OptionCounts,
  PROMPT_TYPE_LABEL,
  type PromptSeriousness,
  type PromptType,
  SERIOUSNESS_LABEL,
} from './data';

type Props = {
  prompts: LibraryPrompt[];
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
};

const FACET_SECTIONS: FacetSpec[] = [
  {
    facetKey: 'textsOrUnits',
    paramKey: FACET_KEYS.textsOrUnits,
    title: 'Text / unit',
  },
  { facetKey: 'themes', paramKey: FACET_KEYS.themes, title: 'Theme' },
  {
    facetKey: 'cognitiveMoves',
    paramKey: FACET_KEYS.cognitiveMoves,
    title: 'Cognitive move',
    renderLabel: (v) => COGNITIVE_MOVE_LABEL[v as CognitiveMove],
  },
  {
    facetKey: 'types',
    paramKey: FACET_KEYS.types,
    title: 'Type',
    renderLabel: (v) => PROMPT_TYPE_LABEL[v as PromptType],
  },
  {
    facetKey: 'gradeBands',
    paramKey: FACET_KEYS.gradeBands,
    title: 'Grade band',
    renderLabel: (v) => `Grade ${v}`,
  },
  {
    facetKey: 'seriousness',
    paramKey: FACET_KEYS.seriousness,
    title: 'Seriousness',
    renderLabel: (v) => SERIOUSNESS_LABEL[v as PromptSeriousness],
  },
];

export function PromptsLibrary({
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
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  return (
    <Accordion type="single" collapsible defaultValue="library">
      <AccordionItem value="library">
        <AccordionTrigger className="py-2 text-base">
          Prompts Library
          <span className="ml-2 text-xs text-muted-foreground">
            {prompts.length} of {totalCount}
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

            <main className="min-w-0 flex-1 lg:max-w-[720px]">
              {activeChips.length > 0 ? (
                <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border/40 pb-3 text-xs text-muted-foreground">
                  <span>{prompts.length} prompts</span>
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
                </div>
              ) : null}

              {prompts.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  No prompts match the current filters.
                </p>
              ) : (
                <ul className="divide-y divide-border/40">
                  {prompts.map((p) => (
                    <PromptRow
                      key={p.id}
                      prompt={p}
                      expanded={expandedId === p.id}
                      onToggleExpand={() =>
                        setExpandedId((id) => (id === p.id ? null : p.id))
                      }
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

function PromptRow({
  prompt,
  expanded,
  onToggleExpand,
  onSelect,
}: {
  prompt: LibraryPrompt;
  expanded: boolean;
  onToggleExpand: () => void;
  onSelect: () => void;
}) {
  const textOrUnit = prompt.textsOrUnits[0];
  const move = prompt.cognitiveMoves[0];

  return (
    <li className="group/card relative py-5">
      <button
        type="button"
        onClick={onToggleExpand}
        aria-expanded={expanded}
        className="block w-full cursor-text text-left text-[17px] leading-relaxed text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        {prompt.prompt}
      </button>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        {textOrUnit ? <span>{textOrUnit}</span> : null}
        {textOrUnit && move ? <span aria-hidden>·</span> : null}
        {move ? <span>{COGNITIVE_MOVE_LABEL[move]}</span> : null}
      </div>

      {expanded ? (
        <ExtraTags prompt={prompt} />
      ) : (
        <div className="hidden lg:group-hover/card:block lg:group-focus-within/card:block">
          <ExtraTags prompt={prompt} />
        </div>
      )}

      {expanded ? (
        <div className="mt-3">
          <UseButton onClick={onSelect} />
        </div>
      ) : (
        <div className="hidden lg:absolute lg:right-0 lg:top-5 lg:opacity-0 lg:transition-opacity lg:group-hover/card:block lg:group-hover/card:opacity-100 lg:group-focus-within/card:block lg:group-focus-within/card:opacity-100">
          <UseButton onClick={onSelect} />
        </div>
      )}
    </li>
  );
}

function ExtraTags({ prompt }: { prompt: LibraryPrompt }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground/80">
      <span>{PROMPT_TYPE_LABEL[prompt.type]}</span>
      <span aria-hidden>·</span>
      <span>{SERIOUSNESS_LABEL[prompt.seriousness]}</span>
      {prompt.themes.length > 0 ? (
        <>
          <span aria-hidden>·</span>
          <span>{prompt.themes.join(', ')}</span>
        </>
      ) : null}
      {prompt.gradeBands.length > 0 ? (
        <>
          <span aria-hidden>·</span>
          <span>Grades {prompt.gradeBands.join(', ')}</span>
        </>
      ) : null}
    </div>
  );
}

function UseButton({ onClick }: { onClick: () => void }) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick}>
      Use this prompt
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

      <Accordion
        type="multiple"
        defaultValue={['textsOrUnits']}
        className="border-none"
      >
        {FACET_SECTIONS.map((f) => {
          const values = facets[f.facetKey] as string[];
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
