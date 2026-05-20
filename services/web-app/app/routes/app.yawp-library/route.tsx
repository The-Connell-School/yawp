import {
  type LoaderFunctionArgs,
  data as dataResponse,
  Form,
  Link,
  useLoaderData,
  useSearchParams,
} from 'react-router';
import { useId } from 'react';
import { requireProfile, requireUserId } from '~/utils/auth.server';
import { isEssayExamplesEnabledForOrganization } from '~/utils/feature-flags.server';
import {
  listPublishedModelEssays,
  getModelEssayFacets,
  type ModelEssayFilters,
} from '~/domain/model-essays.server';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Button } from '~/components/ui/button';
import { Badge } from '~/components/ui/badge';
import { Input } from '~/components/ui/input';
import type { BreadcrumbHandle } from '~/utils/breadcrumb';

export const handle: BreadcrumbHandle = { breadcrumb: 'YAWP! Library' };

function parseListParam(searchParams: URLSearchParams, key: string): string[] {
  return searchParams.getAll(key).filter((v) => v.length > 0);
}

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);

  const enabled = await isEssayExamplesEnabledForOrganization(
    profile.organization?.id
  );
  if (!enabled) {
    throw new Response('Not Found', { status: 404 });
  }

  const url = new URL(request.url);
  const filters: ModelEssayFilters = {
    search: url.searchParams.get('q') ?? undefined,
    essayType: parseListParam(url.searchParams, 'essayType'),
    part: parseListParam(url.searchParams, 'part'),
    topicCategory: parseListParam(url.searchParams, 'topicCategory'),
    gradeLevel: parseListParam(url.searchParams, 'gradeLevel')
      .map((v) => Number.parseInt(v, 10))
      .filter((n) => Number.isFinite(n)),
  };

  const [essays, facets] = await Promise.all([
    listPublishedModelEssays(filters),
    getModelEssayFacets(),
  ]);

  return dataResponse({ essays, facets });
}

type ChipFacet = { value: string; count: number };

function FilterChips({
  paramKey,
  options,
  selected,
}: {
  paramKey: string;
  options: ChipFacet[];
  selected: Set<string>;
}) {
  const [searchParams] = useSearchParams();
  if (options.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const isOn = selected.has(opt.value);
        const next = new URLSearchParams(searchParams);
        next.delete(paramKey);
        const remaining = Array.from(selected).filter((v) => v !== opt.value);
        const newSelection = isOn ? remaining : [...remaining, opt.value];
        for (const v of newSelection) next.append(paramKey, v);
        return (
          <Link
            key={opt.value}
            to={{ search: `?${next.toString()}` }}
            preventScrollReset
            className="no-underline"
          >
            <Badge
              variant={isOn ? 'default' : 'secondary'}
              className="cursor-pointer hover:bg-foreground/15"
            >
              {opt.value}
              <span className="ml-1.5 opacity-60">{opt.count}</span>
            </Badge>
          </Link>
        );
      })}
    </div>
  );
}

