/**
 * The deck studio (Nov 19; Brian, Nov 18: "teachers edit a deck directly on
 * the slide, the way they would in Google Slides or PowerPoint … no long list
 * of form fields under the slide").
 *
 * For a deck drawn in Lesson Deck Kit v4 or v4.1, behind
 * `lesson_planner_deck_studio`. The teacher clicks the words on the slide and
 * types; the kit lays the slide out again around them, so the design holds.
 * Enter adds a list line, Backspace on an empty one removes it, and a click
 * on the slide's picture swaps it. Notes and minutes sit in one strip under
 * the slide. The fields are still there, under "More options", closed.
 *
 * Saving is the editor's: the same hidden field, the same action.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Form, Link } from 'react-router';
import { ChevronLeft, Loader2, Save } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { DeckPicturesProvider } from '~/components/lesson-planner/slide-picture';
import { useActiveTime } from '~/components/lesson-planner/use-active-time';
import { deleteSlide, updateSlide, withoutSlidePicture, withSlidePicture } from '~/domain/lesson-planner/deck-edit';
import type { KitV4Source } from '~/domain/lesson-planner/deck-kit-v4';
import {
  applySlideText,
  insertSlideListItem,
  removeSlideListItem,
  sourceKey,
  sourceLabel,
  sourceText,
} from '~/domain/lesson-planner/deck-on-slide';
import type { DeckPicture, DeckPictures } from '~/domain/lesson-planner/deck-pictures';
import type { Slide, SlideDeck } from '~/domain/lesson-planner/slide-deck';
import { GALLERY_FONTS_HREF, GallerySlideCanvas } from '~/routes/present.$conversationId.$messageId/gallery-slide-canvas';
import type { KitV4SlideEdit } from '~/routes/present.$conversationId.$messageId/kit-v4-slide-canvas';
import { DeckChat, type DeckPointing } from './deck-chat';
import { DeletedSlideToast, SlideFields, SlideRail, uploadSlidePicture } from './editor-parts';

/** How long a deleted slide can still be brought back. */
const UNDO_MS = 8000;

export type DeckStudioProps = {
  conversationId: string;
  deckId: string;
  lessonTitle: string;
  deck: SlideDeck;
  returnTo: string;
  periodMinutes: number | null;
  pictures: DeckPictures;
  pictureUploads: boolean;
  activeTime: boolean;
  /** Ask Yawp! beside the slide (`lesson_planner_deck_chat`). */
  chat: boolean;
  /** Why the last save was turned down. */
  error: string | null;
  saving: boolean;
};

