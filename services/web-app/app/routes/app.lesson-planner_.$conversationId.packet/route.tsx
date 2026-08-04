import { useEffect, useRef, useState } from 'react';
import {
  Link,
  redirect,
  useFetcher,
  useLoaderData,
  type LoaderFunctionArgs,
} from 'react-router';
import { ChevronLeft, Lightbulb, ListTree, Printer, Rows } from 'lucide-react';
import {
  KIND_LABEL,
  KindIcon,
  ResourceIndex,
  type ResourceFilter,
} from './resource-index';
import { Button } from '~/components/ui/button';
import { cn } from '~/utils/misc';
import { prisma } from '~/utils/db.server';
import { getLessonPlannerAccess } from '~/utils/lesson-planner/lesson-planner-access.server';
import { MarkdownContent } from '~/components/ai-chat/assistant-markdown';
import { SlideDeckCard } from '~/components/ai-chat/slide-deck-card';
import { readSlideDeck } from '~/domain/lesson-planner/slide-deck';
import { buildLessonPacket } from '~/domain/lesson-planner/lesson-packet';

export async function loader({ request, params }: LoaderFunctionArgs) {
  const access = await getLessonPlannerAccess(request);
  if (!access.allowed) throw redirect('/app');

  const conversation = await prisma.lessonPlanConversation.findFirst({
    where: {
      id: params.conversationId,
      membershipId: access.membership.id,
      deletedAt: null,
    },
    select: {
      id: true,
      title: true,
      packetTitle: true,
      originClassAssignment: {
        select: {
          class: { select: { title: true, grade: true, period: true } },
          assignment: { select: { title: true } },
        },
      },
      messages: {
        where: { keptAt: { not: null }, role: 'assistant' },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          content: true,
          keptAudience: true,
          keptTitle: true,
        },
      },
    },
  });
  if (!conversation) throw new Response('Not Found', { status: 404 });

  const klass = conversation.originClassAssignment?.class;
  const className = klass
    ? (klass.title ??
      (klass.grade && klass.period
        ? `${klass.grade} · Period ${klass.period}`
        : (klass.grade ?? null)))
    : null;

  return {
    conversationId: conversation.id,
    packet: buildLessonPacket({
      title: conversation.packetTitle ?? conversation.title,
      className,
      sections: conversation.messages,
    }),
    // Kept separate from the packet title so a blank field falls back rather
    // than saving the conversation title as an explicit name.
    packetTitleValue: conversation.packetTitle ?? '',
  };
}

