import { useMemo } from 'react';
import { resolveClassArtSelection, formatClassArtCredit } from '~/utils/class-art';
import { cn } from '~/utils/misc';

export function ClassArt({
  seed,
  classArtKey,
  legacyClassArtIndex = null,
  className,
}: {
  seed: string;
  classArtKey: string | null;
  legacyClassArtIndex?: number | null;
  className?: string;
}) {
  const art = useMemo(
    () =>
      resolveClassArtSelection({
        classArtKey,
        legacyClassArtIndex,
        seed,
      }),
    [seed, classArtKey, legacyClassArtIndex]
  );

  return (
    <div
      data-testid="class-art"
      data-class-art-key={art.key}
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
