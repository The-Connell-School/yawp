import { useMemo } from 'react';
import { generateClassArt, getClassArtByIndex, formatClassArtCredit } from '~/utils/class-art';
import { cn } from '~/utils/misc';

export function ClassArt({
  seed,
  classArtIndex,
  className,
}: {
  seed: string;
  classArtIndex: number | null;
  className?: string;
}) {
  const art = useMemo(
    () =>
      classArtIndex == null
        ? generateClassArt(seed)
        : getClassArtByIndex(classArtIndex),
    [seed, classArtIndex]
  );

  return (
    <div
      data-testid="class-art"
      role="img"
      aria-label={art.credit}
      title={formatClassArtCredit(art.credit)}
      className={cn('block h-full w-full bg-cover bg-no-repeat', className)}
      style={{
        backgroundImage: `url(${art.src})`,
        backgroundPosition: art.backgroundPosition,
      }}
    />
  );
}