export default function LessonPacketRoute() {
  const { conversationId, packet, packetTitleValue } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [view, setView] = useState<'full' | 'outline'>('full');
  const [filter, setFilter] = useState<ResourceFilter>('all');
  // When set, only this resource prints — a teacher wants the handout on its
  // own far more often than they want the whole packet.
  const [printOnly, setPrintOnly] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLElement>(null);

  // Print after the render that hides the other resources, then restore.
  useEffect(() => {
    if (!printOnly) return;
    window.print();
    setPrintOnly(null);
  }, [printOnly]);

  function jumpTo(anchor: string) {
    setView('full');
    // Wait for the full-plan view in case the outline was showing.
    requestAnimationFrame(() => {
      document
        .getElementById(anchor)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function renameSection(messageId: string, sectionTitle: string) {
    fetcher.submit(
      {
        intent: 'rename-section',
        conversationId,
        messageId,
        sectionTitle,
      },
      { method: 'post', action: '/api/domain/lesson-planner/packet' }
    );
  }

  const visibleSections =
    filter === 'all'
      ? packet.sections
      : packet.sections.filter((section) => section.kind === filter);

  const printedOn = new Date().toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    // The app shell is a fixed-height, overflow-hidden frame, so every route
    // owns its own scrolling. The scrollbar is left visible here on purpose: a
    // long packet should look scrollable. Print resets both so the document
    // paginates instead of being clipped to one viewport.
    <section
      ref={scrollerRef}
      data-testid="packet-scroll"
      className="h-full w-full overflow-y-auto print:h-auto print:overflow-visible"
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-6 print:max-w-none print:px-0 print:py-0">
        {/* Controls — never printed. */}
        <div className="mb-6 flex flex-wrap items-center gap-2 print:hidden">
          <Button variant="outline" size="sm" asChild>
            <Link to={`/app/lesson-planner?c=${conversationId}`}>
              <ChevronLeft size={16} className="mr-1" />
              Back to planning
            </Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/app/lesson-planner/library">Lesson library</Link>
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <div className="flex rounded-lg border p-0.5">
              <button
                type="button"
                onClick={() => setView('full')}
                aria-pressed={view === 'full'}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium text-muted-foreground',
                  { 'bg-primary/10 text-primary': view === 'full' }
                )}
              >
                <Rows size={14} />
                Full plan
              </button>
              <button
                type="button"
                onClick={() => setView('outline')}
                aria-pressed={view === 'outline'}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium text-muted-foreground',
                  { 'bg-primary/10 text-primary': view === 'outline' }
                )}
              >
                <ListTree size={14} />
                Outline
              </button>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setFilter('all');
                setPrintOnly(null);
                requestAnimationFrame(() => window.print());
              }}
              disabled={packet.sections.length === 0}
            >
              <Printer size={15} className="mr-1.5" />
              Print / Save as PDF
            </Button>
          </div>
        </div>

        <div className="mb-4 print:hidden">
          <label
            htmlFor="packet-title"
            className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            Lesson name
          </label>
          <input
            id="packet-title"
            name="packetTitle"
            defaultValue={packetTitleValue}
            placeholder={packet.title}
            maxLength={120}
            className="w-full rounded-lg border bg-background px-3 py-2 text-base font-medium"
            onBlur={(event) =>
              fetcher.submit(
                {
                  intent: 'rename',
                  conversationId,
                  packetTitle: event.target.value,
                },
                { method: 'post', action: '/api/domain/lesson-planner/packet' }
              )
            }
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] print:block">
          {packet.sections.length > 0 ? (
            <aside className="lg:sticky lg:top-6 lg:self-start print:hidden">
              <ResourceIndex
                entries={packet.outline}
                filter={filter}
                onFilter={setFilter}
                onJump={jumpTo}
              />
            </aside>
          ) : null}

          {/* The document. */}
          <article className="rounded-2xl border bg-card p-8 print:rounded-none print:border-0 print:bg-transparent print:p-0">
            <header className="mb-6 border-b-2 border-primary pb-3">
              <div className="flex items-baseline gap-2">
                <Lightbulb size={18} className="shrink-0 text-primary" />
                <h1 className="text-xl font-semibold leading-tight">
                  {packet.title}
                </h1>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {[
                  packet.className,
                  packet.totalMinutes > 0 ? `${packet.totalMinutes} min` : null,
                  printedOn,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </header>

            {packet.sections.length === 0 ? (
              <p className="text-sm text-muted-foreground print:hidden">
                Nothing kept yet. Back in the planner, use{' '}
                <strong>Keep for the lesson</strong> on the parts you want, and
                they will assemble here.
              </p>
            ) : view === 'outline' ? (
              <ol
                className="flex flex-col gap-3"
                data-testid="packet-outline"
                data-print-mode="outline"
              >
                {packet.outline.map((entry, index) => (
                  <li key={index} className="flex gap-3">
                    <span className="w-14 shrink-0 pt-0.5 text-sm tabular-nums text-muted-foreground">
                      {entry.minutes !== null ? `${entry.minutes} min` : '—'}
                    </span>
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => jumpTo(entry.anchor)}
                        className="text-left font-medium hover:text-primary hover:underline print:no-underline"
                      >
                        {entry.title}
                      </button>
                      {entry.steps.length > 0 ? (
                        <ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground">
                          {entry.steps.map((step) => (
                            <li key={step}>{step}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="flex flex-col gap-8">
                {visibleSections.map((section) => (
                  <section
                    key={section.id}
                    id={section.anchor}
                    data-testid={`packet-section-${section.audience}`}
                    data-kind={section.kind}
                    className={cn(
                      'scroll-mt-6',
                      section.audience === 'student' &&
                        'rounded-xl border border-dashed p-5 print:break-before-page print:rounded-none print:border-0 print:p-0',
                      // Printing one resource hides the rest.
                      printOnly && printOnly !== section.id && 'print:hidden'
                    )}
                  >
                    {section.audience === 'student' ? (
                      <div className="mb-4 flex items-end justify-between gap-6 border-b pb-2 text-sm text-muted-foreground">
                        <span className="flex-1">
                          Name ______________________
                        </span>
                        <span>Date ____________</span>
                      </div>
                    ) : null}
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-foreground/5 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground print:hidden">
                        <KindIcon kind={section.kind} size={11} />
                        {KIND_LABEL[section.kind]}
                      </span>
                      <h2 className="min-w-0 flex-1 text-base font-semibold">
                        <input
                          aria-label={`Name for ${section.title}`}
                          defaultValue={section.title}
                          maxLength={120}
                          onBlur={(event) =>
                            renameSection(section.id, event.target.value)
                          }
                          className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 font-semibold hover:border-border focus:border-border focus:outline-none print:border-0 print:px-0"
                        />
                      </h2>
                      <button
                        type="button"
                        onClick={() => setPrintOnly(section.id)}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground print:hidden"
                      >
                        <Printer size={13} />
                        Print this
                      </button>
                    </div>
                    <SectionContent
                      section={section}
                      conversationId={conversationId}
                    />
                  </section>
                ))}
              </div>
            )}
          </article>
        </div>
      </div>
    </section>
  );
}

/**
 * A saved resource's body. A deck renders as a deck with a way to present it;
 * everything else is Markdown, with handouts spaced for writing.
 */
function SectionContent({
  section,
  conversationId,
}: {
  section: { id: string; content: string; audience: 'teacher' | 'student' };
  conversationId: string;
}) {
  const deckOutcome = readSlideDeck(section.content);
  const body = deckOutcome.kind === 'none' ? section.content : deckOutcome.body;

  return (
    <div
      className={cn(
        section.audience === 'student' && 'leading-9 print:leading-[2.6]'
      )}
    >
      {body ? <MarkdownContent content={body} /> : null}
      {deckOutcome.kind === 'deck' ? (
        <div className={cn(body && 'mt-3')}>
          <SlideDeckCard
            deck={deckOutcome.deck}
            presentHref={`/present/${conversationId}/${section.id}`}
          />
        </div>
      ) : null}
      {deckOutcome.kind === 'unreadable' ? (
        <p className={cn('text-sm text-muted-foreground', body && 'mt-3')}>
          That deck didn’t come through cleanly — ask the planner to rebuild it.
        </p>
      ) : null}
    </div>
  );
}
