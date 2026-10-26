/**
 * A deck painting from the platform art store (`deck-art.ts`). Hides itself
 * when the file is missing so LP never shows a broken image icon.
 */
import { useState, type ImgHTMLAttributes } from 'react';
import { cn } from '~/utils/misc';

export function DeckArtImage({
  src,
  alt = '',
  className,
  ...props
}: {
  src: string;
  alt?: string;
  className?: string;
} & Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'>) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <img
      src={src}
      alt={alt}
      className={cn('object-cover', className)}
      onError={() => setHidden(true)}
      {...props}
    />
  );
}
