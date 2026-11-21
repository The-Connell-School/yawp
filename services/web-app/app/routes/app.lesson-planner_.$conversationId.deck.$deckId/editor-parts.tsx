/**
 * The pieces the deck editor and the deck studio share (Nov 19): the list of
 * slides, a slide's fields, its picture, and the "Deleted" toast. Moved here
 * from the editor's route as they were, so the editor with the fields under
 * the slide is unchanged while the studio is behind its flag.
 */
import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Copy, ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { SlidePicture } from '~/components/lesson-planner/slide-picture';
import type { DeckPicture } from '~/domain/lesson-planner/deck-pictures';
import { duplicateSlide, moveSlide, slideListFields, slideTextFields } from '~/domain/lesson-planner/deck-edit';
import {
  CLASSIC_SLIDE_LAYOUTS,
  deckDurationMinutes,
  SLIDE_LAYOUTS,
  type Slide,
  type SlideDeck,
} from '~/domain/lesson-planner/slide-deck';
import { TileSlideThumbnail } from '~/routes/present.$conversationId.$messageId/tile-slide-canvas';
import { GallerySlideThumbnail } from '~/routes/present.$conversationId.$messageId/gallery-slide-canvas';
import { cn } from '~/utils/misc';

export const LAYOUT_LABELS: Record<Slide['layout'], string> = {
  title: 'Title',
  statement: 'Big question',
  bullets: 'Notes',
  compare: 'Side by side',
  prompt: 'Prompt',
  steps: 'Steps',
  quote: 'Quote',
  closing: 'Closing',
  agenda: 'Agenda',
  discuss: 'Talk',
  big_idea: 'Big idea',
  write: 'Write',
  notes: 'Know',
  divider: 'Divider',
  read: 'Read along',
  look: 'Look',
  excerpt: 'Annotate',
  exit: 'Before you go',
  picture: 'Your picture',
  timeline: 'Timeline',
  map: 'Map',
  define: 'Words',
  person: 'People',
};

const lines = (value: string) =>
  value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

/** Add a picture from the teacher's computer to the lesson (Brian, Nov 4). */
export async function uploadSlidePicture(conversationId: string, file: File): Promise<DeckPicture> {
  const form = new FormData();
  form.set('conversationId', conversationId);
  form.set('file', file);
  const response = await fetch('/api/domain/lesson-planner/slide-picture', { method: 'POST', body: form });
  const body = (await response.json().catch(() => ({}))) as { picture?: DeckPicture; error?: string };
  if (!response.ok || !body.picture) throw new Error(body.error ?? 'That picture could not be added.');
  return body.picture;
}

/** The deck's slides, in order: pick one, move it, copy it, delete it. */
export function SlideRail({
  deck,
  at,
  periodMinutes,
  gallery,
  setDeck,
  setSelected,
  remove,
}: {
  deck: SlideDeck;
  at: number;
  periodMinutes: number | null;
  gallery: boolean;
  setDeck: (deck: SlideDeck) => void;
  setSelected: (index: number) => void;
  remove: (index: number) => void;
}) {
  return (
          <div className="flex flex-col gap-2">
          {/* The minutes live here, for the teacher, not on the slides. */}
          <p className="flex items-baseline justify-between text-xs text-muted-foreground">
            <span>{deck.slides.length} slides</span>
            <span
              data-testid="deck-editor-total"
              className={cn(
                'font-medium tabular-nums',
                periodMinutes && deckDurationMinutes(deck) > periodMinutes
                  ? 'text-amber-700 dark:text-amber-300'
                  : 'text-foreground'
              )}
            >
              {periodMinutes
                ? `${deckDurationMinutes(deck)} of ${periodMinutes} min`
                : `${deckDurationMinutes(deck)} min`}
            </span>
          </p>
          <ol data-testid="deck-editor-slides" className="flex flex-col gap-2">
            {deck.slides.map((item, index) => (
              <li
                key={index}
                data-testid="deck-editor-slide"
                className={cn(
                  'group rounded-lg border bg-card p-2',
                  index === at && 'border-primary ring-1 ring-primary'
                )}
              >
                <button
                  type="button"
                  onClick={() => setSelected(index)}
                  className="block w-full text-left"
                  aria-label={`Slide ${index + 1}: ${item.title}`}
                >
                  <div className="pointer-events-none overflow-hidden rounded border">
                    {gallery ? (
                      <GallerySlideThumbnail deck={deck} index={index} width={238} />
                    ) : (
                      <TileSlideThumbnail slide={item} width={238} />
                    )}
                  </div>
                </button>
                <div className="mt-1.5 flex items-center gap-1">
                  <span className="min-w-0 flex-1 truncate text-xs font-medium">
                    {index + 1}. {item.title}
                  </span>
                  <IconButton label={`Move slide ${index + 1} up`} onClick={() => { setDeck(moveSlide(deck, index, -1)); setSelected(Math.max(0, index - 1)); }} disabled={index === 0}>
                    <ArrowUp size={13} />
                  </IconButton>
                  <IconButton label={`Move slide ${index + 1} down`} onClick={() => { setDeck(moveSlide(deck, index, 1)); setSelected(Math.min(deck.slides.length - 1, index + 1)); }} disabled={index === deck.slides.length - 1}>
                    <ArrowDown size={13} />
                  </IconButton>
                  <IconButton label={`Duplicate slide ${index + 1}`} onClick={() => setDeck(duplicateSlide(deck, index))}>
                    <Copy size={13} />
                  </IconButton>
                  <IconButton
                    label={`Delete slide ${index + 1}`}
                    onClick={() => remove(index)}
                    disabled={deck.slides.length <= 1}
                    danger
                  >
                    <Trash2 size={13} />
                  </IconButton>
                </div>
              </li>
            ))}
          </ol>
          </div>
  );
}

