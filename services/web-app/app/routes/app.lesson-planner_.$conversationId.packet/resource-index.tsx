/**
 * The lesson's contents: every resource the teacher saved while planning,
 * listed so they can jump straight to one instead of scrolling the document.
 *
 * This is what turns the packet page from a printout into storage — the chat
 * is where materials get made, and this is where they get found again.
 */
import { FileText, Presentation, Rows } from 'lucide-react';
import { cn } from '~/utils/misc';
import type {
  PacketOutlineEntry,
  PacketSectionKind,
} from '~/domain/lesson-planner/lesson-packet';

export const KIND_LABEL: Record<PacketSectionKind, string> = {
  plan: 'Plan',
  handout: 'Handout',
  slides: 'Slides',
};

export function KindIcon({
  kind,
  size = 13,
}: {
  kind: PacketSectionKind;
  size?: number;
}) {
  if (kind === 'handout') return <FileText size={size} className="shrink-0" />;
  if (kind === 'slides')
    return <Presentation size={size} className="shrink-0" />;
  return <Rows size={size} className="shrink-0" />;
}

export type ResourceFilter = 'all' | PacketSectionKind;

/**
 * Which filters to offer. Only kinds the lesson actually contains, so a plan
 * with no handouts does not advertise an empty tab.
 */
export function availableFilters(
  entries: Array<{ kind: PacketSectionKind }>
): ResourceFilter[] {
  const kinds = new Set(entries.map((entry) => entry.kind));
  return [
    'all',
    ...(['plan', 'handout', 'slides'] as const).filter((kind) =>
      kinds.has(kind)
    ),
  ];
}

export function ResourceIndex({
  entries,
  filter,
  onFilter,
  onJump,
}: {
  entries: PacketOutlineEntry[];
  filter: ResourceFilter;
  onFilter: (next: ResourceFilter) => void;
  onJump: (anchor: string) => void;
}) {
  const filters = availableFilters(entries);
  const visible =
    filter === 'all'
      ? entries
      : entries.filter((entry) => entry.kind === filter);

  return (
    <nav
      aria-label="Lesson contents"
      data-testid="resource-index"
      className="print:hidden"
    >
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        In this lesson
      </p>

      {filters.length > 2 ? (
        <div className="mb-3 flex flex-wrap gap-1">
          {filters.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={filter === option}
              onClick={() => onFilter(option)}
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs font-medium text-muted-foreground transition hover:border-primary hover:text-primary',
                {
                  'border-primary bg-primary/10 text-primary':
                    filter === option,
                }
              )}
            >
              {option === 'all' ? 'All' : KIND_LABEL[option]}
            </button>
          ))}
        </div>
      ) : null}

      <ol className="flex flex-col gap-0.5">
        {visible.map((entry) => (
          <li key={entry.anchor}>
            <button
              type="button"
              onClick={() => onJump(entry.anchor)}
              className="flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
            >
              <span className="mt-0.5 text-muted-foreground/70">
                <KindIcon kind={entry.kind} />
              </span>
              {/* Two lines, not one: "Diagnose & Repair — 3 ex…" and "Diagnose &
                  Repair — what…" are indistinguishable truncated. */}
              <span
                className="line-clamp-2 min-w-0 flex-1 break-words"
                title={entry.title}
              >
                {entry.title}
              </span>
              {entry.minutes !== null ? (
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground/70">
                  {entry.minutes}m
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ol>

      {visible.length === 0 ? (
        <p className="px-2 py-1.5 text-sm text-muted-foreground">
          Nothing of that kind saved yet.
        </p>
      ) : null}
    </nav>
  );
}
