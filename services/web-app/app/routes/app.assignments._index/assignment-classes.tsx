import { Badge } from '~/components/ui/badge';
import { Tooltip } from '~/components/ui/tooltip';

export type AssignmentClass = { id: string; label: string };

/**
 * Class labels already carry their own separators ("Honors · Grade 10th •
 * Period 2nd"), so joining several with commas reads as one run-on string.
 * Each class gets its own chip instead, and past the first two the rest
 * collapse into a "+N" the teacher can hover or focus to read.
 */
export const VISIBLE_CLASS_CHIPS = 2;

export function AssignmentClasses({ classes }: { classes: AssignmentClass[] }) {
  const visible = classes.slice(0, VISIBLE_CLASS_CHIPS);
  const hidden = classes.slice(VISIBLE_CLASS_CHIPS);

  return (
    <div className="flex flex-wrap items-center gap-1">
      {visible.map((klass) => (
        <Badge
          key={klass.id}
          variant="secondary"
          size="sm"
          className="whitespace-nowrap font-normal"
        >
          {klass.label}
        </Badge>
      ))}
      {hidden.length > 0 ? (
        <Tooltip
          text={
            <ul className="space-y-0.5">
              {hidden.map((klass) => (
                <li key={klass.id}>{klass.label}</li>
              ))}
            </ul>
          }
        >
          {/* A real button so the collapsed classes are reachable by keyboard,
              not by hover alone. The label carries them for screen readers,
              which never see the tooltip. Styled as a pill to sit with the
              class chips rather than read as loose text beside them. */}
          <button
            type="button"
            className="inline-flex items-center whitespace-nowrap rounded-full border border-dashed border-muted-foreground/40 px-1.5 py-0.5 text-xs font-normal text-muted-foreground transition-colors hover:bg-secondary hover:text-secondary-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            aria-label={`Also assigned to ${hidden
              .map((klass) => klass.label)
              .join(', ')}`}
          >
            +{hidden.length} more
          </button>
        </Tooltip>
      ) : null}
    </div>
  );
}
