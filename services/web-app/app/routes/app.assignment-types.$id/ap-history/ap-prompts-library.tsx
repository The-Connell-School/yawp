import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { FilterIcon, XIcon, FileTextIcon } from 'lucide-react';
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
  type ApPrompt,
  AP_FACET_KEYS,
  ESSAY_TYPE_LABEL,
  COURSE_LABEL,
  COURSE_ORDER,
  REASONING_SKILL_LABEL,
  DIFFICULTY_LABEL,
  DIFFICULTY_ORDER,
  APUSH_PERIOD_LABEL,
} from './types';

type Props = {
  entries: ApPrompt[];
  onSelectEntry: (entry: ApPrompt) => void;
};

type FacetSpec = {
  paramKey: string;
  title: string;
  options: { value: string; label: string }[];
};

function buildFacetSpecs(prompts: ApPrompt[]): FacetSpec[] {
  const essayTypes = new Set<string>();
  const reasoningSkills = new Set<string>();

  for (const p of prompts) {
    essayTypes.add(p.essayType);
    reasoningSkills.add(p.reasoningSkill);
  }

  const specs: FacetSpec[] = [];

  // Course is a fixed taxonomy: always offer all three AP history courses so
  // teachers can filter for US History, Euro, and World even before the
  // Euro/World prompts are added.
  specs.push({
    paramKey: AP_FACET_KEYS.course,
    title: 'Course',
    options: COURSE_ORDER.map((v) => ({ value: v, label: COURSE_LABEL[v] ?? v })),
  });

  if (essayTypes.size > 1) {
    specs.push({
      paramKey: AP_FACET_KEYS.essayType,
      title: 'Essay type',
      options: [...essayTypes].map((v) => ({
        value: v,
        label: ESSAY_TYPE_LABEL[v] ?? v,
      })),
    });
  }

  if (reasoningSkills.size > 0) {
    specs.push({
      paramKey: AP_FACET_KEYS.reasoningSkill,
      title: 'Reasoning skill',
      options: [...reasoningSkills].map((v) => ({
        value: v,
        label: REASONING_SKILL_LABEL[v] ?? v,
      })),
    });
  }

  // Difficulty is a fixed taxonomy: always offer all three buckets in order.
  specs.push({
    paramKey: AP_FACET_KEYS.difficulty,
    title: 'Difficulty',
    options: DIFFICULTY_ORDER.map((v) => ({
      value: v,
      label: DIFFICULTY_LABEL[v] ?? v,
    })),
  });

  return specs;
}

function applyFilters(
  prompts: ApPrompt[],
  params: URLSearchParams
): ApPrompt[] {
  const readSet = (key: string) =>
    new Set(params.get(key)?.split(',').filter(Boolean) ?? []);

  const q = (params.get(AP_FACET_KEYS.search) ?? '').trim().toLowerCase();
  const course = readSet(AP_FACET_KEYS.course);
  const essayType = readSet(AP_FACET_KEYS.essayType);
  const reasoningSkill = readSet(AP_FACET_KEYS.reasoningSkill);
  const difficulty = readSet(AP_FACET_KEYS.difficulty);

  return prompts.filter((p) => {
    if (course.size && !course.has(p.course)) return false;
    if (essayType.size && !essayType.has(p.essayType)) return false;
    if (reasoningSkill.size && !reasoningSkill.has(p.reasoningSkill))
      return false;
    if (difficulty.size && (!p.difficulty || !difficulty.has(p.difficulty)))
      return false;
    if (
      q &&
      !`${p.title} ${p.prompt} ${p.period}`.toLowerCase().includes(q)
    ) {
      return false;
    }
    return true;
  });
}