export function DeckStudio({
  conversationId,
  deckId,
  lessonTitle,
  deck: loaded,
  returnTo,
  periodMinutes,
  pictures,
  pictureUploads,
  activeTime,
  chat,
  error,
  saving,
}: DeckStudioProps) {
  // "Planned in" is working time (Nov 3): editing the deck is planning too.
  useActiveTime({ conversationId, enabled: activeTime });
  const [deck, setDeck] = useState<SlideDeck>(loaded);
  // The newest deck, for two edits in one keystroke (the words, then Enter).
  const latest = useRef(deck);
  const [selected, setSelected] = useState(0);
  const [addedPictures, setAddedPictures] = useState<DeckPictures>({});
  const [more, setMore] = useState(false);
  const [undo, setUndo] = useState<{ deck: SlideDeck; title: string } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The box to put the caret in once the slide is drawn again.
  const [focus, setFocus] = useState<{ source: KitV4Source; select: 'all' | 'end' } | null>(null);
  const [pointing, setPointing] = useState<DeckPointing | null>(null);
  const [picture, setPicture] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  const stage = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(
    () => () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    },
    []
  );

  const at = Math.min(selected, deck.slides.length - 1);
  const slide = deck.slides[at]!;

  function put(next: SlideDeck) {
    latest.current = next;
    setDeck(next);
  }
  const change = (edit: (deck: SlideDeck) => SlideDeck) => put(edit(latest.current));

  function select(index: number) {
    setSelected(index);
    setPointing(null);
  }

  function remove(index: number) {
    const current = latest.current;
    if (current.slides.length <= 1) return;
    setUndo({ deck: current, title: current.slides[index]!.title });
    put(deleteSlide(current, index));
    setSelected((was) => Math.max(0, Math.min(was, current.slides.length - 2)));
    setPointing(null);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndo(null), UNDO_MS);
  }

  useEffect(() => {
    if (!focus) return;
    const box = stage.current?.querySelector<HTMLElement>(`[data-source="${sourceKey(focus.source)}"]`);
    if (box) {
      // A box the caret was already in keeps what was typed there; after a
      // line is removed it stands for the next line, so it takes that line's words.
      const words = sourceText(latest.current, Math.min(selected, latest.current.slides.length - 1), focus.source);
      if (words !== undefined && box.textContent !== words) box.textContent = words;
      box.focus();
      const range = document.createRange();
      range.selectNodeContents(box);
      if (focus.select === 'end') range.collapse(false);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    setFocus(null);
    // Only a new place for the caret runs this, never the deck changing under it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  const edit = useMemo<KitV4SlideEdit>(
    () => ({
      onText: (source, text) => change((current) => applySlideText(current, at, source, text)),
      onEnter: (source) => {
        const added = insertSlideListItem(latest.current, at, source);
        if (!added) return;
        put(added.deck);
        if (added.focus) setFocus({ source: added.focus, select: 'all' });
      },
      onRemove: (source) => {
        const removed = removeSlideListItem(latest.current, at, source);
        if (!removed) return;
        put(removed.deck);
        if (removed.focus) setFocus({ source: removed.focus, select: 'end' });
      },
      onFocus: (source: KitV4Source | null) => {
        // Leaving a box keeps what was pointed at: the next click is often the chat.
        if (!source || !chat || source.on !== 'slide') return;
        setPointing({
          slide: at + 1,
          field: source.field,
          index: source.index,
          key: source.key,
          label: `Slide ${at + 1}, ${sourceLabel(source).replace(/^Slide /, '').toLowerCase()}`,
          text: sourceText(latest.current, at, source) ?? '',
        });
      },
      onPicture: pictureUploads ? () => fileInput.current?.click() : undefined,
    }),
    // `change` and `put` only touch refs and setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [at, chat, pictureUploads]
  );

  function withPicture(added: DeckPicture) {
    setAddedPictures((current) => ({ ...current, [added.id]: added }));
    change((current) => ({
      ...current,
      slides: current.slides.map((entry, index) => (index === at ? withSlidePicture(entry, added.id) : entry)),
    }));
  }

  async function swapPicture(file: File) {
    setPicture({ busy: true, error: null });
    try {
      withPicture(await uploadSlidePicture(conversationId, file));
      setPicture({ busy: false, error: null });
    } catch (problem) {
      setPicture({ busy: false, error: (problem as Error).message });
    }
  }

  const patch = (fields: Partial<Slide>) => change((current) => updateSlide(current, at, fields));

  return (
    <DeckPicturesProvider pictures={{ ...pictures, ...addedPictures }}>
      <section data-testid="deck-studio" className="h-full w-full overflow-y-auto">
        <link rel="stylesheet" href={GALLERY_FONTS_HREF} />
        <Form method="post" className="mx-auto w-full max-w-[96rem] px-4 py-6">
          <input type="hidden" name="deck" value={JSON.stringify(deck)} />
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <Button variant="outline" size="sm" asChild>
              <Link to={returnTo}>
                <ChevronLeft size={16} className="mr-1" />
                Back without saving
              </Link>
            </Button>
            <label className="flex min-w-0 flex-1 items-center gap-2">
              <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Deck title</span>
              <input
                value={deck.title}
                maxLength={90}
                onChange={(event) => change((current) => ({ ...current, title: event.target.value }))}
                className="min-w-0 max-w-xl flex-1 rounded-lg border bg-background px-3 py-1.5 text-sm font-medium"
              />
            </label>
            <p className="hidden text-sm text-muted-foreground xl:block">{lessonTitle}</p>
            <Button type="submit" size="sm" data-testid="deck-editor-save" disabled={saving}>
              <Save size={15} className="mr-1.5" />
              Save deck
            </Button>
          </div>
          {error ? (
            <p role="alert" className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              This deck can’t be saved yet: {error}
            </p>
          ) : null}

          <div className={chat ? 'grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)_17rem]' : 'grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]'}>
            {chat ? (
              <DeckChat
                conversationId={conversationId}
                deckId={deckId}
                deck={deck}
                pointing={pointing}
                onStopPointing={() => setPointing(null)}
                onApply={(next) => {
                  // Yawp!'s deck comes back without the look it is drawn in.
                  put({ ...next, kit: latest.current.kit });
                  setSelected((was) => Math.min(was, next.slides.length - 1));
                }}
                onRestore={(before) => {
                  put(before);
                  setSelected((was) => Math.min(was, before.slides.length - 1));
                }}
              />
            ) : null}

            <div className="flex min-w-0 flex-col gap-4">
              <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                <strong className="font-semibold">
                  Slide {at + 1} of {deck.slides.length}
                </strong>
                <span className="text-muted-foreground">
                  Click any words on the slide to change them.{pictureUploads && slide.image ? ' Click the picture to swap it.' : ''}
                </span>
                {picture.busy ? (
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Loader2 size={13} className="animate-spin" aria-hidden />
                    Adding the picture…
                  </span>
                ) : null}
              </p>
              {picture.error ? (
                <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {picture.error}
                </p>
              ) : null}

              <div ref={stage} data-testid="deck-studio-slide" className="aspect-[16/9] w-full overflow-hidden rounded-xl shadow-sm ring-1 ring-black/5">
                <GallerySlideCanvas key={at} deck={deck} index={at} edit={edit} />
              </div>
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                data-testid="slide-picture-swap-input"
                className="sr-only"
                tabIndex={-1}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) void swapPicture(file);
                }}
              />

              {/* What has no place on the slide: the teacher's notes and the minutes. */}
              <div className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[minmax(0,1fr)_6.5rem]">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Notes for you <span className="font-normal normal-case tracking-normal">(students do not see these)</span>
                  </span>
                  <textarea
                    aria-label="Notes for you"
                    value={slide.speakerNotes}
                    rows={3}
                    onChange={(event) => patch({ speakerNotes: event.target.value })}
                    className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Minutes</span>
                  <input
                    type="number"
                    aria-label="Minutes"
                    min={0}
                    max={60}
                    value={slide.minutes ?? ''}
                    onChange={(event) => patch({ minutes: event.target.value === '' ? undefined : Number(event.target.value) })}
                    className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                  />
                </label>
              </div>

              <details
                data-testid="deck-studio-more"
                open={more}
                onToggle={(event) => setMore((event.currentTarget as HTMLDetailsElement).open)}
                className="rounded-xl border bg-card"
              >
                <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
                  More options
                  <span className="ml-2 font-normal text-muted-foreground">the slide’s layout, its picture, and anything not on the slide yet</span>
                </summary>
                {more ? (
                  <div className="px-1 pb-1">
                    <SlideFields
                      slide={slide}
                      gallery
                      edit={patch}
                      conversationId={conversationId}
                      pictureUploads={pictureUploads}
                      onPicture={withPicture}
                      onRemovePicture={() =>
                        change((current) => ({
                          ...current,
                          slides: current.slides.map((entry, index) => (index === at ? withoutSlidePicture(entry) : entry)),
                        }))
                      }
                      omit={['minutes', 'notes']}
                    />
                  </div>
                ) : null}
              </details>
            </div>

            <SlideRail deck={deck} at={at} periodMinutes={periodMinutes} gallery setDeck={put} setSelected={select} remove={remove} />
          </div>
        </Form>

        {undo ? (
          <DeletedSlideToast
            title={undo.title}
            onUndo={() => {
              put(undo.deck);
              setUndo(null);
            }}
          />
        ) : null}
      </section>
    </DeckPicturesProvider>
  );
}
