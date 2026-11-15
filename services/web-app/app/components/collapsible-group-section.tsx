import type { ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '~/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '~/components/ui/collapsible';

type CollapsibleGroupSectionProps = {
  /** The group's name; rendered as the heading unless `labelContent` is given. */
  label: string;
  /** Replaces the plain label, e.g. the status badge on the Documents page. */
  labelContent?: ReactNode;
  /** Rows in the group, shown in a badge beside the heading. */
  count: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
} & { [dataAttribute: `data-${string}`]: string | undefined };

/**
 * One section of a grouped list: a card whose heading names the group, counts
 * its rows and collapses it. This is the grouping the Documents page uses
 * ("Group by class / student / assignment / status"); lists that group their
 * rows use it too, so every grouped list in the teacher app reads the same.
 */
export function CollapsibleGroupSection({
  label,
  labelContent,
  count,
  open,
  onOpenChange,
  children,
  ...dataAttributes
}: CollapsibleGroupSectionProps) {
  return (
    <Collapsible
      open={open}
      onOpenChange={onOpenChange}
      className="overflow-hidden rounded-lg border bg-background shadow-sm"
      {...dataAttributes}
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-3 bg-muted/70 px-4 py-3 text-left transition-colors hover:bg-muted"
        >
          {open ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          {labelContent ?? (
            <span className="text-base font-semibold text-foreground">
              {label}
            </span>
          )}
          <Badge variant="secondary" className="ml-1">
            {count}
          </Badge>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-t bg-muted/50">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}
