import { cn } from '~/utils/misc';

export function AssignmentTypeTileImage({
  imageId,
  alt = '',
  className,
}: {
  imageId?: string | null;
  alt?: string;
  className?: string;
}) {
  if (imageId) {
    return (
      <img
        src={`/api/image/course/${imageId}`}
        alt={alt}
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
