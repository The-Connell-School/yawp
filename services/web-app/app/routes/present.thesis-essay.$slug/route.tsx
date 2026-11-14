import { invariantResponse } from '@epic-web/invariant';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLoaderData, type LinksFunction, type LoaderFunctionArgs } from 'react-router';
import { ChevronLeft, ChevronRight, Maximize, Minimize, Printer, StickyNote, X } from 'lucide-react';
import { THESIS_ESSAY_DECKS_FLAG } from '~/domain/feature-flags/feature-flags';
import { isFeatureFlagEnabled } from '~/domain/feature-flags/feature-flags.server';
import { deckBySlug, deckLabel } from '~/domain/thesis-essay-decks/thesis-essay-decks';
import { readThesisEssayDeckScene } from '~/domain/thesis-essay-decks/thesis-essay-decks.server';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { cn } from '~/utils/misc';
import { SceneSlideView } from './scene-slide';

/** The deck's faces, for screens without Georgia or Calibri. */
export const links: LinksFunction = () => [{ rel: 'stylesheet', href: '/fonts/deck/deck-fonts.css' }];

/** Only somewhere inside the app: never off-site. */
function safeReturn(from: string | null): string {
  return from && from.startsWith('/app/') && !from.startsWith('//') && !from.includes('\\') ? from : '/app';
}

/**
 * A Thesis-Driven Essay deck, presented on YAWP! exactly as designed: the
 * same slides as the PowerPoint download, drawn from the same source. The
 * same gate as the downloads: teachers only, only while the flag is on.
 */
export async function loader({ request, params }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  invariantResponse(profile.role === 'TEACHER', 'Not found', { status: 404 });
  invariantResponse(
    await isFeatureFlagEnabled(THESIS_ESSAY_DECKS_FLAG, profile.organization.id),
    'Not found',
    { status: 404 }
  );

  const deck = params.slug ? deckBySlug(params.slug) : null;
  invariantResponse(deck, 'Not found', { status: 404 });
  const scene = await readThesisEssayDeckScene(deck);
  invariantResponse(scene, 'Not found', { status: 404 });

  return {
    slug: deck.slug,
    lesson: deckLabel(deck),
    scene,
    returnTo: safeReturn(new URL(request.url).searchParams.get('from')),
  };
}

export default function PresentThesisEssayDeckRoute() {
  const { lesson, scene, returnTo } = useLoaderData<typeof loader>();
  const [index, setIndex] = useState(0);
  const [showNotes, setShowNotes] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);

  const total = scene.slides.length;
  const slide = scene.slides[index]!;

  const go = useCallback(
    (delta: number) => setIndex((current) => Math.min(total - 1, Math.max(0, current + delta))),
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

  return (
    <main className="flex h-screen w-full flex-col bg-slate-100 print:h-auto print:bg-white">
      {/* Presenter chrome: never projected onto a wall, never printed. */}
      <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 py-2 print:hidden">
        <Link
          to={returnTo}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        >
          <X size={16} />
          Close
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{scene.title}</p>
          <p className="truncate text-xs text-slate-500">Thesis-Driven Essay · {lesson}</p>
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
            className="aspect-[16/9] w-full max-w-[min(100%,calc((100vh-8rem)*16/9))] overflow-hidden rounded-xl shadow-sm ring-1 ring-slate-200 print:hidden"
          >
            {/* Every slide is mounted, so the next one's pictures are already
                loaded when the teacher clicks; only the current one shows. */}
            {scene.slides.map((each, slideIndex) => (
              <div
                key={slideIndex}
                className={cn('h-full w-full', { hidden: slideIndex !== index })}
                aria-hidden={slideIndex !== index}
                data-testid={slideIndex === index ? 'current-slide' : undefined}
              >
                <SceneSlideView slide={each} />
              </div>
            ))}
          </div>

          {/* Printing gives every slide its own landscape page. */}
          <div className="hidden print:block">
            {scene.slides.map((printed, printIndex) => (
              <div key={printIndex} className="aspect-[16/9] w-full break-after-page">
                <SceneSlideView slide={printed} />
              </div>
            ))}
          </div>
        </div>

        {showNotes ? (
          <aside
            data-testid="speaker-notes"
            className="min-h-0 shrink-0 overflow-y-auto border-t border-slate-200 bg-white p-4 lg:w-96 lg:border-l lg:border-t-0 print:hidden"
          >
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Speaker notes</p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{slide.notes}</p>
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

        <div className="mx-2 hidden flex-1 gap-1 sm:flex" role="tablist" aria-label="Slides">
          {scene.slides.map((_unused, slideIndex) => (
            <button
              key={slideIndex}
              type="button"
              role="tab"
              aria-selected={slideIndex === index}
              aria-label={`Slide ${slideIndex + 1}`}
              onClick={() => setIndex(slideIndex)}
              className={cn('h-1.5 min-w-1 flex-1 rounded-full bg-slate-200 transition hover:bg-slate-300', {
                'bg-primary hover:bg-primary': slideIndex <= index,
              })}
            />
          ))}
        </div>

        <p className="shrink-0 text-sm tabular-nums text-slate-500" aria-live="polite" data-testid="slide-counter">
          {index + 1} / {total}
        </p>
      </footer>
    </main>
  );
}
