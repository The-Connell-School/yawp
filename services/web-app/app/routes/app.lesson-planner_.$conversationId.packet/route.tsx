import { useEffect, useRef, useState } from 'react';
import {
  Link,
  useFetcher,
  useLoaderData,
  useRevalidator,
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
  Trash2,
} from 'lucide-react';
import {
  KIND_LABEL,
  KindIcon,
  ResourceIndex,
  type ResourceFilter,
} from './resource-index';
import { MaterialRichEditor } from './material-rich-editor';
import {
  StackList,
  type StackListItem,
} from '~/components/lesson-planner/stack-list';
import {
  StackUndoToast,
  useStackRemoval,
} from '~/components/lesson-planner/use-stack-removal';
import { stackEntryKey } from '~/domain/lesson-planner/stack-order';
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
  const {
    conversationId,
    packet,
    packetTitleValue,
    published,
    nameIsProvisional,
    reviewFlags,
    stackDetails,
    periodMinutes,
  } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const revalidator = useRevalidator();
  const stackV2 = reviewFlags.stackV2;

  // Removing a piece from the stack, right here (Brian's review, B2), with an
  // Undo rather than a dialog. Shared with the stack panel beside the chat.
  const {
    hiddenIds,
    undoable,
    remove: removeSection,
    undo: undoRemoval,
  } = useStackRemoval({
    conversationId,
    onCommitted: () => revalidator.revalidate(),
  });
  // The teacher's order while it is on its way to the server (Brian's run 2,
  // A1). The loader's own order takes over again once it has caught up.
  const reorderFetcher = useFetcher();
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);
  const loadedOrder = packet.sections
    .map((section) => stackEntryKey(section))
    .join('|');
  useEffect(() => {
    setLocalOrder(null);
  }, [loadedOrder]);
  function reorderStack(keys: string[]) {
    setLocalOrder(keys);
    reorderFetcher.submit(
      { intent: 'reorder', conversationId, order: keys.join(',') },
      { method: 'post', action: '/api/domain/lesson-planner/packet' }
    );
  }
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

  /** The stacked lesson packet — every filed resource, not the tab on screen. */
  function fullPacketPdfHref() {
    return `/app/lesson-planner/${conversationId}/packet.pdf`;
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

  const orderedSections = localOrder
    ? [...packet.sections].sort(
        (a, b) =>
          localOrder.indexOf(stackEntryKey(a)) -
          localOrder.indexOf(stackEntryKey(b))
      )
    : packet.sections;
  const shownSections = orderedSections.filter(
    (section) => !hiddenIds.includes(section.id)
  );
  // Brian's run 2 (A2): no filters under stack v2; the stack is one list.
  const visibleSections =
    stackV2 || filter === 'all'
      ? shownSections
      : shownSections.filter((section) => section.kind === filter);
  const minutesByAnchor = new Map(
    packet.outline.map((entry) => [entry.anchor, entry.minutes])
  );
  const stackItems: StackListItem[] = shownSections.map((section) => ({
    key: stackEntryKey(section),
    id: section.id,
    origin: section.origin,
    title: section.title,
    kind: section.kind,
    label: stackDetails[section.id]?.label,
    minutes: minutesByAnchor.get(section.anchor) ?? null,
  }));

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
                {stackV2 ? 'Create handouts' : 'Student handout'}
              </button>
            </div>
            <Button type="button" size="sm" asChild>
              <a
                data-testid="packet-save-pdf"
                href={view === 'handout' ? pdfHref() : fullPacketPdfHref()}
                download
                aria-disabled={packet.sections.length === 0}
              >
                <FileDown size={15} className="mr-1.5" />
                Download PDF
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
            placeholder={
              stackV2 && nameIsProvisional ? 'Name this lesson' : packet.title
            }
            aria-describedby={
              stackV2 && nameIsProvisional ? 'packet-title-help' : undefined
            }
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
          {stackV2 && nameIsProvisional ? (
            <p
              id="packet-title-help"
              className="mt-1 text-xs text-muted-foreground"
            >
              We'll name it from your plan, or type one.
            </p>
          ) : null}
        </div>

        <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] print:block">
          {packet.sections.length > 0 ? (
            <aside className="lg:sticky lg:top-6 lg:self-start print:hidden">
              {stackV2 ? (
                <nav aria-label="Lesson contents">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Your stack
                  </p>
                  <p className="mb-2 text-xs text-muted-foreground">
                    Drag to put the lesson in order. Changes save themselves.
                  </p>
                  <StackList
                    items={stackItems}
                    onReorder={reorderStack}
                    onRemove={removeSection}
                    onJump={(item) => jumpTo(`resource-${item.id}`)}
                  />
                  <BuildFromStack
                    conversationId={conversationId}
                    lessonPlanHref={fullPacketPdfHref()}
                    hasDeck={packet.sections.some(
                      (section) => section.deck || section.kind === 'slides'
                    )}
                  />
                </nav>
              ) : (
                <ResourceIndex
                  entries={packet.outline}
                  filter={filter}
                  onFilter={setFilter}
                  onJump={jumpTo}
                />
              )}
            </aside>
          ) : null}

          {/* The document. */}
          <article className="rounded-2xl border bg-card p-8 print:rounded-none print:border-0 print:bg-transparent print:p-0">
            <header className="mb-6 border-b-2 border-primary pb-3">
              <div className="flex items-baseline gap-2">
                <Lightbulb size={18} className="shrink-0 text-primary" />
                <h1 className="text-xl font-semibold leading-tight">
                  {stackV2 && nameIsProvisional
                    ? 'Untitled lesson'
                    : packet.title}
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
              {stackV2 && periodMinutes ? (
                // Brian's run 2 (B2): the stack says when the lesson runs long.
                <p
                  data-testid="stack-time"
                  className={cn(
                    'mt-1 text-sm print:hidden',
                    packet.totalMinutes > periodMinutes
                      ? 'font-medium text-amber-700 dark:text-amber-300'
                      : 'text-muted-foreground'
                  )}
                >
                  {packet.totalMinutes > periodMinutes
                    ? `Planned ${packet.totalMinutes} min for a ${periodMinutes}-minute period: ${packet.totalMinutes - periodMinutes} over. Remove or shorten a piece to fit.`
                    : `Period: ${periodMinutes} min`}
                </p>
              ) : null}
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
                  {stackV2 ? (
                    <MakeUpLink conversationId={conversationId} />
                  ) : null}
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
                        {/* "Class Starter", not "Handout" (Brian's run 2). */}
                        {stackDetails[section.id]?.label ??
                          KIND_LABEL[section.kind]}
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
                      {/* Never a deck: its slides are not prose, and the text
                          box saving over them is what wiped one (Brian's run
                          2). The deck card's own Edit opens the deck editor. */}
                      {section.origin === 'material' &&
                      section.kind !== 'slides' &&
                      !section.deck &&
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
                      {stackV2 && section.origin === 'reply' ? (
                        // Brian's run 2 (E3): a lesson kept whole the old
                        // way becomes its steps and framings, each its own.
                        <button
                          type="button"
                          data-testid="section-split"
                          onClick={() =>
                            fetcher.submit(
                              { intent: 'split-kept', conversationId, messageId: section.id },
                              { method: 'post', action: '/api/domain/lesson-planner/packet' }
                            )
                          }
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground print:hidden"
                        >
                          <Rows size={13} />
                          Split into pieces
                        </button>
                      ) : null}
                      {stackDetails[section.id]?.create ? (
                        <Link
                          to={stackDetails[section.id]!.create!.href}
                          data-testid="stack-create-assignment"
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary transition hover:bg-primary/15 print:hidden"
                        >
                          <PenLine size={13} />
                          {stackDetails[section.id]!.create!.label}
                        </Link>
                      ) : null}
                      {stackV2 ? (
                        <button
                          type="button"
                          onClick={() => removeSection(section)}
                          data-testid="section-remove"
                          aria-label={`Remove ${section.title} from the stack`}
                          title="Remove from stack"
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive print:hidden"
                        >
                          <Trash2 size={13} />
                          Remove
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
                      <MaterialRichEditor
                        materialId={section.id}
                        conversationId={conversationId}
                        content={section.content}
                        onDone={() => setEditingId(null)}
                      />
                    ) : (
                      <SectionContent
                        section={section}
                        conversationId={conversationId}
                        deckV2={reviewFlags.deckV2}
                      />
                    )}
                  </section>
                ))}
              </div>
            )}
          </article>
        </div>
      </div>
      <StackUndoToast undoable={undoable} onUndo={undoRemoval} />
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
  deckV2 = false,
}: {
  section: {
    id: string;
    edited?: boolean;
    content: string;
    audience: 'teacher' | 'student';
    materials: LessonMaterial[];
    deck: SlideDeck | null;
    deckFailed: boolean;
  };
  conversationId: string;
  deckV2?: boolean;
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
          {/* The same controls as the chat's deck card (Brian's run 2,
              item 25): Edit opens the deck editor and comes back here. */}
          <SlideDeckCard
            deck={section.deck}
            presentHref={`/present/${conversationId}/${section.id}`}
            downloadHref={`/present/${conversationId}/${section.id}.pptx`}
            editHref={
              deckV2
                ? `/app/lesson-planner/${conversationId}/deck/${section.id}?from=stack`
                : null
            }
            edited={Boolean(section.edited)}
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
 * The outputs built from the stack, once the sequence is set (Brian's run 2,
 * A8, item 7). Building goes back to the chat, where the deck or handout
 * lands as a card like any other; the slide deck comes last.
 */
function BuildFromStack({
  conversationId,
  lessonPlanHref,
  hasDeck,
}: {
  conversationId: string;
  lessonPlanHref: string;
  hasDeck: boolean;
}) {
  const build = (request: string) =>
    `/app/lesson-planner?c=${conversationId}&build=${request}`;
  return (
    <>
      <div
        data-testid="build-from-stack"
        className="mt-4 flex flex-col gap-1.5 rounded-xl border border-primary/25 bg-primary/[0.04] p-3 print:hidden"
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          When the sequence is set
        </p>
        <Button size="sm" variant="outline" className="justify-start" asChild>
          <Link to={build('handout')}>Create handouts from this stack</Link>
        </Button>
        <Button size="sm" variant="outline" className="justify-start" asChild>
          <a href={lessonPlanHref} download>
            Download the lesson plan (PDF)
          </a>
        </Button>
        <Button size="sm" className="justify-start" asChild>
          <Link to={build(hasDeck ? 'rebuild-deck' : 'deck')}>
            {hasDeck
              ? 'Rebuild the slide deck from this stack'
              : 'Create a slide deck from this stack'}
          </Link>
        </Button>
      </div>
      <MakeUpLink conversationId={conversationId} />
    </>
  );
}

/** Brian's run 2 (items 37, 38): the lesson, for a student who missed it. */
function MakeUpLink({ conversationId }: { conversationId: string }) {
  return (
    <Link
      to={`/app/lesson-planner?c=${conversationId}&build=makeup`}
      className="mt-2 block text-xs font-medium text-primary hover:underline print:hidden"
    >
      Send this lesson to a student who missed class
    </Link>
  );
}
