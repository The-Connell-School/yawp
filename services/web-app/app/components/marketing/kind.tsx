import { BookOpen, Camera, Film } from 'lucide-react';

/** Short names for a job's deliverable, for badges and table cells. */
export const MARKETING_KIND_LABELS: Record<string, string> = {
  GUIDE: 'Guide',
  CLIP: 'Clip',
  STILLS: 'Stills',
};

export function marketingKindLabel(kind: string): string {
  return MARKETING_KIND_LABELS[kind] ?? 'Stills';
}

export function KindGlyph({
  kind,
  className,
}: {
  kind: string;
  className?: string;
}) {
  if (kind === 'GUIDE') return <BookOpen className={className} aria-hidden />;
  if (kind === 'CLIP') return <Film className={className} aria-hidden />;
  return <Camera className={className} aria-hidden />;
}
