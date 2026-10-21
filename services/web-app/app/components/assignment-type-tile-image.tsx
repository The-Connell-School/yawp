import { cn } from '~/utils/misc';

export function AssignmentTypeTileImage({
  imageId,
  alt = '',
  imageTitle,
  className,
}: {
  imageId?: string | null;
  alt?: string;
  /** Photo credit or descriptive catalog metadata (maps to img title). */
  imageTitle?: string | null;
  className?: string;
}) {
  if (imageId) {
    return (
      <img
        src={`/api/image/course/${imageId}`}
        alt={alt}
        title={imageTitle ?? undefined}
        className={cn('object-cover', className)}
      />
    );
  }
  return (
    <div
      className={cn(
        'bg-gradient-to-br from-foreground/5 to-foreground/20',
        className
      )}
      aria-hidden
    />
  );
}
