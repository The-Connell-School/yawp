import { useEffect, useState } from 'react';
import { useFetcher, useSearchParams } from 'react-router';
import {
  Bookmark,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Filter,
  Search,
  X,
} from 'lucide-react';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '~/components/ui/popover';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetDescription,
} from '~/components/ui/sheet';
import { paginationItems } from '../thesis-prompts-library/pagination';
import {
  collectionPage,
  libraryAdapter,
  optionLabel,
  type Corpus,
  type FacetSpec,
  type LibraryData,
  type PromptEntry,
} from './library-adapter';

export function PromptLibraryV2({
  corpus,
  library,
  assignmentTypeId,
  savedPromptTexts,
  onAssign,
  canAssign,
}: {
  corpus: Corpus;
  library: LibraryData;
  assignmentTypeId: string;
  savedPromptTexts: string[];
  onAssign: (prompt: string) => void;
  canAssign: boolean;
}) {
  const adapter = libraryAdapter(corpus);
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get(adapter.searchParam) ?? '');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const collection =
    params.get(adapter.collectionParam) === 'mine' ? 'mine' : 'library';
  const paging = collectionPage(
    library.prompts,
    collection,
    params.get('promptPage')
  );
  const selected = (key: string) =>
    params.get(key)?.split(',').filter(Boolean) ?? [];
  const chips = adapter.facets.flatMap((f) =>
    selected(f.param).map((value) => ({ ...f, value }))
  );
  const filtered = chips.length > 0 || Boolean(params.get(adapter.searchParam));
  useEffect(() => {
    setSearch(params.get(adapter.searchParam) ?? '');
  }, [params, adapter.searchParam]);
  useEffect(() => {
    if (
      !params.has('promptPage') ||
      params.get('promptPage') === String(paging.page)
    )
      return;
    const next = new URLSearchParams(params);
    next.set('promptPage', String(paging.page));
    setParams(next, { preventScrollReset: true, replace: true });
  }, [paging.page, params, setParams]);
  function update(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('promptPage');
    setParams(next, { preventScrollReset: true });
  }
  function toggle(facet: FacetSpec, value: string) {
    const values = new Set(selected(facet.param));
    if (values.has(value)) values.delete(value);
    else values.add(value);
    update(facet.param, [...values].join(','));
  }
  function clear() {
    const next = new URLSearchParams(params);
    for (const f of adapter.facets) next.delete(f.param);
    next.delete(adapter.searchParam);
    next.delete('promptPage');
    setSearch('');
    setParams(next, { preventScrollReset: true });
  }
  function go(page: number) {
    const next = new URLSearchParams(params);
    next.set('promptPage', String(page));
    setParams(next, { preventScrollReset: true });
  }
  function options(facet: FacetSpec) {
    return (
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-semibold lg:sr-only">
          {facet.label}
        </legend>
        {(library.facets[facet.key] ?? []).map((value) => (
          <label
            key={value}
            className="flex cursor-pointer items-center gap-2 text-sm"
          >
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={selected(facet.param).includes(value)}
              onChange={() => toggle(facet, value)}
            />
            <span className="min-w-0 flex-1">
              {facet.key === 'gradeBands'
                ? `Grade ${value}`
                : optionLabel(value)}
            </span>
            <span className="text-xs text-muted-foreground">
              {library.optionCounts[facet.key]?.[value] ?? 0}
            </span>
          </label>
        ))}
      </fieldset>
    );
  }
  return (
    <section
      id="prompt-library"
      data-tour="type-library"
      className="scroll-mt-5 space-y-4"
    >
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <h2 className="text-xl font-bold">Prompt library</h2>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">
            Pick a prompt to open New assignment with it filled in. You can edit
            the wording there.
          </p>
        </div>
        <div
          role="tablist"
          aria-label="Prompt collection"
          className="flex shrink-0 rounded-full bg-secondary p-1"
        >
          {(['library', 'mine'] as const).map((value) => (
            <button
              type="button"
              role="tab"
              aria-selected={collection === value}
              key={value}
              onClick={() => update(adapter.collectionParam, value)}
              className={`flex-1 whitespace-nowrap rounded-full px-3 py-1.5 text-xs ${collection === value ? 'bg-popover font-medium shadow-sm ring-1 ring-border' : 'text-muted-foreground'}`}
            >
              {value === 'library' ? 'Library' : 'My prompts'}{' '}
              <span className="ml-1 text-muted-foreground">
                {library.optionCounts.collections[value] ?? 0}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <form
          className="relative min-w-0 flex-1 lg:flex-none"
          onSubmit={(event) => {
            event.preventDefault();
            update(adapter.searchParam, search.trim());
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            aria-label="Search prompts"
            id="type-prompt-search"
            placeholder="Search prompts"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="!h-9 !rounded-full !bg-popover !pl-9 text-sm lg:w-[220px]"
          />
        </form>
        <div className="hidden flex-wrap gap-2 lg:contents">
          {adapter.facets.map((facet) => (
            <Popover key={facet.key}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 rounded-full bg-popover text-xs"
                  aria-label={facet.label}
                >
                  {facet.label}
                  {selected(facet.param).length > 0 && (
                    <Badge variant="secondary" className="ml-1 px-1.5">
                      {selected(facet.param).length}
                    </Badge>
                  )}
                  <ChevronDown className="ml-1 h-3 w-3" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="max-h-80 overflow-y-auto border-border"
              >
                {options(facet)}
              </PopoverContent>
            </Popover>
          ))}
        </div>
        <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-9 rounded-full bg-popover lg:hidden"
            >
              <Filter className="mr-1 h-4 w-4" />
              Filter
              {chips.length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {chips.length}
                </Badge>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent className="overflow-y-auto border-border bg-popover">
            <SheetHeader>
              <SheetTitle>Filter prompts</SheetTitle>
              <SheetDescription>
                Choose the prompts that fit your class.
              </SheetDescription>
            </SheetHeader>
            <div className="mt-6 space-y-6">
              {adapter.facets.map((facet) => (
                <div key={facet.key}>{options(facet)}</div>
              ))}
              <Button variant="outline" onClick={clear}>
                Clear all
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
      {filtered && (
        <div className="flex flex-wrap items-center gap-2">
          {params.get(adapter.searchParam) && (
            <button
              type="button"
              className="flex items-center gap-1 rounded-full bg-secondary px-2 py-1 text-xs"
              onClick={() => update(adapter.searchParam, '')}
            >
              {params.get(adapter.searchParam)}
              <X className="h-3 w-3" />
              <span className="sr-only">Remove search</span>
            </button>
          )}
          {chips.map((chip) => (
            <button
              type="button"
              key={`${chip.key}:${chip.value}`}
              onClick={() => toggle(chip, chip.value)}
              className="flex items-center gap-1 rounded-full bg-secondary px-2 py-1 text-xs"
              aria-label={`Remove ${optionLabel(chip.value)} filter`}
            >
              {optionLabel(chip.value)}
              <X className="h-3 w-3" />
            </button>
          ))}
          <button
            type="button"
            onClick={clear}
            className="text-xs text-primary"
          >
            Clear all
          </button>
        </div>
      )}
      {paging.total === 0 ? (
        <div className="rounded-lg border border-border bg-popover p-8 text-center text-sm text-muted-foreground">
          {collection === 'mine' && !filtered ? (
            'Saved and used prompts show up here. Save a prompt from the library to get started.'
          ) : (
            <>
              <p>No prompts match these filters.</p>
              <button
                type="button"
                className="mt-2 text-primary"
                onClick={clear}
              >
                Clear all
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
          {paging.items.map((entry) => (
            <PromptCard
              key={`${entry.collection}:${entry.id}`}
              entry={entry}
              corpus={corpus}
              assignmentTypeId={assignmentTypeId}
              saved={
                entry.collection === 'mine' ||
                savedPromptTexts.some(
                  (text) => text.trim() === entry.prompt.trim()
                )
              }
              onAssign={onAssign}
              canAssign={canAssign}
            />
          ))}
        </div>
      )}
      {paging.total > 0 && (
        <div className="flex items-center justify-between gap-2 pt-1 text-xs text-muted-foreground">
          <span className="hidden lg:block">
            Showing {paging.start}–{paging.end} of {paging.total}
          </span>
          <nav
            aria-label="Prompt library pagination"
            className="hidden items-center gap-1 lg:flex"
          >
            <Button
              size="icon-sm"
              variant="outline"
              className="rounded-full"
              disabled={paging.page === 1}
              aria-label="Previous page"
              onClick={() => go(paging.page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {paginationItems(paging.page, paging.pageCount).map((item, i) =>
              item === 'ellipsis' ? (
                <span key={`ellipsis${i}`} className="px-1" aria-hidden="true">
                  …
                </span>
              ) : (
                <Button
                  key={item}
                  size="icon-sm"
                  variant={item === paging.page ? 'default' : 'ghost'}
                  className="rounded-full"
                  aria-label={`Page ${item}`}
                  aria-current={item === paging.page ? 'page' : undefined}
                  onClick={() => go(item)}
                >
                  {item}
                </Button>
              )
            )}
            <Button
              size="icon-sm"
              variant="outline"
              className="rounded-full"
              disabled={paging.page === paging.pageCount}
              aria-label="Next page"
              onClick={() => go(paging.page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </nav>
          <nav
            aria-label="Prompt library pagination"
            className="flex w-full items-center justify-center gap-5 lg:hidden"
          >
            <Button
              variant="ghost"
              size="sm"
              disabled={paging.page === 1}
              onClick={() => go(paging.page - 1)}
            >
              Previous
            </Button>
            <span>
              Page {paging.page} of {paging.pageCount}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={paging.page === paging.pageCount}
              onClick={() => go(paging.page + 1)}
            >
              Next
            </Button>
          </nav>
        </div>
      )}
    </section>
  );
}

function PromptCard({
  entry,
  corpus,
  assignmentTypeId,
  saved,
  onAssign,
  canAssign,
}: {
  entry: PromptEntry;
  corpus: Corpus;
  assignmentTypeId: string;
  saved: boolean;
  onAssign: (prompt: string) => void;
  canAssign: boolean;
}) {
  const fetcher = useFetcher<{ success?: boolean; message?: string }>();
  const adapter = libraryAdapter(corpus);
  const card = adapter.card(entry);
  const isSaved = saved || fetcher.data?.success === true;
  return (
    <article className="flex min-w-0 flex-col rounded-xl border border-border bg-popover p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="min-w-0 text-sm font-semibold leading-5">
          {card.title}
        </h3>
        <Badge
          variant="secondary"
          className="max-w-[44%] shrink-0 px-2 py-0.5 text-[10px] font-normal leading-4"
        >
          {card.badge}
        </Badge>
      </div>
      <p
        data-prompt={entry.prompt}
        className="line-clamp-3 text-sm leading-5 text-foreground/85"
      >
        {entry.prompt}
      </p>
      <div className="mt-auto flex items-end gap-2 pt-3">
        <p className="min-w-0 flex-1 text-xs leading-4 text-muted-foreground">
          <span className="hidden lg:inline">{card.meta}</span>
          <span className="lg:hidden">{card.mobileMeta}</span>
        </p>
        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0"
          aria-label={isSaved ? 'Saved to My prompts' : 'Save to My prompts'}
          disabled={isSaved || fetcher.state !== 'idle'}
          onClick={() =>
            fetcher.submit(
              {
                assignmentTypeId,
                prompt: entry.prompt,
                ...adapter.saveFields(entry),
              },
              { method: 'post', action: adapter.saveAction }
            )
          }
        >
          <Bookmark
            className={`h-4 w-4 ${isSaved ? 'fill-primary text-primary' : ''}`}
          />
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 shrink-0 rounded-full px-3 text-xs"
          disabled={!canAssign}
          onClick={() => onAssign(entry.prompt)}
        >
          Assign
        </Button>
      </div>
      {fetcher.data?.success === false && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {fetcher.data.message ?? 'Could not save this prompt.'}
        </p>
      )}
    </article>
  );
}