/** A slide's fields, as a form: the layout's own, and any other the slide carries. */
export function SlideFields({
  slide,
  gallery,
  edit,
  conversationId,
  pictureUploads,
  onPicture,
  onRemovePicture,
  omit = [],
}: {
  slide: Slide;
  gallery: boolean;
  edit: (patch: Partial<Slide>) => void;
  conversationId: string;
  pictureUploads: boolean;
  onPicture: (picture: DeckPicture) => void;
  onRemovePicture: () => void;
  /** Fields the studio shows elsewhere on its page. */
  omit?: ('minutes' | 'notes')[];
}) {
  return (
            <div className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2">
              <Field label="Layout">
                <select
                  value={slide.layout}
                  onChange={(event) =>
                    edit({ layout: event.target.value as Slide['layout'] })
                  }
                  className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                >
                  {(gallery ? SLIDE_LAYOUTS : CLASSIC_SLIDE_LAYOUTS)
                    // A picture slide comes only from the teacher's own deck (Nov 1):
                    // offered to keep, never to turn a slide with no picture into.
                    .filter((layout) => layout !== 'picture' || slide.layout === 'picture')
                    .map((layout) => (
                    <option key={layout} value={layout}>
                      {LAYOUT_LABELS[layout]}
                    </option>
                  ))}
                </select>
              </Field>
              {omit.includes('minutes') ? null : (
              <Field label="Minutes">
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={slide.minutes ?? ''}
                  onChange={(event) =>
                    edit({
                      minutes: event.target.value === '' ? undefined : Number(event.target.value),
                    })
                  }
                  className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                />
              </Field>
              )}
              <Field label="Title" wide>
                <input
                  value={slide.title}
                  maxLength={90}
                  onChange={(event) => edit({ title: event.target.value })}
                  className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                />
              </Field>
              {/* Every piece of text on the slide has a field (Brian, Nov 4): the
                  layout's own, and any other the slide carries. */}
              {slideTextFields(slide).map((field) => (
                <Field key={field.key} label={field.label} wide>
                  {field.long ? (
                    <textarea
                      data-testid={`deck-field-${field.key}`}
                      value={(slide[field.key] as string | undefined) ?? ''}
                      maxLength={field.max}
                      rows={3}
                      onChange={(event) => edit({ [field.key]: event.target.value || undefined } as Partial<Slide>)}
                      className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                    />
                  ) : (
                    <input
                      data-testid={`deck-field-${field.key}`}
                      value={(slide[field.key] as string | undefined) ?? ''}
                      maxLength={field.max}
                      onChange={(event) => edit({ [field.key]: event.target.value || undefined } as Partial<Slide>)}
                      className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                    />
                  )}
                </Field>
              ))}
              {slideListFields(slide).includes('agenda') ? (
                <Field label="Agenda, one per line" wide>
                  <textarea
                    value={(slide.agenda ?? []).map((item) => item.title).join('\n')}
                    rows={5}
                    onChange={(event) => {
                      const next = lines(event.target.value).slice(0, 6);
                      edit({
                        agenda: next.length
                          ? next.map((title, i) => ({ title, minutes: slide.agenda?.[i]?.minutes }))
                          : undefined,
                      });
                    }}
                    className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                  />
                </Field>
              ) : null}
              {slideListFields(slide).includes('timeline') ? (
                <Field label="Timeline, one per line (year: what happened)" wide>
                  <textarea
                    data-testid="deck-field-timeline"
                    value={(slide.timeline ?? []).map((entry) => `${entry.year}: ${entry.caption}`).join('\n')}
                    rows={4}
                    onChange={(event) => {
                      const next = lines(event.target.value)
                        .slice(0, 5)
                        .map((line, i) => {
                          const [year, ...rest] = line.split(':');
                          return { year: (year ?? '').trim().slice(0, 14) || '…', caption: rest.join(':').trim() || '…', mark: slide.timeline?.[i]?.mark };
                        });
                      edit({ timeline: next.length ? next : undefined });
                    }}
                    className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                  />
                </Field>
              ) : null}
              {slideListFields(slide).includes('facts') ? (
                <Field label="Facts, one per line" wide>
                  <textarea
                    value={(slide.facts ?? []).join('\n')}
                    rows={3}
                    onChange={(event) => {
                      const next = lines(event.target.value).slice(0, 3);
                      edit({ facts: next.length ? next : undefined });
                    }}
                    className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                  />
                </Field>
              ) : null}
              {slideListFields(slide).includes('tasks') ? (
                <Field label="Tasks, one per line (the first word is the verb)" wide>
                  <textarea
                    value={(slide.tasks ?? []).map((task) => `${task.verb} ${task.text}`).join('\n')}
                    rows={4}
                    onChange={(event) => {
                      const next = lines(event.target.value)
                        .slice(0, 4)
                        .map((line) => {
                          const [verb, ...rest] = line.split(/\s+/);
                          return { verb: verb!, text: rest.join(' ') || '…' };
                        });
                      edit({ tasks: next.length ? next : undefined });
                    }}
                    className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                  />
                </Field>
              ) : null}
              {slideListFields(slide).includes('bullets') ? (
                <Field label="One per line" wide>
                  <textarea
                    value={(slide.bullets ?? []).join('\n')}
                    rows={5}
                    onChange={(event) => {
                      const next = lines(event.target.value);
                      edit({ bullets: next.length ? next : undefined });
                    }}
                    className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                  />
                </Field>
              ) : null}
              {slide.layout === 'compare'
                ? (['left', 'right'] as const).map((side) => (
                    <Field key={side} label={side === 'left' ? 'Left column' : 'Right column'}>
                      <input
                        aria-label={`${side} label`}
                        value={slide[side]?.label ?? ''}
                        placeholder="Label"
                        onChange={(event) =>
                          edit({ [side]: { label: event.target.value, text: slide[side]?.text ?? '' } })
                        }
                        className="mb-1.5 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                      />
                      <textarea
                        aria-label={`${side} text`}
                        value={slide[side]?.text ?? ''}
                        rows={4}
                        onChange={(event) =>
                          edit({ [side]: { label: slide[side]?.label ?? '', text: event.target.value } })
                        }
                        className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                      />
                    </Field>
                  ))
                : null}
              {slideListFields(slide).includes('choices') ? (
                <Field label="Choices, one per line" wide>
                  <textarea
                    data-testid="deck-field-choices"
                    value={(slide.choices ?? []).join('\n')}
                    rows={4}
                    onChange={(event) => {
                      const next = lines(event.target.value).slice(0, 5);
                      edit({ choices: next.length >= 2 ? next : undefined });
                    }}
                    className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                  />
                </Field>
              ) : null}
              {pictureUploads ? (
                <SlidePictureField
                  conversationId={conversationId}
                  image={slide.image}
                  onPicture={onPicture}
                  onRemove={onRemovePicture}
                />
              ) : null}
              {omit.includes('notes') ? null : (
              <Field label="Speaker notes" wide>
                <textarea
                  value={slide.speakerNotes}
                  rows={3}
                  onChange={(event) => edit({ speakerNotes: event.target.value })}
                  className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                />
              </Field>
              )}
            </div>
  );
}

