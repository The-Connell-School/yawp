import { Search, X } from 'lucide-react';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';

export type ApHistoryLibraryEntry = {
  externalKey: string;
  title: string;
  prompt: string;
  essayType: string;
  period: string;
  periodNumber: number;
  reasoningSkill: string;
  difficulty: string | null;
  sources: Array<{
    externalKey?: string;
    position: number;
    title: string;
    attribution: string;
    body: string;
  }>;
};

type Props = {
  entries: ApHistoryLibraryEntry[];
  onSelectEntry: (entry: ApHistoryLibraryEntry) => void;
};

function label(value: string | null | undefined) {
  if (!value) return null;
  return value
    .split(/[\s_-]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function ApHistoryLibrary({ entries, onSelectEntry }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('apq') ?? '';
  const essayType = searchParams.get('apEssay') ?? 'all';
  const period = searchParams.get('apPeriod') ?? 'all';
  const skill = searchParams.get('apSkill') ?? 'all';

  const periods = useMemo(
    () =>
      Array.from(
        new Map(
          entries.map((entry) => [String(entry.periodNumber), entry.period])
        ).entries()
      ).sort(([a], [b]) => Number(a) - Number(b)),
    [entries]
  );
  const skills = useMemo(
    () =>
      Array.from(new Set(entries.map((entry) => entry.reasoningSkill))).sort(),
    [entries]
  );
  const filteredEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return entries.filter((entry) => {
      if (essayType !== 'all' && entry.essayType !== essayType) return false;
      if (period !== 'all' && String(entry.periodNumber) !== period)
        return false;
      if (skill !== 'all' && entry.reasoningSkill !== skill) return false;
      if (
        normalizedQuery &&
        !`${entry.title} ${entry.prompt} ${entry.period}`
          .toLowerCase()
          .includes(normalizedQuery)
      ) {
        return false;
      }
      return true;
    });
  }, [entries, essayType, period, query, skill]);

  function updateParam(key: string, value: string, defaultValue = 'all') {
    const next = new URLSearchParams(searchParams);
    if (!value || value === defaultValue) next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  }

  const hasFilters = Boolean(
    query || essayType !== 'all' || period !== 'all' || skill !== 'all'
  );

  return (
    <section className="space-y-4" aria-labelledby="apush-library-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="apush-library-heading" className="text-xl font-semibold">
            APUSH Prompt Library
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose a DBQ or LEQ, review its immutable source set, then assign
            it.
          </p>
        </div>
        <span className="text-sm text-muted-foreground" aria-live="polite">
          {filteredEntries.length} of {entries.length}
        </span>
      </div>

      <div className="grid gap-2 rounded-lg border bg-muted/20 p-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(event) => updateParam('apq', event.target.value, '')}
            placeholder="Search prompts"
            aria-label="Search APUSH prompts"
            className="pl-8"
          />
        </div>
        <Select
          value={essayType}
          onValueChange={(value) => updateParam('apEssay', value)}
        >
          <SelectTrigger aria-label="Filter by essay type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All essay types</SelectItem>
            <SelectItem value="dbq">DBQ</SelectItem>
            <SelectItem value="leq">LEQ</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={period}
          onValueChange={(value) => updateParam('apPeriod', value)}
        >
          <SelectTrigger aria-label="Filter by APUSH period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All periods</SelectItem>
            {periods.map(([number, periodLabel]) => (
              <SelectItem key={number} value={number}>
                {periodLabel}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={skill}
          onValueChange={(value) => updateParam('apSkill', value)}
        >
          <SelectTrigger aria-label="Filter by reasoning skill">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All reasoning skills</SelectItem>
            {skills.map((value) => (
              <SelectItem key={value} value={value}>
                {label(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasFilters ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="justify-self-start sm:col-span-2 lg:col-span-4"
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              for (const key of ['apq', 'apEssay', 'apPeriod', 'apSkill']) {
                next.delete(key);
              }
              setSearchParams(next, { replace: true });
            }}
          >
            <X className="h-4 w-4" /> Clear APUSH filters
          </Button>
        ) : null}
      </div>

      {entries.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
          No APUSH prompts have been published yet.
        </div>
      ) : filteredEntries.length === 0 ? (
        <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          No prompts match these filters.
        </div>
      ) : null}

      <div className="divide-y rounded-lg border bg-card">
        {filteredEntries.map((entry) => (
          <Button
            key={entry.externalKey}
            type="button"
            variant="unstyled"
            className="h-auto w-full rounded-none p-4 text-left text-card-foreground transition first:rounded-t-lg last:rounded-b-lg hover:bg-accent hover:text-accent-foreground"
            onClick={() => onSelectEntry(entry)}
            aria-label={entry.title}
          >
            <div className="flex w-full flex-col gap-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold leading-snug">
                    {entry.title}
                  </h3>
                  <p className="mt-1 whitespace-normal text-sm font-normal leading-6 text-muted-foreground">
                    {entry.prompt}
                  </p>
                </div>
                <Badge variant="secondary" size="sm" className="w-fit shrink-0">
                  {entry.essayType.toUpperCase()}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{entry.period}</span>
                <span>{label(entry.reasoningSkill)}</span>
                {label(entry.difficulty) ? (
                  <span>{label(entry.difficulty)}</span>
                ) : null}
                <span>
                  {entry.sources.length}{' '}
                  {entry.sources.length === 1 ? 'source' : 'sources'}
                </span>
              </div>
            </div>
          </Button>
        ))}
      </div>
    </section>
  );
}
