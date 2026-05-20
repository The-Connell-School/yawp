import {
  type LoaderFunctionArgs,
  data as dataResponse,
  Link,
  useLoaderData,
} from 'react-router';
import { requireProfile, requireUserId } from '~/utils/auth.server';
import { isEssayExamplesEnabledForOrganization } from '~/utils/feature-flags.server';
import { getPublishedModelEssayById } from '~/domain/model-essays.server';
import { Button } from '~/components/ui/button';
import { Badge } from '~/components/ui/badge';
import { CaretLeftIcon } from '~/components/icons';
import type { BreadcrumbHandle } from '~/utils/breadcrumb';

export const handle: BreadcrumbHandle = { breadcrumb: 'Essay' };

export async function loader({ request, params }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);

  const enabled = await isEssayExamplesEnabledForOrganization(
    profile.organization?.id
  );
  if (!enabled) throw new Response('Not Found', { status: 404 });

  const id = params.id;
  if (!id) throw new Response('Not Found', { status: 404 });

  const essay = await getPublishedModelEssayById(id);
  if (!essay) throw new Response('Not Found', { status: 404 });

  return dataResponse({ essay });
}

export default function YawpLibraryEssayRoute() {
  const { essay } = useLoaderData<typeof loader>();
  const paragraphs = essay.body.split(/\n+/).filter((p) => p.trim().length > 0);

  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-6 p-3 sm:p-5">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/app/yawp-library">
            <CaretLeftIcon />
            YAWP! Library
          </Link>
        </Button>
      </div>

      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-1.5">
          {essay.essayType ? (
            <Badge variant="outline">{essay.essayType}</Badge>
          ) : null}
          {essay.part ? (
            <Badge variant="outline">{essay.part}</Badge>
          ) : null}
          {essay.gradeLevel ? (
            <Badge variant="outline">Grade {essay.gradeLevel}</Badge>
          ) : null}
        </div>
        <h1 className="text-3xl font-semibold tracking-tight leading-tight">
          {essay.title}
        </h1>
        {essay.subtitle ? (
          <p className="text-lg text-muted-foreground italic leading-snug">
            {essay.subtitle}
          </p>
        ) : null}
        <p className="text-xs uppercase tracking-wide text-muted-foreground pt-1">
          Model essay
        </p>
      </header>

      <div className="prose prose-neutral max-w-none text-base leading-relaxed">
        {paragraphs.map((p, i) => (
          <p key={i} className="mb-4">
            {p}
          </p>
        ))}
      </div>
    </article>
  );
}
