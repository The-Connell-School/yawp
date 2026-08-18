import { useEffect, useRef, useState } from 'react';
import {
  Link,
  useFetcher,
  useLoaderData,
  type LoaderFunctionArgs,
} from 'react-router';
import {
  ChevronLeft,
  FileDown,
  FileText,
  Lightbulb,
  ListTree,
  Rows,
  BookMarked,
  PenLine,
  X,
} from 'lucide-react';
import {
  KIND_LABEL,
  KindIcon,
  ResourceIndex,
  type ResourceFilter,
} from './resource-index';
import { Button } from '~/components/ui/button';
import { cn } from '~/utils/misc';
import { MarkdownContent } from '~/components/ai-chat/assistant-markdown';
import { SlideDeckCard } from '~/components/ai-chat/slide-deck-card';
import type { SlideDeck } from '~/domain/lesson-planner/slide-deck';
import { buildStudentHandout } from '~/domain/lesson-planner/student-handout';
import { loadLessonPacket } from '~/domain/lesson-planner/load-lesson-packet.server';
import {
  MATERIAL_KIND_LABELS,
  type LessonMaterial,
} from '~/domain/lesson-planner/lesson-material';

export async function loader({ request, params }: LoaderFunctionArgs) {
  return loadLessonPacket({
    request,
    conversationId: params.conversationId,
  });
}

