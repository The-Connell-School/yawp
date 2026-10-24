import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Link,
  redirect,
  useLoaderData,
  useLocation,
  type LoaderFunctionArgs,
} from 'react-router';
import { closeHref } from '~/domain/lesson-planner/lesson-return';
import {
  ChevronLeft,
  ChevronRight,
  Maximize,
  Minimize,
  Printer,
  StickyNote,
  X,
} from 'lucide-react';
import { deckDurationMinutes } from '~/domain/lesson-planner/slide-deck';
import { loadLessonDeck } from '~/domain/lesson-planner/load-deck.server';
import { useShowChannel } from '~/components/lesson-planner/show-channel';
import { cn } from '~/utils/misc';
import { SlideCanvas } from './slide-canvas';
import { TileSlideCanvas } from './tile-slide-canvas';
import { GALLERY_FONTS_HREF, GallerySlideCanvas } from './gallery-slide-canvas';
import { getLessonPlannerReviewFlags } from '~/domain/feature-flags/feature-flags.server';
import { getLessonPlannerAccess } from '~/utils/lesson-planner/lesson-planner-access.server';

export async function loader({ request, params }: LoaderFunctionArgs) {
  // The same lookup the PowerPoint download uses: a deck a teacher can project
  // is a deck they can take with them.
  const { conversationId, lessonTitle, deck } = await loadLessonDeck({
    request,
    conversationId: params.conversationId,
    deckId: params.messageId,
  });

  const access = await getLessonPlannerAccess(request);
  const { deckV2, deckGallery } = access.allowed
    ? await getLessonPlannerReviewFlags(access.membership.organization.id)
    : { deckV2: false, deckGallery: false };

  return {
    conversationId,
    lessonTitle,
    deck,
    durationMinutes: deckDurationMinutes(deck),
    // Brian's review (E1): the Yawp! tile template, behind its flag.
    tileTemplate: deckV2,
    // The Lesson Deck Kit, behind its own flag.
    galleryTemplate: deckGallery,
  };
}

