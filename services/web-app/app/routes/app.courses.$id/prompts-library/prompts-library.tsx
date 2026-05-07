import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '~/components/ui/accordion';
import { Badge } from '~/components/ui/badge';
import { Input } from '~/components/ui/input';
import {
  COGNITIVE_MOVE_LABEL,
  type CognitiveMove,
  FACET_KEYS,
  type FacetValues,
  type LibraryPrompt,
  PROMPT_TYPE_LABEL,
  type PromptSeriousness,
  type PromptType,
  SERIOUSNESS_LABEL,
} from './data';

type Props = {
  prompts: LibraryPrompt[];
  facets: FacetValues;
  totalCount: number;
  onSelectPrompt: (prompt: string) => void;
};

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'rounded-full border px-2.5 py-0.5 text-xs transition-colors ' +
        (active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-input bg-background text-foreground hover:bg-muted')
      }
    >
      {children}
    </button>
  );
}

function FacetRow<T extends string>({
  label,
  values,
  selected,
  onToggle,
  renderLabel,
}: {
  label: string;
  values: T[];
  selected: Set<string>;
  onToggle: (value: T) => void;
  renderLabel?: (value: T) => string;
}) {
  if (values.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="min-w-[110px] text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {values.map((v) => (
        <Chip key={v} active={selected.has(v)} onClick={() => onToggle(v)}>
          {renderLabel ? renderLabel(v) : v}
        </Chip>
      ))}
    </div>
  );
}

export function PromptsLibrary({
  prompts,
  facets,
  totalCount,
  onSelectPrompt,
}: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState(
    searchParams.get(FACET_KEYS.search) ?? ''
  );

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
          <div className="space-y-4 pt-2">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                commitSearch(searchInput);
              }}
              className="space-y-3 rounded-lg border bg-background p-3"
            >
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onBlur={() => commitSearch(searchInput)}
                placeholder="Search prompt text…"
                className="max-w-md"
              />
              <FacetRow
                label="Text / unit"
                values={facets.textsOrUnits}
                selected={readSelected(FACET_KEYS.textsOrUnits)}
                onToggle={(v) => toggleFacet(FACET_KEYS.textsOrUnits, v)}
              />
              <FacetRow
                label="Theme"
                values={facets.themes}
                selected={readSelected(FACET_KEYS.themes)}
                onToggle={(v) => toggleFacet(FACET_KEYS.themes, v)}
              />
              <FacetRow
                label="Cognitive move"
                values={facets.cognitiveMoves}
                renderLabel={(v) => COGNITIVE_MOVE_LABEL[v as CognitiveMove]}
                selected={readSelected(FACET_KEYS.cognitiveMoves)}
                onToggle={(v) => toggleFacet(FACET_KEYS.cognitiveMoves, v)}
              />
              <FacetRow
                label="Type"
                values={facets.types}
                renderLabel={(v) => PROMPT_TYPE_LABEL[v as PromptType]}
                selected={readSelected(FACET_KEYS.types)}
                onToggle={(v) => toggleFacet(FACET_KEYS.types, v)}
              />
              <FacetRow
                label="Seriousness"
                values={facets.seriousness}
                renderLabel={(v) => SERIOUSNESS_LABEL[v as PromptSeriousness]}
                selected={readSelected(FACET_KEYS.seriousness)}
                onToggle={(v) => toggleFacet(FACET_KEYS.seriousness, v)}
              />
              <FacetRow
                label="Grade band"
                values={facets.gradeBands}
                selected={readSelected(FACET_KEYS.gradeBands)}
                onToggle={(v) => toggleFacet(FACET_KEYS.gradeBands, v)}
              />
              {hasAnyFilter ? (
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                >
                  Clear all
                </button>
              ) : null}
            </form>

            {prompts.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No prompts match the current filters.
              </p>
            ) : (
              <ul className="divide-y rounded-lg border bg-background">
                {prompts.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => onSelectPrompt(p.prompt)}
                      className="flex w-full flex-col gap-1.5 px-3 py-2.5 text-left transition-colors hover:bg-muted/60"
                    >
                      <span className="text-sm text-foreground">
                        {p.prompt}
                      </span>
                      <span className="flex flex-wrap gap-1">
                        <Badge variant="outline" size="sm">
                          {PROMPT_TYPE_LABEL[p.type]}
                        </Badge>
                        <Badge variant="outline" size="sm">
                          {SERIOUSNESS_LABEL[p.seriousness]}
                        </Badge>
                        {p.themes.map((t) => (
                          <Badge
                            key={`th-${t}`}
                            variant="secondary"
                            size="sm"
                          >
                            {t}
                          </Badge>
                        ))}
                        {p.textsOrUnits.map((t) => (
                          <Badge
                            key={`tx-${t}`}
                            variant="secondary"
                            size="sm"
                          >
                            {t}
                          </Badge>
                        ))}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