/** "Deleted …  Undo", for a few seconds after a slide goes. */
export function DeletedSlideToast({ title, onUndo }: { title: string; onUndo: () => void }) {
  return (
    <div
      role="status"
      data-testid="deck-editor-undo"
      className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg bg-foreground px-4 py-2.5 text-sm text-background shadow-lg"
    >
      <span>Deleted “{title}”</span>
      <button type="button" className="font-semibold underline underline-offset-2" onClick={onUndo}>
        Undo
      </button>
    </div>
  );
}

export function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'rounded p-1 text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground disabled:opacity-30',
        danger && 'hover:bg-destructive/10 hover:text-destructive'
      )}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={cn('block', wide && 'sm:col-span-2')}>
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

/**
 * A slide's picture (Brian, Nov 4): replace it, remove it, or add one, from
 * the teacher's computer. Most useful on an uploaded deck, where the pictures
 * are often the point.
 */
export function SlidePictureField({
  conversationId,
  image,
  onPicture,
  onRemove,
}: {
  conversationId: string;
  image: string | undefined;
  onPicture: (picture: DeckPicture) => void;
  onRemove: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      onPicture(await uploadSlidePicture(conversationId, file));
    } catch (problem) {
      setError((problem as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        data-testid="slide-picture-input"
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void upload(file);
        }}
      />
      <Field label="Picture" wide>
      <div className="flex flex-wrap items-center gap-3">
        {image ? (
          <div className="h-20 w-32 overflow-hidden rounded-md border bg-muted/40">
            <SlidePicture id={image} />
          </div>
        ) : null}
        <Button type="button" variant="outline" size="sm" disabled={busy} data-testid="slide-picture-choose" onClick={() => input.current?.click()}>
          {busy ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <ImagePlus size={14} className="mr-1.5" />}
          {image ? 'Replace picture' : 'Add a picture'}
        </Button>
        {image ? (
          <Button type="button" variant="ghost" size="sm" data-testid="slide-picture-remove" onClick={onRemove}>
            <Trash2 size={14} className="mr-1.5" />
            Remove picture
          </Button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="mt-1.5 text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <p className="mt-1.5 text-xs text-muted-foreground">PNG, JPEG, GIF or WebP, up to 8 MB. Adding one makes this a picture slide; its words stay.</p>
      </Field>
    </>
  );
}

