import type { LoungeAvatar as Avatar } from '~/domain/lounge/lounge.server';
import { cn } from '~/utils/misc';

const SIZES = { sm: 'h-6 w-6 text-[10px]', md: 'h-9 w-9 text-xs', lg: 'h-11 w-11 text-sm' } as const;

/**
 * Initials in a circle. Decorative: the name always appears next to it, so
 * screen readers skip it. The YAWP! team uses the page's ink, which flips
 * with the theme; everyone else keeps a stable muted tone.
 */
export function LoungeAvatar({
  avatar,
  size = 'lg',
  className,
}: {
  avatar: Avatar;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      style={avatar.isStaff ? undefined : { backgroundColor: avatar.tone }}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full font-medium',
        avatar.isStaff ? 'bg-foreground text-background' : 'text-white',
        SIZES[size],
        className
      )}
    >
      {avatar.initials}
    </span>
  );
}
