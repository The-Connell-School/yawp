import type { ThesisDeckLink } from '~/domain/thesis-essay-decks/thesis-essay-decks';
import { cn } from '~/utils/misc';

const THESIS_LINK_TEXT: Record<ThesisDeckLink['kind'], { prefix: string; type: string }> = {
  present: { prefix: 'Present', type: 'on YAWP!' },
  'google-slides': { prefix: 'Google Slides', type: 'make a copy' },
  deck: { prefix: 'PowerPoint', type: '.pptx' },
  'lesson-plan': { prefix: 'Lesson plan', type: '.pdf' },
  handout: { prefix: 'Handout', type: '.pdf' },
};

/**
 * A lesson's deck, three ways (present it here, copy it into Google Slides,
 * download it for PowerPoint), then its lesson plan and handouts, as links
 * styled like small buttons. Presenting is the loudest: it always looks
 * exactly as designed. Used on the assignment type's Modules and on the
 * Faculty Lounge's Trainings.
 */
export function ThesisDeckLinks({ links }: { links: ThesisDeckLink[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {links.map((link) => {
        const text = THESIS_LINK_TEXT[link.kind];
        const isPresent = link.kind === 'present';
        const isDownload = link.kind !== 'present' && link.kind !== 'google-slides';
        return (
          <a
            key={link.href}
            href={link.href}
            {...(isDownload ? { download: true } : {})}
            {...(link.kind === 'google-slides' ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium',
              isPresent
                ? 'bg-primary text-primary-foreground hover:opacity-90'
                : 'border bg-background text-foreground hover:bg-accent'
            )}
          >
            {link.kind === 'handout' ? link.label : `${text.prefix}: ${link.label}`}
            <span className={cn('text-xs', isPresent ? 'opacity-80' : 'text-muted-foreground')}>
              ({text.type})
            </span>
          </a>
        );
      })}
    </div>
  );
}