export default function LessonPacketRoute() {
  const { conversationId, packet, packetTitleValue, published } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [view, setView] = useState<'full' | 'outline' | 'handout'>('full');
  // Pieces the teacher does not want in students' hands this time. Nothing is
  // deleted — the handout is a reading of the packet, so it stays current.
  const [excluded, setExcluded] = useState<string[]>([]);
  const [filter, setFilter] = useState<ResourceFilter>('all');
  const scrollerRef = useRef<HTMLElement>(null);
  // A material being hand-edited, by section id. Only one at a time — editing
  // a second piece mid-edit is not a case worth the state to support.
  const [editingId, setEditingId] = useState<string | null>(null);

  // Answer the click straight away; waiting on the round trip reads as a
  // button that did not work.
  const pendingPublish = fetcher.formData?.get('intent');
  const isPublished =
    pendingPublish === 'publish' || pendingPublish === 'unpublish'
      ? pendingPublish === 'publish'
      : published;

  /**
   * The file behind every print control on this page.
   *
   * It mirrors what is on screen: on the handout view it is the handout,
   * carrying the pieces the teacher has left out of it, and a single resource
   * asks for itself. Printing the page itself gave the teacher a screenshot of
   * a web app — margins, chrome, and all — so both controls hand over the
   * typeset document instead and let the PDF reader do the printing.
   */
  function pdfHref(sectionId?: string) {
    const params = new URLSearchParams();
    if (sectionId) params.set('section', sectionId);
    else if (view === 'handout') {
      params.set('view', 'handout');
      if (excluded.length) params.set('exclude', excluded.join(','));
    }
    const query = params.toString();
    return `/app/lesson-planner/${conversationId}/packet.pdf${
      query ? `?${query}` : ''
    }`;
  }

  /**
   * One handout piece on its own, kept separate rather than folded into the
   * combined handout. Distinct from `pdfHref(sectionId)`: a piece can be
   * material nested inside a kept reply, which has no section id of its own.
   */
  function handoutPieceHref(pieceId: string) {
    const params = new URLSearchParams({ piece: pieceId });
    return `/app/lesson-planner/${conversationId}/packet.pdf?${params}`;
  }

  function jumpTo(anchor: string) {
    setView('full');
    // Wait for the full-plan view in case the outline was showing.
    requestAnimationFrame(() => {
      document
        .getElementById(anchor)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function renameSection(
    section: { id: string; origin: 'reply' | 'material' },
    sectionTitle: string
  ) {
    fetcher.submit(
      section.origin === 'material'
        ? {
            intent: 'rename-material',
            conversationId,
            materialId: section.id,
            sectionTitle,
          }
        : {
            intent: 'rename-section',
            conversationId,
            messageId: section.id,
            sectionTitle,
          },
      { method: 'post', action: '/api/domain/lesson-planner/packet' }
    );
  }

  const visibleSections =
    filter === 'all'
      ? packet.sections
      : packet.sections.filter((section) => section.kind === filter);

  // Every student-facing piece, and the subset actually going in the handout.
  const allHandoutParts = buildStudentHandout({ packet }).parts;
  const handout = buildStudentHandout({ packet, excluded });

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
            <Link to="/app/lesson-planner/library">All your lessons</Link>
          </Button>
          {/* The moment a teacher knows a lesson is finished is the moment
              they are looking at the finished thing. */}
          <Button
            type="button"
            variant={isPublished ? 'default' : 'outline'}
            size="sm"
            data-testid="packet-publish"
            aria-pressed={isPublished}
            onClick={() =>
              fetcher.submit(
                {
                  intent: isPublished ? 'unpublish' : 'publish',
                  conversationId,
                },
                { method: 'post', action: '/api/domain/lesson-planner/packet' }
              )
            }
          >
            <BookMarked size={15} className="mr-1.5" />
            {isPublished ? 'In your library' : 'Publish to my library'}
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
              <button
                type="button"
                onClick={() => setView('handout')}
                aria-pressed={view === 'handout'}
                disabled={allHandoutParts.length === 0}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium text-muted-foreground disabled:opacity-40',
                  { 'bg-primary/10 text-primary': view === 'handout' }
                )}
              >
                <FileText size={14} />
                Student handout
              </button>
            </div>
            <Button type="button" size="sm" asChild>
              <a
                data-testid="packet-save-pdf"
                href={pdfHref()}
                download
                aria-disabled={packet.sections.length === 0}
              >
                <FileDown size={15} className="mr-1.5" />
                Print / Save as PDF
              </a>
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
                Nothing in this stack yet. Back in the planner, use{' '}
                <strong>Add to stack</strong> on the pieces you want, and they
                will assemble here.
              </p>
            ) : view === 'handout' ? (
              <div data-testid="student-handout">
                {/* One heading line for the whole packet, not one per page.
                    Section as well as name: a teacher with five periods gets
                    back five piles of the same worksheet, and without it the
                    only way to sort them is to know every student by sight. */}
                <div className="mb-6 flex items-end justify-between gap-6 border-b pb-2 text-sm text-muted-foreground">
                  <span className="flex-1">Name ______________________</span>
                  <span>Section __________</span>
                  <span>Date ____________</span>
                </div>
                {handout.parts.length === 0 ? (
                  <p className="text-sm text-muted-foreground print:hidden">
                    Every piece is switched off. Turn one back on below.
                  </p>
                ) : null}
                {handout.parts.map((part) => (
                  <section
                    key={part.id}
                    data-testid="handout-part"
                    className="mb-8 leading-9 last:mb-0 print:break-inside-avoid print:leading-[2.6]"
                  >
                    <h2 className="mb-3 text-base font-semibold leading-normal">
                      <span className="mr-2 text-muted-foreground">
                        Part {part.number}.
                      </span>
                      {part.title}
                    </h2>
                    <MarkdownContent content={part.content} />
                  </section>
                ))}

                {/* Which pieces go in — never printed. */}
                <div className="mt-8 border-t pt-4 print:hidden">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    What goes in this handout
                  </p>
                  <p className="mb-2 text-xs text-muted-foreground">
                    Check what belongs in the one combined handout below, or
                    download any piece on its own instead.
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {allHandoutParts.map((part) => {
                      const isIn = !excluded.includes(part.id);
                      return (
                        <div
                          key={part.id}
                          className="flex items-center justify-between gap-2"
                        >
                          <label className="flex cursor-pointer items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={isIn}
                              onChange={() =>
                                setExcluded((prev) =>
                                  isIn
                                    ? [...prev, part.id]
                                    : prev.filter((id) => id !== part.id)
                                )
                              }
                              className="h-4 w-4 rounded border-border"
                            />
                            {part.title}
                          </label>
                          <a
                            href={handoutPieceHref(part.id)}
                            download
                            data-testid="handout-piece-pdf"
                            aria-label={`Download ${part.title} as its own PDF`}
                            className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
                          >
                            <FileDown size={12} />
                            Download alone
                          </a>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
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
                    data-testid="packet-section"
                    data-audience={section.audience}
                    data-kind={section.kind}
                    className={cn(
                      'scroll-mt-6',
                      section.audience === 'student' &&
                        'rounded-xl border border-dashed p-5 print:break-before-page print:rounded-none print:border-0 print:p-0'
                      // Printing one resource hides the rest.
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
                      {section.edited ? (
                        <span
                          data-testid="material-edited-badge"
                          className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary print:hidden"
                        >
                          <PenLine size={11} />
                          Edited
                        </span>
                      ) : null}
                      <h2 className="min-w-0 flex-1 text-base font-semibold">
                        <input
                          aria-label={`Name for ${section.title}`}
                          defaultValue={section.title}
                          maxLength={120}
                          onBlur={(event) =>
                            renameSection(section, event.target.value)
                          }
                          className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 font-semibold hover:border-border focus:border-border focus:outline-none print:border-0 print:px-0"
                        />
                      </h2>
                      {/* Only a filed material has its own content to edit — a
                          kept reply is a turn of the conversation, not one
                          artifact with a place to save an edit back to. */}
                      {section.origin === 'material' &&
                      editingId !== section.id ? (
                        <button
                          type="button"
                          onClick={() => setEditingId(section.id)}
                          data-testid="material-edit-start"
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground print:hidden"
                        >
                          <PenLine size={13} />
                          Edit
                        </button>
                      ) : null}
                      <a
                        href={pdfHref(section.id)}
                        download
                        data-testid="section-save-pdf"
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground print:hidden"
                      >
                        <FileDown size={13} />
                        Save this as PDF
                      </a>
                    </div>
                    {editingId === section.id ? (
                      <MaterialEditor
                        materialId={section.id}
                        conversationId={conversationId}
                        content={section.content}
                        onDone={() => setEditingId(null)}
                      />
                    ) : (
                      <SectionContent
                        section={section}
                        conversationId={conversationId}
                      />
                    )}
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
  section: {
    id: string;
    content: string;
    audience: 'teacher' | 'student';
    materials: LessonMaterial[];
    deck: SlideDeck | null;
    deckFailed: boolean;
  };
  conversationId: string;
}) {
  // The packet already took the deck out of the prose and parsed it, so there
  // is nothing left to pull apart here.
  const body = section.content;

  return (
    <div
      className={cn(
        section.audience === 'student' && 'leading-9 print:leading-[2.6]'
      )}
    >
      {body ? <MarkdownContent content={body} /> : null}
      {section.deck ? (
        <div className={cn(body && 'mt-3')}>
          <SlideDeckCard
            deck={section.deck}
            presentHref={`/present/${conversationId}/${section.id}`}
            downloadHref={`/present/${conversationId}/${section.id}.pptx`}
          />
        </div>
      ) : null}
      {section.deckFailed ? (
        <p className={cn('text-sm text-muted-foreground', body && 'mt-3')}>
          This deck didn’t build. Ask the planner to rebuild it, shorter.
        </p>
      ) : null}
      {/* Material the teacher kept as part of the whole reply rather than
          filing on its own. It prints here, as material — each on its own page
          so it can still be handed out. */}
      {section.materials.map((material) => (
        <div
          key={material.key}
          className="mt-6 border-t pt-4 print:break-before-page print:border-t-0 print:pt-0"
        >
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {MATERIAL_KIND_LABELS[material.kind]}
          </p>
          <h3 className="mb-2 text-base font-semibold">{material.title}</h3>
          {material.audience === 'student' ? (
            <div className="mb-4 flex items-end justify-between gap-6 border-b pb-2 text-sm text-muted-foreground">
              <span className="flex-1">Name ______________________</span>
              <span>Date ____________</span>
            </div>
          ) : null}
          <div
            className={cn(
              material.audience === 'student' && 'leading-9 print:leading-[2.6]'
            )}
          >
            <MarkdownContent content={material.content} />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Editing a filed material's own words, in place, in the stack.
 *
 * A plain textarea over the Markdown, not a rich editor: the same content
 * feeds the packet page, the PDF, and the pptx exporter, all of which parse
 * this Markdown directly, and a rich editor round-trips through its own model
 * on the way there. One source of truth stays one source of truth.
 *
 * Saving here is what forks the material out of the model's control — the
 * server marks it edited, and a later "Add to stack" over the same slot has
 * to ask before it can replace what got typed here.
 */
function MaterialEditor({
  materialId,
  conversationId,
  content,
  onDone,
}: {
  materialId: string;
  conversationId: string;
  content: string;
  onDone: () => void;
}) {
  const fetcher = useFetcher();
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const [draft, setDraft] = useState(content);
  const saving = fetcher.state !== 'idle';
  const error =
    fetcher.state === 'idle' &&
    fetcher.data &&
    typeof fetcher.data === 'object' &&
    'error' in (fetcher.data as Record<string, unknown>)
      ? String((fetcher.data as Record<string, unknown>).error)
      : null;

  // Leave edit mode the moment the save actually lands — not on submit, so an
  // error keeps the draft on screen instead of quietly discarding it.
  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data && !error) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);

  function save() {
    fetcher.submit(
      {
        intent: 'edit-material',
        conversationId,
        materialId,
        content: draft,
      },
      { method: 'post', action: '/api/domain/lesson-planner/packet' }
    );
  }

  return (
    <div
      data-testid="material-editor"
      className="rounded-lg border bg-foreground/[0.02] p-3"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex rounded-md border bg-background p-0.5">
          {(['write', 'preview'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setTab(option)}
              aria-pressed={tab === option}
              data-testid={`material-editor-tab-${option}`}
              className={cn(
                'rounded px-2.5 py-1 text-xs font-medium capitalize text-muted-foreground transition',
                tab === option && 'bg-primary/10 text-primary'
              )}
            >
              {option}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onDone}
          aria-label="Cancel editing"
          className="rounded-md p-1 text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
        >
          <X size={14} />
        </button>
      </div>

      {tab === 'write' ? (
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          aria-label="Edit material"
          data-testid="material-editor-textarea"
          rows={12}
          spellCheck
          className="w-full resize-y rounded-md border bg-background p-4 text-[15px] leading-7 focus:border-primary focus:outline-none"
        />
      ) : (
        <div className="rounded-md border bg-background p-3">
          <MarkdownContent content={draft} />
        </div>
      )}

      {error ? (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {error === 'edited'
            ? 'Something changed before this saved. Try again.'
            : 'That did not save. Try again.'}
        </p>
      ) : null}

      <div className="mt-2 flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onDone} type="button">
          Cancel
        </Button>
        <Button
          size="sm"
          type="button"
          onClick={save}
          disabled={saving || draft.trim().length === 0}
          data-testid="material-editor-save"
        >
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
