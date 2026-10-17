import { Form, Link, redirect, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { GuidedTour, TourThisPageButton } from '~/components/guided-tour/guided-tour';
import { loadWaitingPreviewTours } from '~/domain/guided-tours/guided-tours.server';
import { LockKeyhole } from 'lucide-react';
import { requireUserId } from '~/utils/auth.server';
import { getMembershipId } from '~/cookies/membership-id.server';
import { getLockedPreviewApplication } from '~/domain/free-tier/locked-preview.server';
import { LOCKED_PREVIEW_MESSAGE } from '~/domain/free-tier/locked-preview';
import { FreeTierAuthCard, FreeTierButton, FreeTierSignOut } from '../free-tier/FreeTierAuthCard';
import { Input } from '~/components/ui/input';
import starters from '../app.assignment-types.$id/prompts-library/prompts.json';
import thesis from '../app.assignment-types.$id/thesis-prompts-library/prompts.json';
import { PREWRITING_RUBRIC } from '~/domain/assignment-types/prewriting-assignment-type';

const sections = {
  'class-starter': 'Class Starter',
  prewriting: 'Pre-writing',
  thesis: 'Thesis',
  'lesson-planner': 'Lesson Planner how-to',
} as const;

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const app = await getLockedPreviewApplication(userId, await getMembershipId(request));
  if (!app || !['SENT', 'MANUAL_REVIEW'].includes(app.status))
    throw redirect('/app/free-tier/pending');
  const url = new URL(request.url);
  const raw = url.searchParams.get('view') ?? 'class-starter';
  const view = Object.hasOwn(sections, raw) ? raw as keyof typeof sections : 'class-starter';
  const query = (url.searchParams.get('q') ?? '').trim().slice(0, 200);
  // Only the shipped public corpus. No foreign tenant IDs, saved prompts, class
  // rosters, assignments, tool calls, or usage reservations are read or created.
  const corpus = view === 'class-starter'
    ? starters.map(p => ({ id: p.id, title: p.prompt, prompt: p.prompt }))
    : view === 'thesis' ? thesis : [];
  const matches = corpus.filter(p =>
    !/\bAI\b/i.test(`${p.title} ${p.prompt}`) &&
    `${p.title} ${p.prompt}`.toLowerCase().includes(query.toLowerCase()));
  const page = Math.max(1, Math.min(Math.ceil(matches.length / 10) || 1, Number(url.searchParams.get('page')) || 1));
  return { guidedTours: await loadWaitingPreviewTours(userId, app, request), view, query, page, total: matches.length, entries: matches.slice((page - 1) * 10, page * 10) };
}

export default function LockedPreviewRoute() {
  const { guidedTours, view, query, page, total, entries } = useLoaderData<typeof loader>();
  return (
    <FreeTierAuthCard title="Look around while you wait" subtitle="Explore ways to augment learning in your classroom." icon={<LockKeyhole />} footer={<FreeTierSignOut />}>
      <p className="text-sm text-muted-foreground">{LOCKED_PREVIEW_MESSAGE}</p>
      <nav data-tour="preview-content-nav" aria-label="Preview content" className="flex flex-wrap gap-2">
        {Object.entries(sections).map(([key, label]) => (
          <Link key={key} to={`?view=${key}`} aria-current={view === key ? 'page' : undefined}
            className="rounded-md border px-3 py-2 text-sm aria-[current=page]:bg-muted">{label}</Link>
        ))}
      </nav>
      {guidedTours ? <TourThisPageButton navExpanded /> : null}
      <section data-tour="preview-content" className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">{sections[view]}</h2>
        {view === 'prewriting' ? (
          <>
            <p className="text-sm">Students explore a prompt, try ideas, and discover a specific focus for their own writing. Messy, exploratory writing is expected.</p>
            {PREWRITING_RUBRIC.categories.map(category => (
              <section key={category.key} className="rounded-md border p-4 text-sm">
                <h3 className="font-medium">{category.label}</h3><p>{category.description}</p>
              </section>
            ))}
          </>
        ) : view === 'lesson-planner' ? (
          <>
            <p className="text-sm">Plan around your learning goals, texts, and the time you have. Review and adapt each suggestion for your students. Your judgment guides the lesson.</p>
            <video controls preload="none" poster="/img/lesson-planner-guide/home.jpg" className="w-full rounded-md border" aria-label="Lesson Planner overview">
              <source src="/img/lesson-planner-guide/home.mp4" type="video/mp4" />
            </video>
            <p className="text-sm text-muted-foreground">Planning tools unlock after approval.</p>
          </>
        ) : (
          <>
            <Form method="get" className="flex flex-col gap-2">
              <input type="hidden" name="view" value={view} />
              <label htmlFor="preview-query" className="text-sm">Search prompts</label>
              <Input id="preview-query" name="q" defaultValue={query} key={view} />
              <FreeTierButton type="submit" variant="outline">Search</FreeTierButton>
            </Form>
            <p className="text-sm text-muted-foreground">{total} prompts</p>
            {entries.map(entry => (
              <details key={entry.id} className="rounded-md border p-3 text-sm">
                <summary className="cursor-pointer font-medium">{entry.title}</summary>
                <p className="mt-3 whitespace-pre-wrap">{entry.prompt}</p>
              </details>
            ))}
            <nav aria-label="Library pages" className="flex justify-between text-sm underline">
              {page > 1 ? <Link to={`?${new URLSearchParams({ view, q: query, page: String(page - 1) })}`}>Previous</Link> : <span />}
              {page * 10 < total ? <Link to={`?${new URLSearchParams({ view, q: query, page: String(page + 1) })}`}>Next</Link> : null}
            </nav>
          </>
        )}
      </section>
      <div data-tour="preview-locked-actions" className="flex flex-col gap-2" aria-label="Available after approval">
        {['Create assignment', 'Add students', 'Use Reporter', 'Use Lesson Planner'].map(label => (
          <FreeTierButton key={label} disabled variant="outline">{label}</FreeTierButton>
        ))}
      </div>
      <Link to="/app/free-tier/pending" className="text-center text-sm underline">Back to approval status</Link>
      {guidedTours ? <GuidedTour {...guidedTours} /> : null}
    </FreeTierAuthCard>
  );
}
