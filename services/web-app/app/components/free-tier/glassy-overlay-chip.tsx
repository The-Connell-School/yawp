import { Lock, Plus } from 'lucide-react';
import { cn } from '~/utils/misc';

/** Frosted chip on assignment tiles and teacher class-card menu overlay. */
export function freeTierGlassyOverlayChipClassName(extra?: string) {
  return cn(
    'rounded-full bg-white/[0.97] backdrop-blur-sm shadow-[0_1px_4px_0_hsl(0_0%_0%/0.16),0_0_0_1px_hsl(0_0%_0%/0.12)]',
    extra
  );
}

const GLASSY_CHIP_ICON_CLASS = 'text-slate-800';

export function GlassyOverlayChipLockIcon() {
  return <Lock size={14} aria-hidden className={GLASSY_CHIP_ICON_CLASS} />;
}

export function GlassyOverlayChipPlusIcon() {
  return <Plus size={14} aria-hidden className={GLASSY_CHIP_ICON_CLASS} />;
}
