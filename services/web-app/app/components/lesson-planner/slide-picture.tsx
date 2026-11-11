/**
 * The teacher's own picture on a slide (Nov 1), for every screen that draws
 * one: Present, Run the show, the deck editor and the chat's preview.
 *
 * Which pictures a screen may show comes from its loader through context, so
 * the canvases need no new props. No entry: the placeholder, never a broken
 * image, and never a request for a picture the viewer cannot have.
 */
import { createContext, useContext, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { PICTURE_PLACEHOLDER, pictureSrc, type DeckPictures } from '~/domain/lesson-planner/deck-pictures';
import { cn } from '~/utils/misc';

const DeckPicturesContext = createContext<DeckPictures>({});

export function DeckPicturesProvider({ pictures, children }: { pictures: DeckPictures | null | undefined; children: React.ReactNode }) {
  return <DeckPicturesContext.Provider value={pictures ?? {}}>{children}</DeckPicturesContext.Provider>;
}

export function SlidePicture({ id, className, tone = 'light' }: { id: string | undefined; className?: string; tone?: 'light' | 'dark' }) {
  const picture = useContext(DeckPicturesContext)[id ?? ''];
  const [failed, setFailed] = useState(false);
  if (!id || !picture || failed) {
    return (
      <div
        data-testid="slide-picture-missing"
        role="img"
        aria-label={PICTURE_PLACEHOLDER}
        className={cn(
          'flex h-full w-full flex-col items-center justify-center gap-[0.5em] rounded-[0.4em] border border-dashed p-[1em] text-center',
          tone === 'dark' ? 'border-white/30 text-white/70' : 'border-slate-300 bg-slate-50 text-slate-500',
          className
        )}
        style={{ fontSize: 'clamp(0.7rem, 1.4cqw, 1.2rem)' }}
      >
        <ImageOff aria-hidden className="h-[2em] w-[2em]" />
        <span className="max-w-[28ch]">{PICTURE_PLACEHOLDER}</span>
      </div>
    );
  }
  return (
    <div data-testid="slide-picture" className={cn('flex h-full w-full items-center justify-center', className)}>
      <img
        src={pictureSrc(picture.id)}
        alt={picture.altText}
        width={picture.width ?? undefined}
        height={picture.height ?? undefined}
        onError={() => setFailed(true)}
        className="max-h-full max-w-full object-contain"
      />
    </div>
  );
}