export default function PresentRoute() {
  const { conversationId, lessonTitle, deck, durationMinutes, tileTemplate, galleryTemplate } =
    useLoaderData<typeof loader>();
  const location = useLocation();
  // Close goes back to where the deck was opened (Brian's run 6, item 3).
  const closeTo = closeHref(conversationId, `${location.pathname}${location.search}`, 'stack');
  const slideshow = new URLSearchParams(location.search).get('slideshow') === '1';
  const [index, setIndex] = useState(0);
  const [showNotes, setShowNotes] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);

  const total = deck.slides.length;
  const slide = deck.slides[index]!;

  // Run the show moves these slides with the teacher (Brian's run 3).
  const tellShow = useShowChannel(conversationId, (message) => {
    if (message.type === 'slide') setIndex(Math.min(total - 1, Math.max(0, message.index)));
    if (message.type === 'ping') tellShow({ type: 'projector-here' });
  });
  useEffect(() => {
    tellShow({ type: 'projector-here' });
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const go = useCallback(
    (delta: number) =>
      setIndex((current) => Math.min(total - 1, Math.max(0, current + delta))),
    [total]
  );

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    void stageRef.current?.requestFullscreen?.();
  }, []);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // A presenter remote sends arrows and PageUp/PageDown; space is the
      // habit most teachers already have.
      switch (event.key) {
        case 'ArrowRight':
        case 'PageDown':
        case ' ':
          event.preventDefault();
          go(1);
          break;
        case 'ArrowLeft':
        case 'PageUp':
          event.preventDefault();
          go(-1);
          break;
        case 'Home':
          event.preventDefault();
          setIndex(0);
          break;
        case 'End':
          event.preventDefault();
          setIndex(total - 1);
          break;
        case 'n':
        case 'N':
          setShowNotes((shown) => !shown);
          break;
        case 'f':
        case 'F':
          toggleFullscreen();
          break;
        default:
          break;
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [go, total, toggleFullscreen]);

  const canvas = (shown: number) =>
    galleryTemplate ? (
      <GallerySlideCanvas deck={deck} index={shown} />
    ) : tileTemplate ? (
      <TileSlideCanvas slide={deck.slides[shown]!} />
    ) : (
      <SlideCanvas slide={deck.slides[shown]!} />
    );

  // Open slideshow (Oct 24 handoff, task 6): the slides and nothing else, for
  // the smartboard. The first tap goes full screen (browsers ask for a tap);
  // arrows, space and a presenter remote move the slides.
  if (slideshow) {
    return (
      <main
        data-testid="slideshow"
        className="group fixed inset-0 flex items-center justify-center bg-[#1C1A17]"
        onClick={() => {
          if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => {});
        }}
      >
        {galleryTemplate ? <link rel="stylesheet" href={GALLERY_FONTS_HREF} /> : null}
        <div
          data-testid="slide-stage"
          className="aspect-[16/9] w-full max-w-[calc(100vh*16/9)] overflow-hidden bg-white"
        >
          {canvas(index)}
        </div>
        <div className="absolute right-3 top-3 flex items-center gap-2 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
          <span data-testid="slide-counter" className="rounded-md bg-black/60 px-2 py-1 text-xs font-semibold text-white">
            {index + 1} / {total}
          </span>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              if (document.fullscreenElement) void document.exitFullscreen();
              else void document.documentElement.requestFullscreen?.().catch(() => {});
            }}
            className="inline-flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-xs font-semibold text-white"
          >
            {isFullscreen ? <Minimize size={13} /> : <Maximize size={13} />} {isFullscreen ? 'Exit full screen' : 'Full screen'}
          </button>
          <Link
            to={closeTo}
            data-testid="present-close"
            onClick={(event) => event.stopPropagation()}
            className="inline-flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-xs font-semibold text-white"
          >
            <X size={13} /> Close
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-screen w-full flex-col bg-slate-100 print:h-auto print:bg-white">
      {galleryTemplate ? <link rel="stylesheet" href={GALLERY_FONTS_HREF} /> : null}
      {/* Presenter chrome — never projected onto a wall, never printed. */}
      <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 py-2 print:hidden">
        <Link
          to={closeTo}
          data-testid="present-close"
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        >
          <X size={16} />
          Close
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">
            {deck.title}
          </p>
          <p className="truncate text-xs text-slate-500">
            {[
              lessonTitle,
              durationMinutes > 0 ? `${durationMinutes} min` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowNotes((shown) => !shown)}
          aria-pressed={showNotes}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100',
            { 'bg-slate-900 text-white hover:bg-slate-900': showNotes }
          )}
        >
          <StickyNote size={15} />
          Notes
        </button>
        <button
          type="button"
          onClick={toggleFullscreen}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          {isFullscreen ? <Minimize size={15} /> : <Maximize size={15} />}
          {isFullscreen ? 'Exit' : 'Full screen'}
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          <Printer size={15} />
          Print
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row print:block">
        {/* The stage. Fullscreen is requested on this element so the slide
            fills the projector without the chrome coming with it. */}
        <div
          ref={stageRef}
          className="flex min-h-0 flex-1 items-center justify-center bg-slate-100 p-4 print:block print:p-0"
        >
          <div
            data-testid="slide-stage"
            className="aspect-[16/9] w-full max-w-[min(100%,calc((100vh-8rem)*16/9))] overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200 print:hidden"
          >
            {galleryTemplate ? (
              <GallerySlideCanvas deck={deck} index={index} />
            ) : tileTemplate ? (
              <TileSlideCanvas slide={slide} />
            ) : (
              <SlideCanvas slide={slide} />
            )}
          </div>

          {/* Printing gives every slide its own landscape page. */}
          <div className="hidden print:block">
            {deck.slides.map((printed, printIndex) => (
              <div
                key={printIndex}
                className="flex aspect-[16/9] w-full items-center justify-center break-after-page border border-slate-200"
              >
                {galleryTemplate ? (
                  <GallerySlideCanvas deck={deck} index={printIndex} />
                ) : tileTemplate ? (
                  <TileSlideCanvas slide={printed} />
                ) : (
                  <SlideCanvas slide={printed} />
                )}
              </div>
            ))}
          </div>
        </div>

        {showNotes ? (
          <aside
            data-testid="speaker-notes"
            className="min-h-0 shrink-0 overflow-y-auto border-t border-slate-200 bg-white p-4 lg:w-96 lg:border-l lg:border-t-0 print:hidden"
          >
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Speaker notes
              {slide.minutes ? ` · ${slide.minutes} min` : ''}
            </p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
              {slide.speakerNotes}
            </p>
          </aside>
        ) : null}
      </div>

      {/* Transport. Big targets: this gets tapped mid-sentence. */}
      <footer className="flex shrink-0 items-center gap-3 border-t border-slate-200 bg-white px-4 py-2 print:hidden">
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={index === 0}
          aria-label="Previous slide"
          className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <ChevronLeft size={18} />
          Back
        </button>
        <button
          type="button"
          onClick={() => go(1)}
          disabled={index === total - 1}
          aria-label="Next slide"
          className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
        >
          Next
          <ChevronRight size={18} />
        </button>

        <div
          className="mx-2 hidden flex-1 gap-1 sm:flex"
          role="tablist"
          aria-label="Slides"
        >
          {deck.slides.map((_unused, slideIndex) => (
            <button
              key={slideIndex}
              type="button"
              role="tab"
              aria-selected={slideIndex === index}
              aria-label={`Slide ${slideIndex + 1}`}
              onClick={() => setIndex(slideIndex)}
              className={cn(
                'h-1.5 min-w-2 flex-1 rounded-full bg-slate-200 transition hover:bg-slate-300',
                { 'bg-primary hover:bg-primary': slideIndex <= index }
              )}
            />
          ))}
        </div>

        <p
          className="shrink-0 text-sm tabular-nums text-slate-500"
          aria-live="polite"
          data-testid="slide-counter"
        >
          {index + 1} / {total}
        </p>
      </footer>
    </main>
  );
}