export default function YawpLibraryRoute() {
  const { essays, facets } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const searchInputId = useId();

  const selected = {
    essayType: new Set(searchParams.getAll('essayType')),
    part: new Set(searchParams.getAll('part')),
    topicCategory: new Set(searchParams.getAll('topicCategory')),
    gradeLevel: new Set(searchParams.getAll('gradeLevel')),
  };

  const activeQuery = searchParams.get('q') ?? '';
  const anyFilterActive =
    activeQuery !== '' ||
    selected.essayType.size > 0 ||
    selected.part.size > 0 ||
    selected.topicCategory.size > 0 ||
    selected.gradeLevel.size > 0;

  return (
    <div className="flex flex-col gap-5 p-3 sm:p-5">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">YAWP! Library</h1>
        <p className="text-muted-foreground text-sm max-w-2xl">
          A growing collection of model essays put together by the YAWP!
          editors, showing what a strong essay can look like across different
          rhetorical moves and subjects.
        </p>
      </header>

      <Form method="get" className="flex flex-col gap-3" preventScrollReset>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <label htmlFor={searchInputId} className="sr-only">
            Search the YAWP! Library
          </label>
          <Input
            id={searchInputId}
            name="q"
            defaultValue={activeQuery}
            placeholder="Search by title, subject, or phrase…"
            className="sm:max-w-sm"
          />
          {/* Preserve active facet filters across search submits */}
          {Array.from(selected.essayType).map((v) => (
            <input key={`et-${v}`} type="hidden" name="essayType" value={v} />
          ))}
          {Array.from(selected.part).map((v) => (
            <input key={`pt-${v}`} type="hidden" name="part" value={v} />
          ))}
          {Array.from(selected.topicCategory).map((v) => (
            <input
              key={`tc-${v}`}
              type="hidden"
              name="topicCategory"
              value={v}
            />
          ))}
          {Array.from(selected.gradeLevel).map((v) => (
            <input key={`gl-${v}`} type="hidden" name="gradeLevel" value={v} />
          ))}
          <Button type="submit" variant="secondary" size="sm">
            Search
          </Button>
          {anyFilterActive ? (
            <Button asChild variant="ghost" size="sm">
              <Link to=".">Clear all</Link>
            </Button>
          ) : null}
        </div>
      </Form>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <FacetSection title="Rhetorical move" hint="Filter by essay type">
          <FilterChips
            paramKey="essayType"
            options={facets.essayType}
            selected={selected.essayType}
          />
        </FacetSection>
        <FacetSection title="Collection" hint="Filter by editorial part">
          <FilterChips
            paramKey="part"
            options={facets.part}
            selected={selected.part}
          />
        </FacetSection>
        <FacetSection title="Topic" hint="Filter by topic category">
          <FilterChips
            paramKey="topicCategory"
            options={facets.topicCategory}
            selected={selected.topicCategory}
          />
        </FacetSection>
        <FacetSection title="Grade level" hint="Filter by target grade">
          <FilterChips
            paramKey="gradeLevel"
            options={facets.gradeLevel}
            selected={selected.gradeLevel}
          />
        </FacetSection>
      </div>

      <div className="text-sm text-muted-foreground">
        {essays.length === 0
          ? 'No essays match these filters.'
          : `${essays.length} ${essays.length === 1 ? 'essay' : 'essays'}`}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {essays.map((essay) => (
          <Card key={essay.id} className="flex flex-col">
            <CardHeader className="pb-2">
              <div className="flex flex-wrap gap-1.5 mb-1">
                {essay.essayType ? (
                  <Badge variant="outline" className="text-xs">
                    {essay.essayType}
                  </Badge>
                ) : null}
                {essay.gradeLevel ? (
                  <Badge variant="outline" className="text-xs">
                    Grade {essay.gradeLevel}
                  </Badge>
                ) : null}
              </div>
              <CardTitle className="text-lg leading-snug">
                <Link
                  to={essay.id}
                  className="hover:underline underline-offset-4"
                >
                  {essay.title}
                </Link>
              </CardTitle>
              {essay.subtitle ? (
                <p className="text-sm text-muted-foreground italic leading-snug">
                  {essay.subtitle}
                </p>
              ) : null}
            </CardHeader>
            <CardContent className="flex-1 flex flex-col gap-3">
              <p className="text-sm text-muted-foreground line-clamp-5">
                {essay.bodyPreview}
              </p>
              <div className="mt-auto pt-2">
                <Button asChild variant="ghost" size="sm">
                  <Link to={essay.id}>Read essay →</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <footer className="pt-4 text-xs text-muted-foreground">
        Model essays — curated by the YAWP! editors.
      </footer>
    </div>
  );
}

function FacetSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-col">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </span>
        {hint ? (
          <span className="sr-only">{hint}</span>
        ) : null}
      </div>
      {children}
    </div>
  );
}
