/**
 * A piece of teaching material, as a thing rather than as text to copy out.
 *
 * The teacher's next move is almost always the same — put it in the stack so
 * it prints — so that button is the loudest part of the card. The material
 * itself is collapsed by default: a lesson with a handout, a sample paragraph
 * and an exit ticket should still read as a lesson.
 */
import { useState } from 'react';
import {
  ChevronDown,
  ClipboardCheck,
  FileText,
  Key,
  ListChecks,
  NotebookPen,
  Plus,
  Check,
  PenLine,
  TriangleAlert,
  Presentation,
} from 'lucide-react';
import { MarkdownContent } from './assistant-markdown';
import {
  MATERIAL_KIND_LABELS,
  materialAnchor,
  type ArtifactKind,
  type LessonMaterial,
} from '~/domain/lesson-planner/lesson-material';
import { cn } from '~/utils/misc';

const KIND_ICON: Record<ArtifactKind, typeof FileText> = {
  handout: FileText,
  sample: PenLine,
  'exit-ticket': ClipboardCheck,
  'answer-key': Key,
  rubric: ListChecks,
  notes: NotebookPen,
  // A deck is drawn by the deck card, never here; present for completeness.
  slides: Presentation,
};

export function MaterialCard({
  material,
  added,
  onToggle,
  disabled,
}: {
  material: LessonMaterial;
  added: boolean;
  /** Absent while the reply is still unsaved and has no id to attach to. */
  onToggle: ((added: boolean) => void) | null;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const Icon = KIND_ICON[material.kind];

  return (
    <div
      id={materialAnchor(material.key)}
      data-testid="material-card"
      data-material-kind={material.kind}
      // scroll-mt keeps the card clear of the sticky header when the plan
      // links to it; the ring is how it says "this is the one".
      className="scroll-mt-24 overflow-hidden rounded-xl border border-border bg-background target:ring-2 target:ring-primary/40"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.06] text-muted-foreground">
          <Icon size={15} />
        </span>
        <button
          type="button"
          onClick={() => setOpen((wasOpen) => !wasOpen)}
          aria-expanded={open}
          className="min-w-0 flex-1 text-left"
        >
          <p
            className="line-clamp-2 break-words text-sm font-semibold"
            title={material.title}
          >
            {material.title}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {MATERIAL_KIND_LABELS[material.kind]}
            {material.audience === 'student' ? ' · for students' : ''}
          </p>
        </button>
        <ChevronDown
          size={15}
          aria-hidden
          className={cn(
            'shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-180'
          )}
        />
        {onToggle ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onToggle(!added)}
            data-testid="material-toggle"
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-50',
              added
                ? 'bg-primary/10 text-primary hover:bg-primary/15'
                : 'bg-primary text-primary-foreground hover:opacity-90'
            )}
          >
            {added ? <Check size={14} /> : <Plus size={14} />}
            {added ? 'In the stack' : 'Add to stack'}
          </button>
        ) : null}
      </div>
      {material.checkQuotes ? (
        // Outside the collapsed body on purpose: the teacher adds a handout to
        // the stack from the header, usually without opening it.
        <p
          data-testid="material-check-quotes"
          className="flex items-start gap-2 border-t border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200"
        >
          <TriangleAlert size={13} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            The planner quoted this text from memory, without the book in front
            of it. Check each quote against your edition before you print.
          </span>
        </p>
      ) : null}
      {open ? (
        <div className="border-t bg-foreground/[0.02] px-4 py-3">
          <MarkdownContent content={material.content} />
        </div>
      ) : null}
    </div>
  );
}