export function ApPromptsLibrary({
  entries,
  onSelectEntry,
}: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState(
    searchParams.get(AP_FACET_KEYS.search) ?? ''
  );
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  const facetSpecs = useMemo(() => buildFacetSpecs(entries), [entries]);
  const filtered = useMemo(
    () => applyFilters(entries, searchParams),
    [entries, searchParams]
  );

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
    if (trimmed) next.set(AP_FACET_KEYS.search, trimmed);
    else next.delete(AP_FACET_KEYS.search);
    setSearchParams(next, { preventScrollReset: true });
  }

  function clearAll() {
    const next = new URLSearchParams(searchParams);
    Object.values(AP_FACET_KEYS).forEach((k) => next.delete(k));
    setSearchParams(next, { preventScrollReset: true });
    setSearchInput('');
  }

  const hasAnyFilter = Object.values(AP_FACET_KEYS).some((k) =>
    searchParams.has(k)
  );

  type ActiveChip = { paramKey: string; value: string; label: string };
  const activeChips = useMemo<ActiveChip[]>(() => {
    const out: ActiveChip[] = [];
    for (const f of facetSpecs) {
      const sel =
        searchParams.get(f.paramKey)?.split(',').filter(Boolean) ?? [];
      for (const v of sel) {
        const opt = f.options.find((o) => o.value === v);
        out.push({
          paramKey: f.paramKey,
          value: v,
          label: opt?.label ?? v,
        });
      }
    }
    const q = searchParams.get(AP_FACET_KEYS.search);
    if (q)
      out.push({
        paramKey: AP_FACET_KEYS.search,
        value: q,
        label: `"${q}"`,
      });
    return out;
  }, [searchParams, facetSpecs]);

  function removeChip(chip: ActiveChip) {
    const next = new URLSearchParams(searchParams);
    if (chip.paramKey === AP_FACET_KEYS.search) {
      next.delete(AP_FACET_KEYS.search);
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
    <div className="space-y-2">
      <div className="sticky top-0 z-10 -mx-1 bg-background/95 px-1 pb-2 pt-1 backdrop-blur">
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
          placeholder="Search prompts…"
          className="h-9"
        />
        {hasAnyFilter ? (
          <div className="mt-1.5 flex justify-end">
            <button
              type="button"
              onClick={clearAll}
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              Clear all
            </button>
          </div>
        ) : null}
      </div>

      <Accordion type="multiple" className="border-none">
        {facetSpecs.map((f) => {
          const selected = readSelected(f.paramKey);
          return (
            <AccordionItem
              key={f.paramKey}
              value={f.paramKey}
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
                  {f.options.map((opt) => (
                    <li key={opt.value}>
                      <label className="flex cursor-pointer items-center gap-2 py-0.5 text-sm text-foreground">
                        <input
                          type="checkbox"
                          checked={selected.has(opt.value)}
                          onChange={() => toggleFacet(f.paramKey, opt.value)}
                          className="h-3.5 w-3.5 rounded border-input accent-foreground"
                        />
                        <span className="flex-1 truncate">{opt.label}</span>
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

  const countLabel =
    filtered.length === entries.length
      ? `${entries.length} prompts`
      : `${filtered.length} of ${entries.length} prompts`;

  return (
    <div className="pb-6">
      <h3 className="mb-2 text-foreground/75">Prompt Library</h3>
      <div className="border-b" />
      <div className="flex flex-col gap-6 pt-4 lg:flex-row">
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

          {filtered.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No prompts match the current filters.
            </p>
          ) : (
            <ul className="divide-y divide-border/40">
              {filtered.map((p) => (
                <ApPromptRow
                  key={p.externalKey}
                  prompt={p}
                  onSelect={() => onSelectEntry(p)}
                />
              ))}
            </ul>
          )}
        </main>
      </div>
    </div>
  );
}

function ApPromptRow({
  prompt,
  onSelect,
}: {
  prompt: ApPrompt;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className="group/card block w-full cursor-pointer rounded-md py-5 text-left transition-colors hover:bg-foreground/[0.03] focus-visible:bg-foreground/[0.03] focus-visible:outline-none"
      >
        <div className="space-y-1 px-2">
          <h4 className="text-base font-semibold leading-snug text-foreground">
            {prompt.title}
          </h4>
          <p className="text-[17px] leading-relaxed text-foreground">
            {prompt.prompt}
          </p>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 px-2 text-xs text-muted-foreground">
          <span className="rounded bg-foreground/[0.06] px-1.5 py-0.5 font-medium">
            {ESSAY_TYPE_LABEL[prompt.essayType] ?? prompt.essayType}
          </span>
          {prompt.period || prompt.periodNumber ? (
            <>
              <span aria-hidden>·</span>
              <span>
                {prompt.course === 'apush'
                  ? (APUSH_PERIOD_LABEL[prompt.periodNumber] ??
                    `Period ${prompt.periodNumber}`)
                  : prompt.period}
              </span>
            </>
          ) : null}
          <>
            <span aria-hidden>·</span>
            <span>
              {REASONING_SKILL_LABEL[prompt.reasoningSkill] ??
                prompt.reasoningSkill}
            </span>
          </>
          {prompt.difficulty ? (
            <>
              <span aria-hidden>·</span>
              <span>
                {DIFFICULTY_LABEL[prompt.difficulty] ?? prompt.difficulty}
              </span>
            </>
          ) : null}
          {prompt.essayType === 'dbq' && prompt.sources.length > 0 ? (
            <>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1">
                <FileTextIcon className="h-3 w-3" />
                {prompt.sources.length} sources
              </span>
            </>
          ) : null}
        </div>
      </button>
    </li>
  );
}
