import { useMemo, useState } from 'react';
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
  type GradeBand,
  type LibraryPrompt,
  PROMPT_TYPE_LABEL,
  type PromptSeriousness,
  type PromptType,
  SEED_PROMPTS,
  SERIOUSNESS_LABEL,
  uniqueValues,
} from './data';

type FacetState = {
  textsOrUnits: Set<string>;
  themes: Set<string>;
  cognitiveMoves: Set<CognitiveMove>;
  types: Set<PromptType>;
  seriousness: Set<PromptSeriousness>;
  gradeBands: Set<GradeBand>;
};

function emptyFacets(): FacetState {
  return {
    textsOrUnits: new Set(),
    themes: new Set(),
    cognitiveMoves: new Set(),
    types: new Set(),
    seriousness: new Set(),
    gradeBands: new Set(),
  };
}

function toggle<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

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

function matches(prompt: LibraryPrompt, facets: FacetState, search: string) {
  if (
    facets.textsOrUnits.size > 0 &&
    !prompt.textsOrUnits.some((t) => facets.textsOrUnits.has(t))
  ) {
    return false;
  }
  if (
    facets.themes.size > 0 &&
    !prompt.themes.some((t) => facets.themes.has(t))
  ) {
    return false;
  }
  if (
    facets.cognitiveMoves.size > 0 &&
    !prompt.cognitiveMoves.some((m) => facets.cognitiveMoves.has(m))
  ) {
    return false;
  }
  if (facets.types.size > 0 && !facets.types.has(prompt.type)) return false;
  if (
    facets.seriousness.size > 0 &&
    !facets.seriousness.has(prompt.seriousness)
  ) {
    return false;
  }
  if (
    facets.gradeBands.size > 0 &&
    !prompt.gradeBands.some((g) => facets.gradeBands.has(g))
  ) {
    return false;
  }
  const q = search.trim().toLowerCase();
  if (q && !prompt.prompt.toLowerCase().includes(q)) return false;
  return true;
}

export function PromptsLibrary({
  onSelectPrompt,
}: {
  onSelectPrompt: (prompt: string) => void;
}) {
  const [facets, setFacets] = useState<FacetState>(emptyFacets);
  const [search, setSearch] = useState('');

  const allTexts = useMemo(
    () => uniqueValues(SEED_PROMPTS, (p) => p.textsOrUnits),
    []
  );
  const allThemes = useMemo(
    () => uniqueValues(SEED_PROMPTS, (p) => p.themes),
    []
  );
  const allMoves = useMemo(
    () => uniqueValues<CognitiveMove>(SEED_PROMPTS, (p) => p.cognitiveMoves),
    []
  );
  const allTypes = useMemo(
    () => uniqueValues<PromptType>(SEED_PROMPTS, (p) => [p.type]),
    []
  );
  const allSeriousness = useMemo(
    () =>
      uniqueValues<PromptSeriousness>(SEED_PROMPTS, (p) => [p.seriousness]),
    []
  );
  const allGradeBands = useMemo(
    () => uniqueValues<GradeBand>(SEED_PROMPTS, (p) => p.gradeBands),
    []
  );

  const filtered = useMemo(
    () => SEED_PROMPTS.filter((p) => matches(p, facets, search)),
    [facets, search]
  );

  const hasAnyFilter =
    search.trim().length > 0 ||
    facets.textsOrUnits.size > 0 ||
    facets.themes.size > 0 ||
    facets.cognitiveMoves.size > 0 ||
    facets.types.size > 0 ||
    facets.seriousness.size > 0 ||
    facets.gradeBands.size > 0;

  return (
    <Accordion type="single" collapsible defaultValue="library">
      <AccordionItem value="library">
        <AccordionTrigger className="py-2 text-base">
          Prompts Library
          <span className="ml-2 text-xs text-muted-foreground">
            {filtered.length} of {SEED_PROMPTS.length}
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <div className="space-y-4 pt-2">
            <div className="space-y-3 rounded-lg border bg-background p-3">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search prompt text…"
                className="max-w-md"
              />
              <FacetRow
                label="Text / unit"
                values={allTexts}
                selected={facets.textsOrUnits}
                onToggle={(v) =>
                  setFacets({ ...facets, textsOrUnits: toggle(facets.textsOrUnits, v) })
                }
              />
              <FacetRow
                label="Theme"
                values={allThemes}
                selected={facets.themes}
                onToggle={(v) =>
                  setFacets({ ...facets, themes: toggle(facets.themes, v) })
                }
              />
              <FacetRow
                label="Cognitive move"
                values={allMoves}
                renderLabel={(v) => COGNITIVE_MOVE_LABEL[v as CognitiveMove]}
                selected={facets.cognitiveMoves}
                onToggle={(v) =>
                  setFacets({
                    ...facets,
                    cognitiveMoves: toggle(facets.cognitiveMoves, v as CognitiveMove),
                  })
                }
              />
              <FacetRow
                label="Type"
                values={allTypes}
                renderLabel={(v) => PROMPT_TYPE_LABEL[v as PromptType]}
                selected={facets.types}
                onToggle={(v) =>
                  setFacets({ ...facets, types: toggle(facets.types, v as PromptType) })
                }
              />
              <FacetRow
                label="Seriousness"
                values={allSeriousness}
                renderLabel={(v) => SERIOUSNESS_LABEL[v as PromptSeriousness]}
                selected={facets.seriousness}
                onToggle={(v) =>
                  setFacets({
                    ...facets,
                    seriousness: toggle(facets.seriousness, v as PromptSeriousness),
                  })
                }
              />
              <FacetRow
                label="Grade band"
                values={allGradeBands}
                selected={facets.gradeBands}
                onToggle={(v) =>
                  setFacets({
                    ...facets,
                    gradeBands: toggle(facets.gradeBands, v as GradeBand),
                  })
                }
              />
              {hasAnyFilter ? (
                <button
                  type="button"
                  onClick={() => {
                    setFacets(emptyFacets());
                    setSearch('');
                  }}
                  className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                >
                  Clear all
                </button>
              ) : null}
            </div>

            {filtered.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No prompts match the current filters.
              </p>
            ) : (
              <ul className="divide-y rounded-lg border bg-background">
                {filtered.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => onSelectPrompt(p.prompt)}
                      className="flex w-full flex-col gap-1.5 px-3 py-2.5 text-left transition-colors hover:bg-muted/60"
                    >
                      <span className="text-sm text-foreground">{p.prompt}</span>
                      <span className="flex flex-wrap gap-1">
                        <Badge variant="outline" size="sm">
                          {PROMPT_TYPE_LABEL[p.type]}
                        </Badge>
                        <Badge variant="outline" size="sm">
                          {SERIOUSNESS_LABEL[p.seriousness]}
                        </Badge>
                        {p.themes.map((t) => (
                          <Badge key={`th-${t}`} variant="secondary" size="sm">
                            {t}
                          </Badge>
                        ))}
                        {p.textsOrUnits.map((t) => (
                          <Badge key={`tx-${t}`} variant="secondary" size="sm">
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

function FacetRow<T extends string>({
  label,
  values,
  selected,
  onToggle,
  renderLabel,
}: {
  label: string;
  values: T[];
  selected: Set<T>;
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
